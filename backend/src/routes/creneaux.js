// US-06 : créneaux d'un praticien sur une période, triés par date.
// Montée sur /api/creneaux (rôle PATIENT) : GET /?praticien=&clinique=&debut=&fin=, GET /:id
// Les créneaux déjà réservés sont renvoyés avec leur statut (barrés dans la grille, non sélectionnables) ;
// aucune information sur le patient qui les a réservés n'est exposée.
const express = require('express');
const Joi = require('joi');
const db = require('../db');
const { requirePermission } = require('../middleware/auth');

const router = express.Router();
router.use(requirePermission('RDV_PRENDRE'));

const dateIso = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).custom((v, helpers) => (
  new Date(`${v}T00:00:00Z`).toISOString().startsWith(v) ? v : helpers.error('any.invalid')
), 'date du calendrier');

const schema = Joi.object({
  praticien: Joi.string().guid().required(),
  clinique: Joi.string().guid().allow(''),
  debut: dateIso,
  fin: dateIso,
});

router.get('/', async (req, res) => {
  const { error, value } = schema.validate(req.query, { stripUnknown: true });
  if (error) return res.status(400).json({ message: 'Paramètres de recherche invalides' });

  const { rows } = await db.query(
    `WITH periode AS (
       SELECT COALESCE($3::date, (now() AT TIME ZONE 'Africa/Tunis')::date) AS d1,
              COALESCE($4::date, COALESCE($3::date, (now() AT TIME ZONE 'Africa/Tunis')::date) + 6) AS d2)
     SELECT cr.id_creneau, cr.debut, cr.fin, cr.statut, c.ville, c.nom AS clinique
       FROM creneaux cr
       JOIN plages_disponibilite p USING (id_plage)
       JOIN cliniques c USING (id_clinique)
       CROSS JOIN periode
      WHERE p.id_praticien = $1
        AND ($2::uuid IS NULL OR p.id_clinique = $2)
        AND periode.d2 - periode.d1 BETWEEN 0 AND 31
        AND cr.debut >= periode.d1::timestamp AT TIME ZONE 'Africa/Tunis'
        AND cr.debut <  (periode.d2 + 1)::timestamp AT TIME ZONE 'Africa/Tunis'
        AND cr.debut > now()
        AND cr.statut IN ('libre', 'reserve')
      ORDER BY cr.debut
      LIMIT 500`,
    [value.praticien, value.clinique || null, value.debut || null, value.fin || null],
  );
  res.json(rows);
});

// Récapitulatif d'un créneau (page « Confirmer le rendez-vous »)
router.get('/:id', async (req, res) => {
  if (Joi.string().guid().validate(req.params.id).error) return res.status(404).json({ message: 'Créneau introuvable' });
  const { rows } = await db.query(
    `SELECT cr.id_creneau, cr.debut, cr.fin, cr.statut, c.nom AS clinique, c.ville,
            u.nom, u.prenom, pr.specialite
       FROM creneaux cr
       JOIN plages_disponibilite p USING (id_plage)
       JOIN cliniques c USING (id_clinique)
       JOIN utilisateurs u ON u.id_utilisateur = p.id_praticien
       JOIN praticiens pr ON pr.id_utilisateur = p.id_praticien
      WHERE cr.id_creneau = $1`,
    [req.params.id],
  );
  if (!rows[0]) return res.status(404).json({ message: 'Créneau introuvable' });
  return res.json(rows[0]);
});

module.exports = router;
