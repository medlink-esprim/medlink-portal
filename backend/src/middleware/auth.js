// requireAuth : refuse (401) sans session valide.
//   - jeton d'accès expiré (5 min)        -> 401 { code: 'ACCES_EXPIRE' } : le client appelle /api/auth/refresh
//   - session révoquée ou inactive 15 min -> 401 { code: 'SESSION_EXPIREE' } : nouvelle connexion
// requireRole('PATIENT') : refuse (403) si le rôle ne fait pas partie de la liste (US-39).
// refuser(req, res, raison) : 403 journalisé, utilisé par les routes qui vérifient la PROPRIÉTÉ
//   d'une ressource (un patient ne voit que ses rendez-vous, un praticien que ses plages).
const { readAccess, touchSession, clearCookies } = require('../security/session');
const { journaliser } = require('../security/journal');

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

function refuser(req, res, raison) {
  journaliser('ACCES_REFUSE', req, { raison });
  return res.status(403).json({ message: 'Accès interdit' });
}

const requireRole = (...roles) => [
  requireAuth,
  (req, res, next) => (roles.includes(req.user.role)
    ? next()
    : refuser(req, res, `rôle ${req.user.role} non autorisé (attendu : ${roles.join(', ')})`)),
];

module.exports = { requireAuth, requireRole, refuser };
