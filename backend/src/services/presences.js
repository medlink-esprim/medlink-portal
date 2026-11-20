// Présence aux rendez-vous : un rendez-vous passé ne reste jamais « planifié ».
//  - le praticien marque « Présent » (honoré) ou « Absent » (manqué) depuis le dossier du patient ;
//  - rédiger le compte-rendu le marque « honoré » ;
//  - sans rien de tout cela, 48 h après la fin du rendez-vous, il passe automatiquement à « manqué »
//    (tâche quotidienne + au démarrage de l'API) ; le praticien peut encore corriger pendant 30 jours.
const db = require('../db');

const DELAI_AUTO_H = 48;
const CORRECTION_JOURS = 30;

async function marquerAbsences() {
  const { rowCount } = await db.query(
    `UPDATE rendez_vous r SET statut = 'manque'
       FROM creneaux cr
      WHERE cr.id_creneau = r.id_creneau AND r.statut = 'planifie'
        AND cr.fin < now() - make_interval(hours => $1)
        AND NOT EXISTS (SELECT 1 FROM comptes_rendus x WHERE x.id_rdv = r.id_rdv)`,
    [DELAI_AUTO_H],
  );
  if (rowCount) console.log(JSON.stringify({ date: new Date().toISOString(), evenement: 'ABSENCES_MARQUEES', rendezVous: rowCount }));
  return rowCount;
}

module.exports = { marquerAbsences, DELAI_AUTO_H, CORRECTION_JOURS };
