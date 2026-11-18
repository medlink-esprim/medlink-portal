// Espace praticien : « mes patients » sont les patients qui ont (ou ont eu) un rendez-vous
// avec le praticien connecté (relation de soins). Le praticien est toujours celui du jeton.
// Montée sur /api/praticien :
//   GET /patients?q=              (US-22) recherche parmi mes patients (nom ou numéro de dossier)
const express = require('express');
const Joi = require('joi');
const db = require('../db');
const { requirePermission } = require('../middleware/auth');

const router = express.Router();

// Relation de soins : au moins un rendez-vous non annulé entre ce praticien et ce patient.
async function aRelationDeSoins(idPraticien, idPatient, client = db) {
  const { rowCount } = await client.query(
    `SELECT 1 FROM rendez_vous r
       JOIN creneaux cr USING (id_creneau)
       JOIN plages_disponibilite p USING (id_plage)
      WHERE p.id_praticien = $1 AND r.id_patient = $2 AND r.statut <> 'annule'
      LIMIT 1`,
    [idPraticien, idPatient],
  );
  return rowCount === 1;
}

// Échappe % et _ : le texte saisi est cherché tel quel (jamais interprété comme un motif)
const motif = (q) => `%${q.replace(/[\\%_]/g, '\\$&')}%`;
const rechercheSchema = Joi.object({ q: Joi.string().trim().max(80).allow('') });

// US-22 : seuls MES patients, filtrés par nom, prénom ou numéro de dossier
router.get('/patients', requirePermission('DOSSIER_PATIENTS'), async (req, res) => {
  const { error, value } = rechercheSchema.validate(req.query, { stripUnknown: true });
  if (error) return res.status(400).json({ message: 'Recherche invalide' });
  const q = value.q ? motif(value.q) : null;
  const { rows } = await db.query(
    `WITH mes_patients AS (
       SELECT r.id_patient,
              max(cr.debut) FILTER (WHERE cr.debut <= now()) AS dernier_rdv,
              min(cr.debut) FILTER (WHERE cr.debut > now() AND r.statut = 'planifie') AS prochain_rdv,
              count(*)::int AS nb_rdv
         FROM rendez_vous r
         JOIN creneaux cr USING (id_creneau)
         JOIN plages_disponibilite p USING (id_plage)
        WHERE p.id_praticien = $1 AND r.statut <> 'annule'
        GROUP BY r.id_patient)
     SELECT u.id_utilisateur AS id_patient, u.nom, u.prenom, pa.numero_dossier,
            to_char(pa.date_naissance, 'YYYY-MM-DD') AS date_naissance,
            m.dernier_rdv, m.prochain_rdv, m.nb_rdv
       FROM mes_patients m
       JOIN utilisateurs u ON u.id_utilisateur = m.id_patient
       JOIN patients pa ON pa.id_utilisateur = m.id_patient
      WHERE $2::text IS NULL
         OR u.nom ILIKE $2 OR u.prenom ILIKE $2 OR pa.numero_dossier ILIKE $2
         OR (u.prenom || ' ' || u.nom) ILIKE $2 OR (u.nom || ' ' || u.prenom) ILIKE $2
      ORDER BY COALESCE(m.prochain_rdv, m.dernier_rdv) DESC NULLS LAST, u.nom
      LIMIT 50`,
    [req.user.id, q],
  );
  res.json(rows);
});

module.exports = router;
module.exports.aRelationDeSoins = aRelationDeSoins;
