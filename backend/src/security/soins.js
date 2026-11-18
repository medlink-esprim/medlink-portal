// US-22 / US-23 : relation de soins. Un praticien n'accède au dossier d'un patient que si ce
// patient a (ou a eu) au moins un rendez-vous non annulé avec lui (moindre privilège).
const db = require('../db');

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

module.exports = { aRelationDeSoins };
