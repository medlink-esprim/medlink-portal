// US-05 : recherche d'un praticien par spécialité et par clinique.
// Montée sur /api/praticiens (rôle PATIENT) : GET /filtres, GET /?specialite=&clinique=
const express = require('express');
const Joi = require('joi');
const db = require('../db');
const { requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireRole('PATIENT'));

// Valeurs des listes déroulantes : spécialités réellement proposées et cliniques du réseau
router.get('/filtres', async (req, res) => {
  const [s, c] = await Promise.all([
    db.query(
      `SELECT DISTINCT pr.specialite FROM praticiens pr
         JOIN utilisateurs u USING (id_utilisateur)
         JOIN praticien_clinique pc ON pc.id_praticien = pr.id_utilisateur
        WHERE u.statut = 'actif' AND pr.specialite IS NOT NULL
        ORDER BY pr.specialite`,
    ),
    db.query('SELECT id_clinique, nom, ville FROM cliniques ORDER BY ville'),
  ]);
  res.json({ specialites: s.rows.map((r) => r.specialite), cliniques: c.rows });
});

const rechercheSchema = Joi.object({
  specialite: Joi.string().trim().max(60).allow(''),
  clinique: Joi.string().guid().allow(''),
});

router.get('/', async (req, res) => {
  const { error, value } = rechercheSchema.validate(req.query, { stripUnknown: true });
  if (error) return res.status(400).json({ message: 'Paramètres de recherche invalides' });
  const specialite = value.specialite || null;
  const clinique = value.clinique || null;

  const { rows } = await db.query(
    `SELECT u.id_utilisateur AS id_praticien, u.nom, u.prenom, pr.specialite,
            string_agg(DISTINCT c.ville, ', ' ORDER BY c.ville) AS villes,
            (SELECT count(*)::int FROM creneaux cr JOIN plages_disponibilite p USING (id_plage)
              WHERE p.id_praticien = u.id_utilisateur AND cr.statut = 'libre' AND cr.debut > now()
                AND ($2::uuid IS NULL OR p.id_clinique = $2)) AS creneaux_libres
       FROM praticiens pr
       JOIN utilisateurs u ON u.id_utilisateur = pr.id_utilisateur
       JOIN praticien_clinique pc ON pc.id_praticien = pr.id_utilisateur
       JOIN cliniques c ON c.id_clinique = pc.id_clinique
      WHERE u.statut = 'actif'
        AND ($1::text IS NULL OR pr.specialite = $1)
        AND ($2::uuid IS NULL OR EXISTS (SELECT 1 FROM praticien_clinique x
                                         WHERE x.id_praticien = pr.id_utilisateur AND x.id_clinique = $2))
      GROUP BY u.id_utilisateur, u.nom, u.prenom, pr.specialite
      ORDER BY creneaux_libres DESC, u.nom
      LIMIT 50`,
    [specialite, clinique],
  );
  res.json(rows);
});

module.exports = router;
