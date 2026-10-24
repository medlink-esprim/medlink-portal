// Session : jeton JWT signé (HS256) dans un cookie httpOnly.
// Expiration après 15 minutes d'INACTIVITÉ : le cookie est renouvelé à chaque requête authentifiée.
const jwt = require('jsonwebtoken');
const config = require('../config');

const COOKIE = 'medlink_session';
const DURATION_MS = 15 * 60 * 1000;

function openSession(res, user) {
  const token = jwt.sign(
    { sub: user.id, role: user.role, prenom: user.prenom },
    config.jwtSecret,
    { algorithm: 'HS256', expiresIn: '15m' },
  );
  res.cookie(COOKIE, token, {
    httpOnly: true,                 // inaccessible au JavaScript (XSS)
    secure: config.isProd,          // HTTPS uniquement en production
    sameSite: 'strict',             // pas envoyé par un autre site (CSRF)
    maxAge: DURATION_MS,
    path: '/',
  });
}

function readSession(req) {
  const token = req.cookies && req.cookies[COOKIE];
  if (!token) return null;
  try {
    const p = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    return { id: p.sub, role: p.role, prenom: p.prenom };
  } catch {
    return null;
  }
}

function closeSession(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

module.exports = { openSession, readSession, closeSession };
