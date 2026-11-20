// Règles d'agenda partagées par la réservation en ligne (US-07), le report (US-10) et l'accueil (US-30).
//  - un patient n'a jamais deux rendez-vous qui se chevauchent, quel que soit le praticien ou la clinique ;
//  - un patient a au plus un rendez-vous par jour avec le même praticien ;
//  - un créneau libéré (annulation, report) reste bloqué s'il tombe pendant une absence du praticien (US-21)
//    ou si le praticien est désactivé (US-28).
const TZ = 'Africa/Tunis';

// À appeler en DÉBUT de transaction : verrou sur le patient, puis contrôle des conflits.
// Le verrou sérialise deux réservations simultanées du même patient (deux onglets, deux agents).
// Renvoie null si tout va bien, sinon { status, body }.
async function conflitPatient(client, { idPatient, idCreneau, idRdvExclu = null, parAccueil = false }) {
  await client.query('SELECT 1 FROM patients WHERE id_utilisateur = $1 FOR UPDATE', [idPatient]);
  const { rows: [c] } = await client.query(
    `SELECT bool_or(cr2.debut < cr.fin AND cr2.fin > cr.debut) AS chevauche,
            bool_or(p2.id_praticien = p.id_praticien
                    AND (cr2.debut AT TIME ZONE '${TZ}')::date = (cr.debut AT TIME ZONE '${TZ}')::date) AS meme_jour
       FROM creneaux cr
       JOIN plages_disponibilite p USING (id_plage)
       JOIN rendez_vous r ON r.id_patient = $1 AND r.statut = 'planifie' AND r.id_rdv IS DISTINCT FROM $3::uuid
       JOIN creneaux cr2 ON cr2.id_creneau = r.id_creneau
       JOIN plages_disponibilite p2 ON p2.id_plage = cr2.id_plage
      WHERE cr.id_creneau = $2`,
    [idPatient, idCreneau, idRdvExclu],
  );
  const qui = parAccueil ? 'Ce patient a' : 'Vous avez';
  if (c && c.chevauche) return { status: 409, body: { message: `${qui} déjà un rendez-vous à cette heure-là.`, conflit: 'chevauchement' } };
  if (c && c.meme_jour) return { status: 409, body: { message: `${qui} déjà un rendez-vous avec ce praticien ce jour-là.`, conflit: 'meme_jour' } };
  return null;
}

// Rend un créneau réservable, sauf pendant une absence du praticien ou s'il est désactivé.
async function libererCreneau(client, idCreneau) {
  await client.query(
    `UPDATE creneaux cr
        SET statut = CASE WHEN EXISTS (SELECT 1 FROM absences a WHERE a.id_praticien = p.id_praticien AND cr.debut < a.fin AND cr.fin > a.debut)
                            OR u.statut = 'desactive'
                          THEN 'bloque'::statut_creneau ELSE 'libre'::statut_creneau END
       FROM plages_disponibilite p JOIN utilisateurs u ON u.id_utilisateur = p.id_praticien
      WHERE p.id_plage = cr.id_plage AND cr.id_creneau = $1`,
    [idCreneau],
  );
}

module.exports = { conflitPatient, libererCreneau };
