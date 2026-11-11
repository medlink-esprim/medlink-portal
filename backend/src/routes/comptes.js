// US-27 : création des comptes praticien / agent par le back-office.
// Sprint 2 (US-18) : un praticien est affecté à une ou plusieurs cliniques dès sa création
// (la modification des affectations arrive au Sprint 4, US-29).
// Montée sur /api/comptes : GET /cliniques, GET /, POST /
const express = require('express');
const Joi = require('joi');
const db = require('../db');
const validate = require('../middleware/validate');
const { requirePermission } = require('../middleware/auth');
const { issueToken } = require('../security/tokens');
const mailer = require('../services/mailer');

const router = express.Router();
router.use(requirePermission('COMPTES_GERER'));   // toutes les routes du back-office

router.get('/cliniques', async (req, res) => {
  const { rows } = await db.query('SELECT id_clinique, nom, ville FROM cliniques ORDER BY ville');
  res.json(rows);
});

router.get('/', async (req, res) => {
  const { rows } = await db.query(
    `SELECT u.nom, u.prenom, r.code AS role, u.statut, u.date_creation
       FROM utilisateurs u JOIN roles r USING (id_role)
      WHERE r.code <> 'PATIENT'
      ORDER BY u.date_creation DESC LIMIT 10`,
  );
  res.json(rows);
});

const schema = Joi.object({
  nom: Joi.string().trim().min(1).max(80).required(),
  prenom: Joi.string().trim().min(1).max(80).required(),
  email: Joi.string().trim().lowercase().email().max(160).required(),
  telephone: Joi.string().trim().pattern(/^\+?[0-9 ]{8,20}$/).allow(''),
  role: Joi.string().valid('PRATICIEN', 'AGENT_ADMIN').required(),
  idClinique: Joi.when('role', { is: 'AGENT_ADMIN', then: Joi.string().guid().required(), otherwise: Joi.forbidden() }),
  specialite: Joi.when('role', { is: 'PRATICIEN', then: Joi.string().trim().max(60).required(), otherwise: Joi.forbidden() }),
  cliniques: Joi.when('role', {
    is: 'PRATICIEN',
    then: Joi.array().items(Joi.string().guid()).min(1).max(10).unique().required(),
    otherwise: Joi.forbidden(),
  }),
  numeroOrdre: Joi.when('role', { is: 'PRATICIEN', then: Joi.string().trim().max(20).allow(''), otherwise: Joi.forbidden() }),
  fonction: Joi.when('role', { is: 'AGENT_ADMIN', then: Joi.string().trim().max(60).allow(''), otherwise: Joi.forbidden() }),
});

router.post('/', validate(schema), async (req, res) => {
  const b = req.body;
  if (b.role === 'PRATICIEN') {
    const { rows } = await db.query('SELECT count(*)::int AS n FROM cliniques WHERE id_clinique = ANY($1::uuid[])', [b.cliniques]);
    if (rows[0].n !== b.cliniques.length) return res.status(422).json({ message: 'Clinique inconnue' });
  }
  const result = await db.withTransaction(async (client) => {
    const exists = await client.query('SELECT 1 FROM utilisateurs WHERE email = $1', [b.email]);
    if (exists.rowCount) return null;

    // compte créé SANS mot de passe : l'utilisateur le choisit lui-même à l'activation
    const { rows } = await client.query(
      `INSERT INTO utilisateurs (id_role, nom, prenom, email, telephone)
       VALUES ((SELECT id_role FROM roles WHERE code = $1), $2, $3, $4, $5)
       RETURNING id_utilisateur`,
      [b.role, b.nom, b.prenom, b.email, b.telephone || null],
    );
    const id = rows[0].id_utilisateur;
    if (b.role === 'PRATICIEN') {
      await client.query(
        'INSERT INTO praticiens (id_utilisateur, specialite, numero_ordre) VALUES ($1, $2, $3)',
        [id, b.specialite, b.numeroOrdre || null],
      );
      await client.query(
        `INSERT INTO praticien_clinique (id_praticien, id_clinique)
         SELECT $1, c.id_clinique FROM cliniques c WHERE c.id_clinique = ANY($2::uuid[])`,
        [id, b.cliniques],
      );
    } else {
      await client.query(
        'INSERT INTO personnels (id_utilisateur, fonction, id_clinique) VALUES ($1, $2, $3)',
        [id, b.fonction || 'Agent administratif', b.idClinique],
      );
    }
    const token = await issueToken(client, id, 'activation', 72 * 60);
    return { id, token };
  });

  if (!result) return res.status(409).json({ message: 'Un compte existe déjà avec cette adresse e-mail' });
  await mailer.sendActivation(b.email, b.prenom, result.token);
  return res.status(201).json({ message: 'Compte créé, invitation envoyée', id: result.id });
});

module.exports = router;
