// US-17 / US-34 : étape intermédiaire entre le mot de passe et le code TOTP.
// Après un mot de passe correct, un jeton « MFA » signé (5 min, cookie httpOnly limité à /api/auth)
// prouve que la première étape est réussie. Aucune session n'est ouverte avant le second facteur.
const jwt = require('jsonwebtoken');
const config = require('../config');

const ROLES_MFA = ['PRATICIEN', 'ADMIN'];   // second facteur obligatoire pour ces rôles
const COOKIE = 'medlink_mfa';
const DUREE_MIN = 5;

// but = 'verification' (MFA déjà activé) ou 'enrolement' (première connexion : scanner le QR code)
function poserJetonMfa(res, idUtilisateur, but) {
  const jeton = jwt.sign({ sub: idUtilisateur, but }, config.jwtSecret, { algorithm: 'HS256', expiresIn: `${DUREE_MIN}m` });
  res.cookie(COOKIE, jeton, {
    httpOnly: true, secure: config.isProd, sameSite: 'strict', path: '/api/auth', maxAge: DUREE_MIN * 60 * 1000,
  });
}

function lireJetonMfa(req, but) {
  const jeton = req.cookies && req.cookies[COOKIE];
  if (!jeton) return null;
  try {
    const p = jwt.verify(jeton, config.jwtSecret, { algorithms: ['HS256'] });
    return p.but === but ? p.sub : null;
  } catch {
    return null;
  }
}

const effacerJetonMfa = (res) => res.clearCookie(COOKIE, { path: '/api/auth' });

module.exports = { ROLES_MFA, poserJetonMfa, lireJetonMfa, effacerJetonMfa };
