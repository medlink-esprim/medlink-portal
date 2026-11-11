// US-48 : envoi automatique des rappels.
// Toutes les 15 minutes (planificateur node-cron, démarré par server.js), chaque rendez-vous
// planifié qui commence dans les prochaines 24 heures reçoit son rappel, selon les préférences
// du patient (US-12). La contrainte d'unicité (id_rdv, type, canal) de la table notifications
// garantit qu'un rappel n'est envoyé qu'une fois, même si la tâche s'exécute plusieurs fois
// ou sur plusieurs instances de l'API.
const db = require('../db');
const { notifierPatient } = require('./notifications');

const FENETRE_H = 24;

async function envoyerRappels() {
  const { rows } = await db.query(
    `SELECT r.id_rdv
       FROM rendez_vous r
       JOIN creneaux c USING (id_creneau)
       LEFT JOIN preferences_notification pn ON pn.id_patient = r.id_patient
      WHERE r.statut = 'planifie'
        AND c.debut > now() AND c.debut <= now() + make_interval(hours => $1)
        AND COALESCE(pn.rappel_actif, true)
        AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.id_rdv = r.id_rdv AND n.type = 'rappel')
      ORDER BY c.debut`,
    [FENETRE_H],
  );
  let envoyes = 0;
  for (const { id_rdv: idRdv } of rows) envoyes += await notifierPatient(idRdv, 'rappel');
  return { rendezVous: rows.length, envoyes };
}

module.exports = { envoyerRappels, FENETRE_H };
