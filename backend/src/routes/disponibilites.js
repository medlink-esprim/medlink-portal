// US-18 : un praticien publie ses plages de consultation par clinique ; les créneaux sont générés.
// Montée sur /api/disponibilites (rôle PRATICIEN) : GET /cliniques, GET /, POST /
// Les heures sont celles de la Tunisie (Africa/Tunis), stockées en TIMESTAMPTZ.
const express = require('express');
const Joi = require('joi');
const db = require('../db');
const validate = require('../middleware/validate');
const { requirePermission, refuser } = require('../middleware/auth');

const router = express.Router();
router.use(requirePermission('DISPONIBILITES_GERER'));   // US-39 : toutes ces routes sont réservées aux praticiens

const dateIso = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).custom((v, helpers) => (
  new Date(`${v}T00:00:00Z`).toISOString().startsWith(v) ? v : helpers.error('any.invalid')
), 'date du calendrier');
const heure = Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/);

// Cliniques où le praticien est affecté par l'administration
router.get('/cliniques', async (req, res) => {
  const { rows } = await db.query(
    `SELECT c.id_clinique, c.nom, c.ville
       FROM praticien_clinique pc JOIN cliniques c USING (id_clinique)
      WHERE pc.id_praticien = $1 ORDER BY c.ville`,
    [req.user.id],
  );
  res.json(rows);
});

// Plages encore valides du praticien connecté (jamais celles d'un autre : filtre sur req.user.id)
router.get('/', async (req, res) => {
  const { rows } = await db.query(
    `SELECT p.id_plage, c.ville, c.nom AS clinique, p.jour_semaine,
            to_char(p.heure_debut, 'HH24:MI') AS heure_debut, to_char(p.heure_fin, 'HH24:MI') AS heure_fin,
            p.duree_creneau, to_char(p.date_debut, 'YYYY-MM-DD') AS date_debut, to_char(p.date_fin, 'YYYY-MM-DD') AS date_fin,
            count(cr.id_creneau) FILTER (WHERE cr.debut > now())::int AS creneaux_a_venir,
            count(cr.id_creneau) FILTER (WHERE cr.debut > now() AND cr.statut = 'reserve')::int AS creneaux_reserves
       FROM plages_disponibilite p
       JOIN cliniques c USING (id_clinique)
       LEFT JOIN creneaux cr USING (id_plage)
      WHERE p.id_praticien = $1 AND p.date_fin >= (now() AT TIME ZONE 'Africa/Tunis')::date
      GROUP BY p.id_plage, c.ville, c.nom
      ORDER BY p.jour_semaine, p.heure_debut`,
    [req.user.id],
  );
  res.json(rows);
});

const schema = Joi.object({
  idClinique: Joi.string().guid().required(),
  jourSemaine: Joi.number().integer().min(1).max(7).required(),   // 1 = lundi … 7 = dimanche
  heureDebut: heure.required(),
  heureFin: heure.required(),
  dureeCreneau: Joi.number().valid(15, 20, 30, 45, 60).required(),
  dateDebut: dateIso,                                              // par défaut : aujourd'hui
  dateFin: dateIso.required(),
});

// Génère un créneau toutes les `duree_creneau` minutes, pour chaque jour de la période
// qui tombe le bon jour de la semaine ; les créneaux déjà passés ne sont pas créés.
const SQL_GENERATION = `
  INSERT INTO creneaux (id_plage, debut, fin)
  SELECT p.id_plage,
         (j::date + p.heure_debut + make_interval(mins => k * p.duree_creneau)) AT TIME ZONE 'Africa/Tunis',
         (j::date + p.heure_debut + make_interval(mins => (k + 1) * p.duree_creneau)) AT TIME ZONE 'Africa/Tunis'
    FROM plages_disponibilite p
   CROSS JOIN generate_series(p.date_debut, p.date_fin, interval '1 day') AS j
   CROSS JOIN generate_series(0, floor(extract(epoch FROM p.heure_fin - p.heure_debut) / 60 / p.duree_creneau)::int - 1) AS k
   WHERE p.id_plage = $1
     AND extract(isodow FROM j) = p.jour_semaine
     AND (j::date + p.heure_debut + make_interval(mins => k * p.duree_creneau)) AT TIME ZONE 'Africa/Tunis' > now()`;

router.post('/', validate(schema), async (req, res) => {
  const b = req.body;
  const idPraticien = req.user.id;   // jamais pris dans le corps de la requête

  // US-39 : publier dans une clinique où l'on n'est pas affecté est refusé et journalisé
  const affecte = await db.query(
    'SELECT 1 FROM praticien_clinique WHERE id_praticien = $1 AND id_clinique = $2',
    [idPraticien, b.idClinique],
  );
  if (!affecte.rowCount) return refuser(req, res, `clinique ${b.idClinique} non affectée au praticien`);

  const outcome = await db.withTransaction(async (client) => {
    // un seul enregistrement de plage à la fois par praticien (évite deux plages qui se chevauchent)
    await client.query('SELECT 1 FROM praticiens WHERE id_utilisateur = $1 FOR UPDATE', [idPraticien]);

    const { rows: [c] } = await client.query(
      `WITH v AS (SELECT COALESCE($1::date, (now() AT TIME ZONE 'Africa/Tunis')::date) AS debut,
                         (now() AT TIME ZONE 'Africa/Tunis')::date AS aujourdhui)
       SELECT to_char(v.debut, 'YYYY-MM-DD') AS date_debut,
              v.debut >= v.aujourdhui AS debut_ok,
              $2::date >= v.debut AS ordre_ok,
              $2::date <= v.aujourdhui + 183 AS fin_ok,
              ($4::time - $3::time) >= make_interval(mins => $5) AS duree_ok
         FROM v`,
      [b.dateDebut || null, b.dateFin, b.heureDebut, b.heureFin, b.dureeCreneau],
    );
    if (!c.debut_ok) return { status: 422, body: { message: 'La date de début ne peut pas être dans le passé' } };
    if (!c.ordre_ok) return { status: 422, body: { message: 'La date de fin doit suivre la date de début' } };
    if (!c.fin_ok) return { status: 422, body: { message: 'Une plage ne peut pas dépasser 6 mois' } };
    if (!c.duree_ok) return { status: 422, body: { message: "La plage doit contenir au moins un créneau (fin après début + durée d'un créneau)" } };

    // un praticien ne peut pas être dans deux cliniques à la fois : on refuse tout chevauchement
    const chevauche = await client.query(
      `SELECT 1 FROM plages_disponibilite
        WHERE id_praticien = $1 AND jour_semaine = $2
          AND heure_debut < $4::time AND heure_fin > $3::time
          AND date_debut <= $6::date AND date_fin >= $5::date`,
      [idPraticien, b.jourSemaine, b.heureDebut, b.heureFin, c.date_debut, b.dateFin],
    );
    if (chevauche.rowCount) return { status: 409, body: { message: 'Cette plage chevauche une plage déjà publiée' } };

    const { rows: [plage] } = await client.query(
      `INSERT INTO plages_disponibilite
         (id_praticien, id_clinique, jour_semaine, heure_debut, heure_fin, duree_creneau, date_debut, date_fin)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id_plage`,
      [idPraticien, b.idClinique, b.jourSemaine, b.heureDebut, b.heureFin, b.dureeCreneau, c.date_debut, b.dateFin],
    );
    const generes = await client.query(SQL_GENERATION, [plage.id_plage]);
    return { status: 201, body: { idPlage: plage.id_plage, creneauxGeneres: generes.rowCount } };
  });
  return res.status(outcome.status).json(outcome.body);
});

module.exports = router;
