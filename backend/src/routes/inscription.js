// US-01 : inscription d'un patient et vérification de l'adresse e-mail.
// Montée sur /api/auth : POST /inscription, POST /verification
const express = require('express');
const Joi = require('joi');
const argon2 = require('argon2');
const db = require('../db');
const validate = require('../middleware/validate');
const { checkPassword } = require('../security/passwordPolicy');
const { issueToken, consumeToken } = require('../security/tokens');
const mailer = require('../services/mailer');

const router = express.Router();
// Réponse identique que l'e-mail existe ou non : pas d'énumération des comptes.
const GENERIC = { message: 'Si les informations sont valides, un e-mail de vérification vient d\'être envoyé.' };

const inscriptionSchema = Joi.object({
  nom: Joi.string().trim().min(1).max(80).required(),
  prenom: Joi.string().trim().min(1).max(80).required(),
  email: Joi.string().trim().lowercase().email().max(160).required(),
  telephone: Joi.string().trim().pattern(/^\+?[0-9 ]{8,20}$/).required(),
  password: Joi.string().max(128).required(),
});

router.post('/inscription', validate(inscriptionSchema), async (req, res) => {
  const { nom, prenom, email, telephone, password } = req.body;

  const regles = checkPassword(password, { email });
  if (regles.length) {
    return res.status(422).json({ message: 'Mot de passe non conforme', regles });
  }

  const hash = await argon2.hash(password, { type: argon2.argon2id });
  let token = null;
  try {
    token = await db.withTransaction(async (client) => {
      const exists = await client.query('SELECT 1 FROM utilisateurs WHERE email = $1', [email]);
      if (exists.rowCount) return null;

      const { rows } = await client.query(
        `INSERT INTO utilisateurs (id_role, nom, prenom, email, telephone, mot_de_passe_hash)
         VALUES ((SELECT id_role FROM roles WHERE code = 'PATIENT'), $1, $2, $3, $4, $5)
         RETURNING id_utilisateur`,
        [nom, prenom, email, telephone, hash],
      );
      const id = rows[0].id_utilisateur;
      await client.query(
        `INSERT INTO patients (id_utilisateur, numero_dossier)
         VALUES ($1, 'P-' || to_char(now(), 'YY') || '-' || lpad(nextval('patients_numero_seq')::text, 4, '0'))`,
        [id],
      );
      return issueToken(client, id, 'verification_email', 24 * 60);
    });
  } catch (err) {
    if (err.code !== '23505') throw err;    // e-mail inscrit au même instant : même réponse
  }

  if (token) await mailer.sendVerification(email, prenom, token);
  return res.status(202).json(GENERIC);
});

const tokenSchema = Joi.object({ token: Joi.string().max(100).required() });

router.post('/verification', validate(tokenSchema), async (req, res) => {
  const ok = await db.withTransaction(async (client) => {
    const id = await consumeToken(client, req.body.token, 'verification_email');
    if (!id) return false;
    await client.query(
      `UPDATE utilisateurs SET statut = 'actif', email_verifie = true
        WHERE id_utilisateur = $1 AND statut = 'en_attente'`,
      [id],
    );
    return true;
  });
  if (!ok) return res.status(400).json({ message: 'Lien invalide, expiré ou déjà utilisé' });
  return res.json({ message: 'Compte activé' });
});

module.exports = router;
