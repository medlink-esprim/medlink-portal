// US-27 (suite) : activation d'un compte créé par le back-office.
// Montée sur /api/auth : POST /activation
const express = require('express');
const Joi = require('joi');
const argon2 = require('argon2');
const db = require('../db');
const validate = require('../middleware/validate');
const { checkPassword } = require('../security/passwordPolicy');
const { findValidToken, consumeToken } = require('../security/tokens');

const router = express.Router();

const schema = Joi.object({
  token: Joi.string().max(100).required(),
  password: Joi.string().max(128).required(),
});

router.post('/activation', validate(schema), async (req, res) => {
  const { token, password } = req.body;
  const outcome = await db.withTransaction(async (client) => {
    const found = await findValidToken(client, token, 'activation');
    if (!found) return { status: 400, body: { message: 'Lien invalide, expiré ou déjà utilisé' } };

    const regles = checkPassword(password, { email: found.email });
    if (regles.length) return { status: 422, body: { message: 'Mot de passe non conforme', regles } };

    await consumeToken(client, token, 'activation');
    const hash = await argon2.hash(password, { type: argon2.argon2id });
    await client.query(
      `UPDATE utilisateurs SET mot_de_passe_hash = $1, statut = 'actif', email_verifie = true
        WHERE id_utilisateur = $2`,
      [hash, found.id_utilisateur],
    );
    return { status: 200, body: { message: 'Compte activé' } };
  });
  return res.status(outcome.status).json(outcome.body);
});

module.exports = router;
