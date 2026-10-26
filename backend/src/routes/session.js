// US-02 / US-40 : connexion, rafraîchissement, déconnexion et session courante.
// Montée sur /api/auth : POST /login, POST /refresh, POST /logout, GET /me
const express = require('express');
const Joi = require('joi');
const argon2 = require('argon2');
const db = require('../db');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { openSession, refreshSession, closeSession, INACTIVITE_MIN } = require('../security/session');

const router = express.Router();
const INVALID = { message: 'Identifiants invalides' };

// Empreinte factice : on vérifie toujours un mot de passe, même si l'e-mail est inconnu,
// pour que le temps de réponse ne révèle pas l'existence du compte.
let dummyHash;
const getDummyHash = async () => {
  dummyHash = dummyHash || await argon2.hash('compte-inexistant-MedLink-2026!', { type: argon2.argon2id });
  return dummyHash;
};

const loginSchema = Joi.object({
  email: Joi.string().trim().lowercase().email().max(160).required(),
  password: Joi.string().max(128).required(),
});

router.post('/login', validate(loginSchema), async (req, res) => {
  const { email, password } = req.body;
  const { rows } = await db.query(
    `SELECT u.id_utilisateur, u.prenom, u.mot_de_passe_hash, u.statut, u.email_verifie, r.code AS role
       FROM utilisateurs u JOIN roles r USING (id_role)
      WHERE u.email = $1`,
    [email],
  );
  const user = rows[0];
  const hash = (user && user.mot_de_passe_hash) || await getDummyHash();

  let passwordOk = false;
  try {
    passwordOk = await argon2.verify(hash, password);
  } catch {
    passwordOk = false;
  }
  if (!user || !passwordOk || user.statut !== 'actif' || !user.email_verifie) {
    return res.status(401).json(INVALID);   // même message dans tous les cas
  }

  await openSession(res, { id: user.id_utilisateur, role: user.role, prenom: user.prenom });
  return res.json({ role: user.role, prenom: user.prenom });
});

// US-40 : nouveau jeton d'accès, tant que la session n'est ni révoquée ni inactive depuis 15 min
router.post('/refresh', async (req, res) => {
  const user = await refreshSession(req, res);
  if (!user) return res.status(401).json({ code: 'SESSION_EXPIREE', message: 'Session expirée, veuillez vous reconnecter' });
  return res.json(user);
});

router.post('/logout', async (req, res) => {
  await closeSession(req, res);
  res.status(204).end();
});

// Profil affiché dans le menu latéral des espaces connectés
router.get('/me', requireAuth, async (req, res) => {
  const { rows } = await db.query(
    `SELECT u.nom, u.prenom, u.mfa_active, p.numero_dossier, pr.specialite
       FROM utilisateurs u
       LEFT JOIN patients p ON p.id_utilisateur = u.id_utilisateur
       LEFT JOIN praticiens pr ON pr.id_utilisateur = u.id_utilisateur
      WHERE u.id_utilisateur = $1`,
    [req.user.id],
  );
  const u = rows[0] || {};
  res.json({
    id: req.user.id,
    role: req.user.role,
    prenom: u.prenom,
    nom: u.nom,
    numeroDossier: u.numero_dossier || null,
    specialite: u.specialite || null,
    mfaActive: Boolean(u.mfa_active),
    inactiviteMin: INACTIVITE_MIN,
  });
});

module.exports = router;
