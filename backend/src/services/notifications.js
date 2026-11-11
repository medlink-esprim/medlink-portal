// US-08 / US-09 / US-10 / US-12 / US-48 : service de notifications.
// Chaque envoi est d'abord enregistré dans la table notifications ; la contrainte d'unicité
// (id_rdv, type, canal) garantit qu'un même message n'est jamais envoyé deux fois (US-48).
// Le patient choisit ses canaux (préférences, US-12) ; le praticien est prévenu par e-mail.
// Une erreur d'envoi n'annule jamais l'opération qui l'a déclenchée : elle est enregistrée (statut echec).
const db = require('../db');
const config = require('../config');
const { sendMail } = require('./mailer');
const { envoyerSms } = require('./sms');

const TZ = 'Africa/Tunis';
const fmtDate = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fmtHeure = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });

async function detailsRdv(idRdv) {
  const { rows: [d] } = await db.query(
    `SELECT r.id_rdv, r.id_patient, p.id_praticien, cr.debut, c.nom AS clinique,
            up.prenom AS patient_prenom, up.nom AS patient_nom, up.email AS patient_email, up.telephone AS patient_tel,
            ud.prenom AS praticien_prenom, ud.nom AS praticien_nom, ud.email AS praticien_email, pr.specialite,
            COALESCE(pn.email_actif, true) AS email_actif, COALESCE(pn.sms_actif, false) AS sms_actif,
            COALESCE(pn.rappel_actif, true) AS rappel_actif
       FROM rendez_vous r
       JOIN creneaux cr USING (id_creneau)
       JOIN plages_disponibilite p USING (id_plage)
       JOIN cliniques c ON c.id_clinique = p.id_clinique
       JOIN utilisateurs up ON up.id_utilisateur = r.id_patient
       JOIN utilisateurs ud ON ud.id_utilisateur = p.id_praticien
       JOIN praticiens pr ON pr.id_utilisateur = p.id_praticien
       LEFT JOIN preferences_notification pn ON pn.id_patient = r.id_patient
      WHERE r.id_rdv = $1`,
    [idRdv],
  );
  if (d) {
    d.date = fmtDate.format(d.debut);
    d.heure = fmtHeure.format(d.debut);
    d.dr = `Dr ${d.praticien_prenom} ${d.praticien_nom}`;
  }
  return d;
}

const lienRdv = () => `${config.appUrl}/patient/rendez-vous`;
const recap = (d) => `- Praticien : ${d.dr} (${d.specialite})\n- Clinique : ${d.clinique}\n- Date : ${d.date} à ${d.heure}`;

// Textes envoyés au patient : { sujet, texte (e-mail), sms }
const TEXTES_PATIENT = {
  confirmation: (d) => ({
    sujet: 'MedLink — rendez-vous confirmé',
    texte: `Bonjour ${d.patient_prenom},\n\nVotre rendez-vous est confirmé :\n${recap(d)}\n\nVous pouvez l'annuler ou le reporter jusqu'à 24 heures avant : ${lienRdv()}`,
    sms: `MedLink : RDV confirmé le ${d.date} à ${d.heure} avec ${d.dr}, ${d.clinique}.`,
  }),
  rappel: (d) => ({
    sujet: 'MedLink — rappel de votre rendez-vous',
    texte: `Bonjour ${d.patient_prenom},\n\nRappel de votre rendez-vous :\n${recap(d)}\n\nEn cas d'empêchement, contactez votre clinique.`,
    sms: `MedLink : rappel, RDV le ${d.date} à ${d.heure} avec ${d.dr}, ${d.clinique}.`,
  }),
  modification: (d) => ({
    sujet: 'MedLink — rendez-vous reporté',
    texte: `Bonjour ${d.patient_prenom},\n\nVotre rendez-vous a été reporté. Nouveau rendez-vous :\n${recap(d)}\n\nVos rendez-vous : ${lienRdv()}`,
    sms: `MedLink : RDV reporté au ${d.date} à ${d.heure} avec ${d.dr}, ${d.clinique}.`,
  }),
  annulation: (d) => ({
    sujet: 'MedLink — rendez-vous annulé',
    texte: `Bonjour ${d.patient_prenom},\n\nVotre rendez-vous a bien été annulé :\n${recap(d)}\n\nPour reprendre rendez-vous : ${config.appUrl}/patient/rendez-vous/nouveau`,
    sms: `MedLink : RDV du ${d.date} à ${d.heure} avec ${d.dr} annulé.`,
  }),
};

