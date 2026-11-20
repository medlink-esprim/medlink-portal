// US-16 : export des données personnelles d'un patient (droit d'accès, loi INPDP).
// Rassemble ce que MedLink détient sur lui : identité, consentements, préférences, rendez-vous
// (motifs déchiffrés), liste des documents et historique des accès à son dossier.
const db = require('../db');
const { dechiffrer } = require('../security/chiffrement');

async function construireExport(idPatient) {
  const [identite, consentements, preferences, rdv, documents, acces] = await Promise.all([
    db.query(
      `SELECT u.nom, u.prenom, u.email, u.telephone, u.statut, u.date_creation,
              pa.numero_dossier, to_char(pa.date_naissance, 'YYYY-MM-DD') AS date_naissance, pa.sexe
         FROM utilisateurs u JOIN patients pa ON pa.id_utilisateur = u.id_utilisateur
        WHERE u.id_utilisateur = $1`,
      [idPatient],
    ),
    db.query('SELECT version_politique, date_consentement FROM consentements WHERE id_patient = $1 ORDER BY date_consentement', [idPatient]),
    db.query('SELECT email_actif, sms_actif, rappel_actif FROM preferences_notification WHERE id_patient = $1', [idPatient]),
    db.query(
      `SELECT r.id_rdv, cr.debut, c.nom AS clinique, ud.prenom || ' ' || ud.nom AS praticien, pr.specialite,
              r.statut, r.origine, r.motif_chiffre, r.date_creation, r.date_annulation
         FROM rendez_vous r
         JOIN creneaux cr USING (id_creneau)
         JOIN plages_disponibilite p USING (id_plage)
         JOIN cliniques c ON c.id_clinique = p.id_clinique
         JOIN utilisateurs ud ON ud.id_utilisateur = p.id_praticien
         JOIN praticiens pr ON pr.id_utilisateur = p.id_praticien
        WHERE r.id_patient = $1
        ORDER BY cr.debut`,
      [idPatient],
    ),
    db.query(
      `SELECT doc.titre, doc.type, doc.date_publication FROM documents_medicaux doc
         JOIN dossiers_medicaux d USING (id_dossier) WHERE d.id_patient = $1 ORDER BY doc.date_publication`,
      [idPatient],
    ),
    db.query(
      `SELECT j.date_acces, j.role, j.action, u.prenom || ' ' || u.nom AS par
         FROM journal_acces_dossiers j LEFT JOIN utilisateurs u ON u.id_utilisateur = j.id_utilisateur
        WHERE j.id_patient = $1 ORDER BY j.date_acces`,
      [idPatient],
    ),
  ]);
  const motif = (v) => { try { return dechiffrer(v, idPatient); } catch { return null; } };
  return {
    genere_le: new Date().toISOString(),
    source: 'MedLink — export des données personnelles (loi INPDP)',
    identite: identite.rows[0] || null,
    consentements: consentements.rows,
    preferences_notification: preferences.rows[0] || null,
    rendez_vous: rdv.rows.map(({ motif_chiffre: m, ...r }) => ({ ...r, motif: motif(m) })),
    documents: documents.rows,
    acces_au_dossier: acces.rows,
    note: 'Les documents médicaux eux-mêmes se téléchargent depuis « Mes résultats ».',
  };
}

module.exports = { construireExport };
