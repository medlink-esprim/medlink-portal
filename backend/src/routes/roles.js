// US-33 : matrice des rôles et des droits, gérée par l'administrateur du portail.
// Montée sur /api/admin/roles (permission ROLES_GERER) : GET /, PUT /
// Une modification s'applique à la prochaine connexion (et au plus tard 5 minutes après,
// au renouvellement du jeton d'accès des sessions ouvertes).
const express = require('express');
const Joi = require('joi');
const db = require('../db');
const validate = require('../middleware/validate');
const { requirePermission } = require('../middleware/auth');
const { journaliser } = require('../security/journal');

const router = express.Router();
router.use(requirePermission('ROLES_GERER'));

async function lireMatrice(client = db) {
  const [roles, permissions, liens] = await Promise.all([
    client.query('SELECT code, libelle FROM roles ORDER BY id_role'),
    client.query('SELECT code, description FROM permissions ORDER BY id_permission'),
    client.query(
      `SELECT r.code AS role, p.code AS permission
         FROM role_permission rp JOIN roles r USING (id_role) JOIN permissions p USING (id_permission)`,
    ),
  ]);
  const matrice = Object.fromEntries(roles.rows.map((r) => [r.code, []]));
  for (const l of liens.rows) matrice[l.role].push(l.permission);
  return { roles: roles.rows, permissions: permissions.rows, matrice };
}

router.get('/', async (req, res) => {
  res.json(await lireMatrice());
});

// Corps : { matrice: { PATIENT: ['DOSSIER_PROPRE', 'RDV_PRENDRE'], PRATICIEN: [...], ... } }
const schema = Joi.object({
  matrice: Joi.object().pattern(
    Joi.string().pattern(/^[A-Z_]{2,20}$/),
    Joi.array().items(Joi.string().pattern(/^[A-Z_]{2,60}$/)).unique(),
  ).required(),
});

router.put('/', validate(schema), async (req, res) => {
  const voulue = req.body.matrice;
  // garde-fou : l'administrateur ne peut pas se retirer à lui-même la gestion des droits
  if (voulue.ADMIN && !voulue.ADMIN.includes('ROLES_GERER')) {
    return res.status(422).json({ message: "Le rôle Administrateur doit conserver « Gérer les rôles et les droits »." });
  }

  const outcome = await db.withTransaction(async (client) => {
    const avant = await lireMatrice(client);
    const rolesConnus = new Set(avant.roles.map((r) => r.code));
    const permsConnues = new Set(avant.permissions.map((p) => p.code));
    for (const [role, perms] of Object.entries(voulue)) {
      if (!rolesConnus.has(role) || perms.some((p) => !permsConnues.has(p))) {
        return { status: 422, body: { message: 'Rôle ou permission inconnu' } };
      }
    }
    const changements = [];
    for (const [role, perms] of Object.entries(voulue)) {
      const ajouts = perms.filter((p) => !avant.matrice[role].includes(p));
      const retraits = avant.matrice[role].filter((p) => !perms.includes(p));
      if (!ajouts.length && !retraits.length) continue;
      await client.query('DELETE FROM role_permission WHERE id_role = (SELECT id_role FROM roles WHERE code = $1)', [role]);
      await client.query(
        `INSERT INTO role_permission (id_role, id_permission)
         SELECT r.id_role, p.id_permission FROM roles r, permissions p
          WHERE r.code = $1 AND p.code = ANY($2::text[])`,
        [role, perms],
      );
      changements.push({ role, ajouts, retraits });
    }
    return { status: 200, body: { ...(await lireMatrice(client)), changements } };
  });

  if (outcome.status === 200 && outcome.body.changements.length) {
    journaliser('DROITS_MODIFIES', req, { changements: outcome.body.changements });
  }
  return res.status(outcome.status).json(outcome.body);
});

module.exports = router;