// Enregistre puis envoie un message sur un canal ; renvoie false s'il avait déjà été envoyé.
async function envoyer({ idDestinataire, idRdv, type, canal, destination, sujet, texte, sms }) {
  const { rows: [n] } = await db.query(
    `INSERT INTO notifications (id_destinataire, id_rdv, type, canal)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id_rdv, type, canal) DO NOTHING
     RETURNING id_notification`,
    [idDestinataire, idRdv, type, canal],
  );
  if (!n) return false;   // déjà envoyé : rien à faire (US-48)
  let statut = 'envoyee';
  try {
    if (canal === 'email') await sendMail({ to: destination, subject: sujet, text: texte });
    else await envoyerSms(destination, sms);
  } catch (err) {
    statut = 'echec';
    console.error(`Notification ${n.id_notification} (${type}/${canal}) non envoyée : ${err.message}`);
  }
  await db.query(
    "UPDATE notifications SET statut = $2, date_envoi = CASE WHEN $2 = 'envoyee' THEN now() END WHERE id_notification = $1",
    [n.id_notification, statut],
  );
  return statut === 'envoyee';
}

// Notifie le patient d'un rendez-vous selon ses préférences ; renvoie le nombre de messages envoyés.
async function notifierPatient(idRdv, type) {
  try {
    const d = await detailsRdv(idRdv);
    if (!d || (type === 'rappel' && !d.rappel_actif)) return 0;
    const t = TEXTES_PATIENT[type](d);
    const canaux = [];
    if (d.email_actif) canaux.push(['email', d.patient_email]);
    if (d.sms_actif && d.patient_tel) canaux.push(['sms', d.patient_tel]);
    let n = 0;
    for (const [canal, destination] of canaux) {
      if (await envoyer({ idDestinataire: d.id_patient, idRdv, type, canal, destination, ...t })) n += 1;
    }
    return n;
  } catch (err) {
    console.error(`Notification ${type} du rendez-vous ${idRdv} impossible : ${err.message}`);
    return 0;
  }
}

// Prévient le praticien d'une annulation ou d'un report (type « alerte », par e-mail).
async function notifierPraticien(idRdv, action) {
  try {
    const d = await detailsRdv(idRdv);
    if (!d) return 0;
    const sujet = `MedLink — rendez-vous ${action === 'report' ? 'reporté' : 'annulé'} par un patient`;
    const texte = action === 'report'
      ? `Bonjour ${d.dr},\n\n${d.patient_prenom} ${d.patient_nom} a reporté son rendez-vous. Nouveau créneau : ${d.date} à ${d.heure} (${d.clinique}). L'ancien créneau est de nouveau réservable.`
      : `Bonjour ${d.dr},\n\n${d.patient_prenom} ${d.patient_nom} a annulé son rendez-vous du ${d.date} à ${d.heure} (${d.clinique}). Le créneau est de nouveau réservable.`;
    return (await envoyer({ idDestinataire: d.id_praticien, idRdv, type: 'alerte', canal: 'email', destination: d.praticien_email, sujet, texte })) ? 1 : 0;
  } catch (err) {
    console.error(`Alerte praticien du rendez-vous ${idRdv} impossible : ${err.message}`);
    return 0;
  }
}

module.exports = { notifierPatient, notifierPraticien, detailsRdv };
