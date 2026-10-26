// requireAuth : refuse (401) sans session valide.
//   - jeton d'accès expiré (5 min)      -> 401 { code: 'ACCES_EXPIRE' } : le client appelle /api/auth/refresh
//   - session révoquée ou inactive 15 min -> 401 { code: 'SESSION_EXPIREE' } : nouvelle connexion
// requireRole('AGENT_ADMIN', 'ADMIN') : refuse (403) si le rôle ne fait pas partie de la liste.
const { readAccess, touchSession, clearCookies } = require('../security/session');

async function requireAuth(req, res, next) {
  const { user, error } = readAccess(req);
  if (error === 'expire') {
    return res.status(401).json({ code: 'ACCES_EXPIRE', message: "Jeton d'accès expiré" });
  }
  if (!user || !(await touchSession(user.sid))) {
    clearCookies(res);
    return res.status(401).json({ code: 'SESSION_EXPIREE', message: 'Session expirée, veuillez vous reconnecter' });
  }
  req.user = user;
  return next();
}

const requireRole = (...roles) => [
  requireAuth,
  (req, res, next) => (roles.includes(req.user.role)
    ? next()
    : res.status(403).json({ message: 'Accès interdit' })),
];

module.exports = { requireAuth, requireRole };
