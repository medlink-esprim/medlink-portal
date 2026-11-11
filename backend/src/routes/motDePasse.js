// US-03 : mot de passe oublié et réinitialisation.
// Montée sur /api/auth : POST /mot-de-passe-oublie, POST /reinitialisation
const express = require('express');
const Joi = require('joi');
const argon2 = require('argon2');
const db = require('../db');
const validate = require('../middleware/validate');
const { checkPassword } = require('../security/passwordPolicy');
const { issueToken, findValidToken, consumeToken } = require('../security/tokens');
const { revokeAllSessions } = require('../security/session');
const { reinitialiserEchecs } = require('../security/bruteforce');
const mailer = require('../services/mailer');

const router = express.Router();
const GENERIC = { message: 'Si un compte correspond à cette adresse, un e-mail vient d\'être envoyé.' };

const emailSchema = Joi.object({ email: Joi.string().trim().lowercase().email().max(160).required() });

router.post('/mot-de-passe-oublie', validate(emailSchema), async (req, res) => {
  const { email } = req.body;
  const result = await db.withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT id_utilisateur, prenom FROM utilisateurs
        WHERE email = $1 AND statut = 'actif' AND email_verifie`,
      [email],
    );
    if (!rows[0]) return null;
    const { id_utilisateur: id, prenom } = rows[0];
    // un seul lien valide à la fois : les anciens jetons sont invalidés
    await client.query(
      `UPDATE jetons_securite SET utilise = true
        WHERE id_utilisateur = $1 AND type = 'reinitialisation' AND NOT utilise`,
      [id],
    );
    const token = await issueToken(client, id, 'reinitialisation', 30);
    return { prenom, token };
  });

  if (result) await mailer.sendReset(email, result.prenom, result.token);
  return res.status(202).json(GENERIC);   // toujours la même réponse
});

const resetSchema = Joi.object({
  token: Joi.string().max(100).required(),
  password: Joi.string().max(128).required(),
});

router.post('/reinitialisation', validate(resetSchema), async (req, res) => {
  const { token, password } = req.body;
  const outcome = await db.withTransaction(async (client) => {
    const found = await findValidToken(client, token, 'reinitialisation');
    if (!found) return { status: 400, body: { message: 'Lien invalide, expiré ou déjà utilisé' } };

    // la politique est vérifiée AVANT de consommer le jeton : un refus ne « brûle » pas le lien
    const regles = checkPassword(password, { email: found.email });
    if (regles.length) return { status: 422, body: { message: 'Mot de passe non conforme', regles } };

    await consumeToken(client, token, 'reinitialisation');
    const hash = await argon2.hash(password, { type: argon2.argon2id });
    await client.query('UPDATE utilisateurs SET mot_de_passe_hash = $1 WHERE id_utilisateur = $2', [hash, found.id_utilisateur]);
    await revokeAllSessions(client, found.id_utilisateur);
    await reinitialiserEchecs(found.id_utilisateur, client);   // US-41 : la réinitialisation déverrouille le compte   // US-40 : les sessions ouvertes sont fermées
    return { status: 200, body: { message: 'Mot de passe modifié' } };
  });
  return res.status(outcome.status).json(outcome.body);
});

module.exports = router;
