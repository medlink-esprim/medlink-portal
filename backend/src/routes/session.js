// US-02 : connexion, déconnexion et session courante.
// Montée sur /api/auth : POST /login, POST /logout, GET /me
const express = require('express');
const Joi = require('joi');
const argon2 = require('argon2');
const db = require('../db');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { openSession, closeSession } = require('../security/session');

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

  openSession(res, { id: user.id_utilisateur, role: user.role, prenom: user.prenom });
  return res.json({ role: user.role, prenom: user.prenom });
});

router.post('/logout', (req, res) => {
  closeSession(res);
  res.status(204).end();
});

router.get('/me', requireAuth, (req, res) => {
  res.json(req.user);
});

module.exports = router;
