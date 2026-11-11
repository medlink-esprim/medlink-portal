// requireAuth : refuse (401) sans session valide.
//   - jeton d'accès expiré (5 min)        -> 401 { code: 'ACCES_EXPIRE' } : le client appelle /api/auth/refresh
//   - session révoquée ou inactive 15 min -> 401 { code: 'SESSION_EXPIREE' } : nouvelle connexion
// requireRole('PATIENT') : refuse (403) si le rôle ne fait pas partie de la liste (US-39).
// requirePermission('RDV_PRENDRE') : refuse (403) si le rôle n'a pas reçu cette permission
//   dans la matrice des droits (US-33). C'est la vérification utilisée par les routes.
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

const requirePermission = (code) => [
  requireAuth,
  (req, res, next) => ((req.user.perms || []).includes(code)
    ? next()
    : refuser(req, res, `permission ${code} absente du rôle ${req.user.role}`)),
];

module.exports = { requireAuth, requireRole, requirePermission, refuser };
