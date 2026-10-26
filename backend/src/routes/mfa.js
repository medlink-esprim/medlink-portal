// US-17 (praticien) / US-34 (administrateur) : connexion avec second facteur TOTP.
// Montée sur /api/auth :
//   POST /mfa/enrolement               -> secret + QR code (première connexion)
//   POST /mfa/enrolement/confirmation  -> vérifie le 1er code, active le MFA, renvoie 10 codes de secours
//   POST /mfa                          -> code TOTP ou code de secours, puis ouverture de la session
const crypto = require('crypto');
const express = require('express');
const Joi = require('joi');
const QRCode = require('qrcode');
const db = require('../db');
const validate = require('../middleware/validate');
const { lireJetonMfa, effacerJetonMfa } = require('../security/mfa');
const { genererSecret, verifierCode, uriOtpauth } = require('../security/totp');
const { chiffrer, dechiffrer } = require('../security/chiffrement');
const { sha256 } = require('../security/tokens');
const { openSession } = require('../security/session');
const { journaliser } = require('../security/journal');

const router = express.Router();
const EXPIRE = { message: 'Vérification expirée, veuillez vous reconnecter' };
const INVALIDE = { message: 'Code invalide' };
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // sans 0/O ni 1/I : pas de confusion à la saisie

async function lireUtilisateur(id) {
  const { rows } = await db.query(
    `SELECT u.id_utilisateur, u.prenom, u.email, u.statut, u.mfa_active, u.mfa_secret_chiffre, r.code AS role
       FROM utilisateurs u JOIN roles r USING (id_role) WHERE u.id_utilisateur = $1`,
    [id],
  );
  const u = rows[0];
  return u && u.statut === 'actif' ? u : null;
}

// 10 codes de secours de 8 caractères (40 bits chacun), affichés une seule fois
function genererCodesSecours() {
  return Array.from({ length: 10 }, () => {
    const brut = Array.from(crypto.randomBytes(8), (o) => ALPHABET[o % ALPHABET.length]).join('');
    return `${brut.slice(0, 4)}-${brut.slice(4)}`;
  });
}
const normaliser = (code) => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// ---------- enrôlement ----------
router.post('/mfa/enrolement', async (req, res) => {
  const id = lireJetonMfa(req, 'enrolement');
  const user = id && await lireUtilisateur(id);
  if (!user || user.mfa_active) return res.status(401).json(EXPIRE);

  const secret = genererSecret();
  // secret stocké chiffré (US-43) ; il ne devient actif qu'après un premier code correct
  await db.query(
    'UPDATE utilisateurs SET mfa_secret_chiffre = $1 WHERE id_utilisateur = $2 AND NOT mfa_active',
    [chiffrer(secret, user.id_utilisateur), user.id_utilisateur],
  );
  const uri = uriOtpauth(user.email, secret);
  return res.json({ qr: await QRCode.toDataURL(uri, { margin: 1, width: 220 }), secret, compte: user.email });
});

const codeSchema = Joi.object({ code: Joi.string().trim().pattern(/^\d{6}$/).required() });

router.post('/mfa/enrolement/confirmation', validate(codeSchema), async (req, res) => {
  const id = lireJetonMfa(req, 'enrolement');
  const user = id && await lireUtilisateur(id);
  if (!user || user.mfa_active || !user.mfa_secret_chiffre) return res.status(401).json(EXPIRE);

  const secret = dechiffrer(user.mfa_secret_chiffre, user.id_utilisateur);
  if (!verifierCode(secret, req.body.code)) {
    journaliser('MFA_ECHEC', req, { utilisateur: user.id_utilisateur, etape: 'enrolement' });
    return res.status(401).json(INVALIDE);
  }

  const codes = genererCodesSecours();
  await db.withTransaction(async (client) => {
    await client.query('UPDATE utilisateurs SET mfa_active = true WHERE id_utilisateur = $1', [user.id_utilisateur]);
    await client.query("DELETE FROM jetons_securite WHERE id_utilisateur = $1 AND type = 'code_secours'", [user.id_utilisateur]);
    for (const code of codes) {
      await client.query(
        `INSERT INTO jetons_securite (id_utilisateur, type, jeton_hash, expire_le)
         VALUES ($1, 'code_secours', $2, 'infinity')`,
        [user.id_utilisateur, sha256(normaliser(code))],
      );
    }
    await openSession(res, { id: user.id_utilisateur, role: user.role, prenom: user.prenom }, client);
  });
  effacerJetonMfa(res);
  return res.json({ role: user.role, prenom: user.prenom, codesSecours: codes });
});

// ---------- vérification à chaque connexion ----------
const verifSchema = Joi.object({
  code: Joi.string().trim().pattern(/^\d{6}$/),
  codeSecours: Joi.string().trim().max(20),
}).xor('code', 'codeSecours');

router.post('/mfa', validate(verifSchema), async (req, res) => {
  const id = lireJetonMfa(req, 'verification');
  const user = id && await lireUtilisateur(id);
  if (!user || !user.mfa_active) return res.status(401).json(EXPIRE);

  let valide = false;
  let codesRestants;
  if (req.body.code) {
    valide = verifierCode(dechiffrer(user.mfa_secret_chiffre, user.id_utilisateur), req.body.code);
  } else {
    // code de secours : un seul UPDATE … RETURNING => utilisable une seule fois
    const { rowCount } = await db.query(
      `UPDATE jetons_securite SET utilise = true
        WHERE id_utilisateur = $1 AND type = 'code_secours' AND jeton_hash = $2 AND NOT utilise`,
      [user.id_utilisateur, sha256(normaliser(req.body.codeSecours))],
    );
    valide = rowCount === 1;
    if (valide) {
      const { rows } = await db.query(
        "SELECT count(*)::int AS n FROM jetons_securite WHERE id_utilisateur = $1 AND type = 'code_secours' AND NOT utilise",
        [user.id_utilisateur],
      );
      codesRestants = rows[0].n;
    }
  }
  if (!valide) {
    journaliser('MFA_ECHEC', req, { utilisateur: user.id_utilisateur, etape: 'verification' });
    return res.status(401).json(INVALIDE);
  }

  effacerJetonMfa(res);
  await openSession(res, { id: user.id_utilisateur, role: user.role, prenom: user.prenom });
  return res.json({ role: user.role, prenom: user.prenom, codesSecoursRestants: codesRestants });
});

module.exports = router;
