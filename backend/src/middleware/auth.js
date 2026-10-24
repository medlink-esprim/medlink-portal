// requireAuth : refuse (401) sans session valide ; renouvelle la session (15 min glissantes).
// requireRole('AGENT_ADMIN', 'ADMIN') : refuse (403) si le rôle ne fait pas partie de la liste.
const { openSession, readSession, closeSession } = require('../security/session');

function requireAuth(req, res, next) {
  const user = readSession(req);
  if (!user) {
    closeSession(res);
    return res.status(401).json({ message: 'Session expirée, veuillez vous reconnecter' });
  }
  req.user = user;
  openSession(res, user);
  return next();
}

const requireRole = (...roles) => [
  requireAuth,
  (req, res, next) => (roles.includes(req.user.role)
    ? next()
    : res.status(403).json({ message: 'Accès interdit' })),
];

module.exports = { requireAuth, requireRole };
