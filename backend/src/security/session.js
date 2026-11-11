// US-40 : session = jeton d'accès court (JWT signé, 5 min) + jeton de rafraîchissement révocable.
//  - le jeton d'accès voyage dans le cookie httpOnly « medlink_session » ;
//  - le jeton de rafraîchissement (aléatoire, cookie « medlink_refresh » limité à /api/auth)
//    n'est stocké en base que sous forme d'empreinte SHA-256 (table sessions) ;
//  - l'inactivité est mesurée côté serveur (sessions.derniere_activite) : après 15 minutes
//    sans requête, la session est refusée et il faut se reconnecter.
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db');
const { sha256 } = require('./tokens');

const ACCESS_COOKIE = 'medlink_session';
const REFRESH_COOKIE = 'medlink_refresh';
const ACCES_MIN = 5;          // durée de vie du jeton d'accès
const INACTIVITE_MIN = 15;    // US-40 : expiration après 15 minutes d'inactivité
const DUREE_MAX_H = 8;        // une session ne dépasse jamais 8 heures, même active

const cookieBase = {
  httpOnly: true,             // inaccessible au JavaScript (XSS)
  secure: config.isProd,      // HTTPS uniquement en production
  sameSite: 'strict',         // pas envoyé par un autre site (CSRF)
};

// US-33 : permissions accordées au rôle, lues en base à chaque connexion et à chaque
// renouvellement du jeton d'accès (une modification s'applique donc en 5 minutes au plus).
async function permissionsDuRole(role, client = db) {
  const { rows } = await client.query(
    `SELECT p.code FROM role_permission rp
       JOIN roles r USING (id_role) JOIN permissions p USING (id_permission)
      WHERE r.code = $1 ORDER BY p.code`,
    [role],
  );
  return rows.map((r) => r.code);
}

function setCookies(res, s, refresh) {
  const access = jwt.sign(
    { sub: s.id, sid: s.sid, role: s.role, prenom: s.prenom, perms: s.perms || [] },
    config.jwtSecret,
    { algorithm: 'HS256', expiresIn: `${ACCES_MIN}m` },
  );
  // le cookie vit plus longtemps que le JWT : on distingue ainsi « expiré » de « absent »
  res.cookie(ACCESS_COOKIE, access, { ...cookieBase, path: '/', maxAge: DUREE_MAX_H * 3600 * 1000 });
  res.cookie(REFRESH_COOKIE, refresh, { ...cookieBase, path: '/api/auth', maxAge: DUREE_MAX_H * 3600 * 1000 });
}

function clearCookies(res) {
  res.clearCookie(ACCESS_COOKIE, { path: '/' });
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
}

// Ouvre une session après une authentification réussie (mot de passe, puis code MFA si requis).
async function openSession(res, user, client = db) {
  const refresh = crypto.randomBytes(32).toString('base64url');
  const { rows } = await client.query(
    `INSERT INTO sessions (id_utilisateur, refresh_hash, expire_le)
     VALUES ($1, $2, now() + make_interval(hours => $3))
     RETURNING id_session`,
    [user.id, sha256(refresh), DUREE_MAX_H],
  );
  const perms = await permissionsDuRole(user.role, client);
  setCookies(res, { ...user, sid: rows[0].id_session, perms }, refresh);
}

// Lit le jeton d'accès : { user } si valide, { error: 'absent' | 'expire' | 'invalide' } sinon.
function readAccess(req, { ignoreExpiration = false } = {}) {
  const token = req.cookies && req.cookies[ACCESS_COOKIE];
  if (!token) return { error: 'absent' };
  try {
    const p = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'], ignoreExpiration });
    return { user: { id: p.sub, sid: p.sid, role: p.role, prenom: p.prenom, perms: p.perms || [] } };
  } catch (err) {
    return { error: err.name === 'TokenExpiredError' ? 'expire' : 'invalide' };
  }
}

// Vérifie que la session est toujours ouverte et enregistre l'activité (une requête = une activité).
async function touchSession(sid) {
  const { rowCount } = await db.query(
    `UPDATE sessions SET derniere_activite = now()
      WHERE id_session = $1 AND NOT revoquee AND expire_le > now()
        AND derniere_activite > now() - make_interval(mins => $2)`,
    [sid, INACTIVITE_MIN],
  );
  return rowCount === 1;
}

// POST /api/auth/refresh : nouveau jeton d'accès + rotation du jeton de rafraîchissement.
async function refreshSession(req, res) {
  const token = req.cookies && req.cookies[REFRESH_COOKIE];
  if (!token) return null;
  const nouveau = crypto.randomBytes(32).toString('base64url');
  const { rows } = await db.query(
    `UPDATE sessions s SET refresh_hash = $2, derniere_activite = now()
       FROM utilisateurs u JOIN roles r USING (id_role)
      WHERE s.refresh_hash = $1 AND u.id_utilisateur = s.id_utilisateur
        AND NOT s.revoquee AND s.expire_le > now()
        AND s.derniere_activite > now() - make_interval(mins => $3)
        AND u.statut = 'actif'
      RETURNING s.id_session, u.id_utilisateur, u.prenom, r.code AS role`,
    [sha256(token), sha256(nouveau), INACTIVITE_MIN],
  );
  if (!rows[0]) return null;
  const user = { id: rows[0].id_utilisateur, role: rows[0].role, prenom: rows[0].prenom };
  const perms = await permissionsDuRole(user.role);
  setCookies(res, { ...user, sid: rows[0].id_session, perms }, nouveau);
  return user;
}

// Déconnexion : la session est révoquée en base (le jeton de rafraîchissement devient inutilisable).
async function closeSession(req, res) {
  const { user } = readAccess(req, { ignoreExpiration: true });
  const refresh = req.cookies && req.cookies[REFRESH_COOKIE];
  if (user && user.sid) {
    await db.query('UPDATE sessions SET revoquee = true WHERE id_session = $1', [user.sid]);
  } else if (refresh) {
    await db.query('UPDATE sessions SET revoquee = true WHERE refresh_hash = $1', [sha256(refresh)]);
  }
  clearCookies(res);
}

// Révoque toutes les sessions d'un utilisateur (ex. après un changement de mot de passe).
async function revokeAllSessions(client, userId) {
  await client.query('UPDATE sessions SET revoquee = true WHERE id_utilisateur = $1 AND NOT revoquee', [userId]);
}

module.exports = {
  INACTIVITE_MIN, permissionsDuRole, openSession, readAccess, touchSession, refreshSession, closeSession,
  clearCookies, revokeAllSessions,
};
