// Espace praticien : « mes patients » sont les patients qui ont (ou ont eu) un rendez-vous
// avec le praticien connecté (relation de soins). Le praticien est toujours celui du jeton.
// Montée sur /api/praticien :
//   GET /patients?q=              (US-22) recherche parmi mes patients (nom ou numéro de dossier)
//   GET /patients/:id/dossier     (US-23) dossier d'un patient reçu, accès journalisé (US-47)
//   POST /rendez-vous/:id/compte-rendu (US-24) compte-rendu chiffré, publié en PDF dans le dossier
//   POST /patients/:id/documents  (US-25) publication d'un PDF (corps brut application/pdf, 10 Mo max)
//   GET /agenda?debut=&clinique=  (US-19) agenda unifié de la semaine, toutes cliniques confondues
//   GET /alertes, POST /alertes/lues (US-20) annulations et reports des patients
//   GET /patients/:id/comptes-rendus (US-26) historique des comptes-rendus du patient, du plus récent au plus ancien
const crypto = require('crypto');
const express = require('express');
const Joi = require('joi');
const db = require('../db');
const validate = require('../middleware/validate');
const { requirePermission, refuser } = require('../middleware/auth');
const { chiffrer, dechiffrer } = require('../security/chiffrement');
const { publierDocument, pdfTexte } = require('../services/stockage');
const { detailsRdv, notifierDocument } = require('../services/notifications');
const { aRelationDeSoins } = require('../security/soins');
const { journaliserAcces } = require('../security/acces');
const { journaliser } = require('../security/journal');
const { CORRECTION_JOURS } = require('../services/presences');

const router = express.Router();
const estUuid = (v) => !Joi.string().guid().validate(v).error;

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

// US-23 : dossier d'un patient reçu. Sans relation de soins : 403 journalisé, aucune donnée.
// Avec relation : l'accès est écrit dans le journal (US-47) AVANT la lecture du dossier.
router.get('/patients/:id/dossier', requirePermission('DOSSIER_PATIENTS'), async (req, res) => {
  const idPatient = req.params.id;
  if (!estUuid(idPatient)) return res.status(404).json({ message: 'Patient introuvable' });
  if (!(await aRelationDeSoins(req.user.id, idPatient))) {
    return refuser(req, res, `dossier du patient ${idPatient} sans relation de soins`);
  }
  await journaliserAcces(req, { idPatient, action: 'consultation_dossier' });

  const [patient, rdv, documents] = await Promise.all([
    db.query(
      `SELECT u.id_utilisateur AS id_patient, u.nom, u.prenom, u.email, u.telephone,
              pa.numero_dossier, to_char(pa.date_naissance, 'YYYY-MM-DD') AS date_naissance, pa.sexe
         FROM utilisateurs u JOIN patients pa ON pa.id_utilisateur = u.id_utilisateur
        WHERE u.id_utilisateur = $1`,
      [idPatient],
    ),
    // rendez-vous de ce patient AVEC le praticien connecté uniquement
    db.query(
      `SELECT r.id_rdv, r.statut, r.origine, r.motif_chiffre, cr.debut, cr.fin, c.nom AS clinique, c.ville,
              crd.id_compte_rendu, crd.contenu_chiffre, crd.visible_patient, crd.date_redaction,
              (r.statut IN ('planifie', 'honore', 'manque') AND cr.debut <= now() AND crd.id_compte_rendu IS NULL) AS redigeable,
              (r.statut IN ('planifie', 'honore', 'manque') AND cr.debut <= now() AND cr.debut > now() - interval '30 days') AS presence_modifiable
         FROM rendez_vous r
         JOIN creneaux cr USING (id_creneau)
         JOIN plages_disponibilite p USING (id_plage)
         JOIN cliniques c ON c.id_clinique = p.id_clinique
         LEFT JOIN comptes_rendus crd ON crd.id_rdv = r.id_rdv
        WHERE r.id_patient = $1 AND p.id_praticien = $2
        ORDER BY cr.debut DESC
        LIMIT 100`,
      [idPatient, req.user.id],
    ),
    db.query(
      `SELECT doc.id_document, doc.type, doc.titre, doc.date_publication,
              CASE WHEN a.id_utilisateur IS NULL THEN NULL ELSE a.prenom || ' ' || a.nom END AS auteur
         FROM documents_medicaux doc
         JOIN dossiers_medicaux d USING (id_dossier)
         LEFT JOIN utilisateurs a ON a.id_utilisateur = doc.id_auteur
        WHERE d.id_patient = $1
        ORDER BY doc.date_publication DESC`,
      [idPatient],
    ),
  ]);
  // US-43 : motif lié à l'identifiant du patient, compte-rendu au sien ; illisible => null plutôt qu'une erreur
  const lire = (valeur, contexte) => { try { return dechiffrer(valeur, contexte); } catch { return null; } };
  return res.json({
    patient: patient.rows[0],
    rendezVous: rdv.rows.map(({ motif_chiffre: chiffre, id_compte_rendu: idCr, contenu_chiffre: contenu, visible_patient: visible, date_redaction: date, ...r }) => ({
      ...r,
      motif: lire(chiffre, idPatient),
      // US-24 : texte du compte-rendu, chiffré avec son propre identifiant comme contexte
      compteRendu: idCr ? { id: idCr, contenu: lire(contenu, idCr), visiblePatient: visible, date } : null,
    })),
    documents: documents.rows,
  });
});

// US-24 : compte-rendu de consultation. Un seul par rendez-vous, rédigé par SON praticien une fois
// la consultation commencée. Le texte est chiffré (AES-256-GCM) ; s'il est visible du patient, une
// version PDF est publiée dans son dossier (« Mes résultats »). Le rendez-vous passe à « honoré ».
const compteRenduSchema = Joi.object({
  contenu: Joi.string().trim().min(10).max(8000).required(),
  visiblePatient: Joi.boolean().default(true),
});

router.post('/rendez-vous/:id/compte-rendu', requirePermission('COMPTE_RENDU_REDIGER'), validate(compteRenduSchema), async (req, res) => {
  if (!estUuid(req.params.id)) return res.status(404).json({ message: 'Rendez-vous introuvable' });
  const { contenu, visiblePatient } = req.body;
  let outcome;
  try {
    outcome = await db.withTransaction(async (client) => {
      const { rows: [r] } = await client.query(
        `SELECT r.id_rdv, r.id_patient, r.statut, p.id_praticien, cr.debut <= now() AS commence,
                EXISTS (SELECT 1 FROM comptes_rendus x WHERE x.id_rdv = r.id_rdv) AS existe
           FROM rendez_vous r
           JOIN creneaux cr USING (id_creneau)
           JOIN plages_disponibilite p USING (id_plage)
          WHERE r.id_rdv = $1
            FOR UPDATE OF r`,
        [req.params.id],
      );
      if (!r) return { status: 404, body: { message: 'Rendez-vous introuvable' } };
      if (r.id_praticien !== req.user.id) return { refus: true };   // US-39 : contrôle de propriété
      if (!['planifie', 'honore', 'manque'].includes(r.statut)) return { status: 409, body: { message: 'Ce rendez-vous a été annulé ou reporté : pas de compte-rendu.' } };
      if (!r.commence) return { status: 422, body: { message: 'Le compte-rendu se rédige une fois la consultation commencée.' } };
      if (r.existe) return { status: 409, body: { message: 'Un compte-rendu existe déjà pour cette consultation.' } };

      const id = crypto.randomUUID();
      await client.query(
        `INSERT INTO comptes_rendus (id_compte_rendu, id_rdv, id_praticien, contenu_chiffre, visible_patient)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, r.id_rdv, req.user.id, chiffrer(contenu, id), visiblePatient],
      );
      // un compte-rendu prouve la consultation : « manqué » (marqué par erreur ou automatiquement) devient « honoré »
      await client.query("UPDATE rendez_vous SET statut = 'honore' WHERE id_rdv = $1 AND statut IN ('planifie', 'manque')", [r.id_rdv]);
      await journaliserAcces(req, { idPatient: r.id_patient, action: 'redaction_compte_rendu' }, client);
      return { status: 201, id, idPatient: r.id_patient, idRdv: r.id_rdv };
    });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'Un compte-rendu existe déjà pour cette consultation.' });
    throw err;
  }
  if (outcome.refus) return refuser(req, res, `compte-rendu du rendez-vous ${req.params.id} d'un autre praticien`);
  if (outcome.status !== 201) return res.status(outcome.status).json(outcome.body);

  let idDocument = null;
  if (visiblePatient) {
    try {
      const d = await detailsRdv(outcome.idRdv);
      const titre = `Compte-rendu de consultation du ${d.debut.toLocaleDateString('fr-FR', { timeZone: 'Africa/Tunis' })}`;
      const pdf = pdfTexte(titre, [
        `Patient : ${d.patient_prenom} ${d.patient_nom}`,
        `Praticien : ${d.dr} (${d.specialite})`,
        `Clinique : ${d.clinique}, le ${d.date} à ${d.heure}`,
        '',
        ...contenu.split(/\r?\n/),
      ]);
      idDocument = await publierDocument({ idPatient: outcome.idPatient, type: 'compte_rendu', titre, contenu: pdf, idAuteur: req.user.id });
      await db.query('UPDATE comptes_rendus SET id_document = $2 WHERE id_compte_rendu = $1', [outcome.id, idDocument]);
    } catch (err) {
      console.error(`Compte-rendu ${outcome.id} enregistré mais PDF non publié : ${err.message}`);
      return res.status(201).json({ id: outcome.id, idDocument: null, message: "Compte-rendu enregistré. La version PDF n'a pas pu être publiée dans le dossier du patient." });
    }
  }
  return res.status(201).json({ id: outcome.id, idDocument, message: visiblePatient ? 'Compte-rendu enregistré et publié dans le dossier du patient' : 'Compte-rendu enregistré (non visible du patient)' });
});

// Présence au rendez-vous : le praticien marque le patient présent (honoré) ou absent (manqué),
// une fois la consultation commencée et pendant 30 jours ; « absent » est refusé s'il existe un compte-rendu.
const presenceSchema = Joi.object({ present: Joi.boolean().required() });

router.patch('/rendez-vous/:id/presence', requirePermission('DISPONIBILITES_GERER'), validate(presenceSchema), async (req, res) => {
  if (!estUuid(req.params.id)) return res.status(404).json({ message: 'Rendez-vous introuvable' });
  const outcome = await db.withTransaction(async (client) => {
    const { rows: [r] } = await client.query(
      `SELECT r.id_rdv, r.statut, p.id_praticien, cr.debut <= now() AS commence,
              cr.debut > now() - make_interval(days => $2) AS corrigeable,
              EXISTS (SELECT 1 FROM comptes_rendus x WHERE x.id_rdv = r.id_rdv) AS compte_rendu
         FROM rendez_vous r JOIN creneaux cr USING (id_creneau) JOIN plages_disponibilite p USING (id_plage)
        WHERE r.id_rdv = $1
          FOR UPDATE OF r`,
      [req.params.id, CORRECTION_JOURS],
    );
    if (!r) return { status: 404, body: { message: 'Rendez-vous introuvable' } };
    if (r.id_praticien !== req.user.id) return { refus: true };
    if (!['planifie', 'honore', 'manque'].includes(r.statut)) return { status: 409, body: { message: 'Ce rendez-vous a été annulé ou reporté.' } };
    if (!r.commence) return { status: 422, body: { message: 'La présence se note une fois le rendez-vous commencé.' } };
    if (!r.corrigeable) return { status: 422, body: { message: `La présence ne se modifie plus après ${CORRECTION_JOURS} jours.` } };
    if (!req.body.present && r.compte_rendu) return { status: 409, body: { message: 'Un compte-rendu existe pour ce rendez-vous : le patient était présent.' } };
    const statut = req.body.present ? 'honore' : 'manque';
    await client.query('UPDATE rendez_vous SET statut = $2::statut_rdv WHERE id_rdv = $1', [r.id_rdv, statut]);
    return { status: 200, ancien: r.statut, body: { statut, message: req.body.present ? 'Patient marqué présent' : 'Patient marqué absent' } };
  });
  if (outcome.refus) return refuser(req, res, `présence du rendez-vous ${req.params.id} d'un autre praticien`);
  if (outcome.status === 200) journaliser('PRESENCE_MARQUEE', req, { rdv: req.params.id, avant: outcome.ancien, apres: outcome.body.statut });
  return res.status(outcome.status).json(outcome.body);
});

// US-25 : publication d'un résultat ou d'un document dans le dossier d'un patient suivi.
// Le PDF arrive en corps brut (Content-Type: application/pdf) ; type et titre dans les en-têtes
// X-Document-Type et X-Document-Titre (titre encodé avec encodeURIComponent).
// Contrôles : permission, relation de soins, signature %PDF-, taille (10 Mo), puis chiffrement (US-13),
// journal des accès (US-47) et notification du patient sans aucune donnée médicale (US-08 / US-12).
const TYPES_PUBLIABLES = ['resultat', 'ordonnance', 'compte_rendu', 'autre'];
const fichierPdf = express.raw({ type: 'application/pdf', limit: '10mb' });

router.post('/patients/:id/documents', requirePermission('RESULTAT_PUBLIER'), async (req, res, next) => {
  const idPatient = req.params.id;
  if (!estUuid(idPatient)) return res.status(404).json({ message: 'Patient introuvable' });
  if (!(await aRelationDeSoins(req.user.id, idPatient))) {
    return refuser(req, res, `publication dans le dossier du patient ${idPatient} sans relation de soins`);
  }
  return next();
}, fichierPdf, async (req, res) => {
  const idPatient = req.params.id;
  const type = req.get('X-Document-Type');
  let titre = '';
  try { titre = decodeURIComponent(req.get('X-Document-Titre') || '').trim(); } catch { titre = ''; }
  const contenu = req.body;
  if (!Buffer.isBuffer(contenu) || contenu.length === 0) return res.status(415).json({ message: 'Envoyez un fichier PDF' });
  if (contenu.subarray(0, 5).toString('latin1') !== '%PDF-') return res.status(415).json({ message: "Le fichier n'est pas un PDF valide" });
  if (!TYPES_PUBLIABLES.includes(type)) return res.status(400).json({ message: 'Type de document invalide' });
  if (titre.length < 3 || titre.length > 120) return res.status(400).json({ message: 'Le titre doit contenir de 3 à 120 caractères' });

  const idDocument = await publierDocument({ idPatient, type, titre, contenu, idAuteur: req.user.id });
  await journaliserAcces(req, { idPatient, idDocument, action: 'publication_document' });
  const notifications = await notifierDocument(idPatient, req.user.id);
  return res.status(201).json({ idDocument, notifications, message: 'Document publié dans le dossier du patient, qui en a été notifié' });
});

// US-19 : agenda unifié. Une semaine (lundi à dimanche, heure de Tunis) de tous les créneaux du
// praticien, dans toutes ses cliniques, avec le rendez-vous actif de chaque créneau réservé.
const dateIso = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).custom((v, helpers) => (
  new Date(`${v}T00:00:00Z`).toISOString().startsWith(v) ? v : helpers.error('any.invalid')
), 'date du calendrier');
const agendaSchema = Joi.object({ debut: dateIso, clinique: Joi.string().guid().allow('') });

router.get('/agenda', requirePermission('DISPONIBILITES_GERER'), async (req, res) => {
  const { error, value } = agendaSchema.validate(req.query, { stripUnknown: true });
  if (error) return res.status(400).json({ message: 'Paramètres invalides' });
  const { rows: [s] } = await db.query(
    `SELECT to_char(date_trunc('week', COALESCE($1::date, (now() AT TIME ZONE 'Africa/Tunis')::date))::date, 'YYYY-MM-DD') AS semaine`,
    [value.debut || null],
  );
  const [cliniques, creneaux] = await Promise.all([
    db.query(
      `SELECT c.id_clinique, c.nom, c.ville, pc.actif
         FROM praticien_clinique pc JOIN cliniques c USING (id_clinique)
        WHERE pc.id_praticien = $1
        ORDER BY c.ville`,
      [req.user.id],
    ),
    db.query(
      `SELECT cr.id_creneau, cr.debut, cr.fin, cr.statut, c.id_clinique, c.nom AS clinique, c.ville,
              r.id_rdv, r.statut AS statut_rdv, r.origine, r.id_patient, u.nom, u.prenom, pa.numero_dossier,
              (crd.id_compte_rendu IS NOT NULL) AS compte_rendu
         FROM creneaux cr
         JOIN plages_disponibilite p USING (id_plage)
         JOIN cliniques c ON c.id_clinique = p.id_clinique
         LEFT JOIN LATERAL (
           SELECT x.id_rdv, x.statut, x.origine, x.id_patient FROM rendez_vous x
            WHERE x.id_creneau = cr.id_creneau AND x.statut IN ('planifie', 'honore', 'manque')
            ORDER BY x.date_creation DESC LIMIT 1) r ON true
         LEFT JOIN utilisateurs u ON u.id_utilisateur = r.id_patient
         LEFT JOIN patients pa ON pa.id_utilisateur = r.id_patient
         LEFT JOIN comptes_rendus crd ON crd.id_rdv = r.id_rdv
        WHERE p.id_praticien = $1
          AND ($3::uuid IS NULL OR p.id_clinique = $3)
          AND cr.debut >= $2::date::timestamp AT TIME ZONE 'Africa/Tunis'
          AND cr.debut < ($2::date + 7)::timestamp AT TIME ZONE 'Africa/Tunis'
        ORDER BY cr.debut
        LIMIT 1000`,
      [req.user.id, s.semaine, value.clinique || null],
    ),
  ]);
  res.json({ semaine: s.semaine, cliniques: cliniques.rows, creneaux: creneaux.rows });
});

// US-20 : alertes du praticien (annulation ou report par un patient), les plus récentes d'abord.
// L'alerte est aussi envoyée par e-mail (US-09 / US-10) ; ici elle s'affiche dans l'agenda.
router.get('/alertes', requirePermission('DISPONIBILITES_GERER'), async (req, res) => {
  const { rows } = await db.query(
    `SELECT n.id_notification, n.date_programmee AS date, n.lue_le,
            CASE WHEN r.statut = 'annule' THEN 'annulation' WHEN r.id_rdv_origine IS NOT NULL THEN 'report' ELSE 'autre' END AS nature,
            r.id_rdv, r.statut AS statut_rdv, cr.debut, c.ville, oc.debut AS ancienne_date,
            u.prenom, u.nom
       FROM notifications n
       JOIN rendez_vous r ON r.id_rdv = n.id_rdv
       JOIN creneaux cr ON cr.id_creneau = r.id_creneau
       JOIN plages_disponibilite p ON p.id_plage = cr.id_plage
       JOIN cliniques c ON c.id_clinique = p.id_clinique
       JOIN utilisateurs u ON u.id_utilisateur = r.id_patient
       LEFT JOIN rendez_vous o ON o.id_rdv = r.id_rdv_origine
       LEFT JOIN creneaux oc ON oc.id_creneau = o.id_creneau
      WHERE n.id_destinataire = $1 AND n.type = 'alerte'
      ORDER BY n.date_programmee DESC
      LIMIT 30`,
    [req.user.id],
  );
  res.json({ nonLues: rows.filter((a) => !a.lue_le).length, alertes: rows });
});

router.post('/alertes/lues', requirePermission('DISPONIBILITES_GERER'), async (req, res) => {
  const { rowCount } = await db.query(
    "UPDATE notifications SET lue_le = now() WHERE id_destinataire = $1 AND type = 'alerte' AND lue_le IS NULL",
    [req.user.id],
  );
  res.json({ message: 'Alertes marquées comme lues', lues: rowCount });
});

// US-26 : continuité des soins — tous les comptes-rendus du patient (des praticiens qui l'ont suivi),
// du plus récent au plus ancien. Ceux qu'un confrère a marqués « non visibles » restent privés.
// Mêmes règles que le dossier (US-23) : relation de soins obligatoire, accès journalisé (US-47).
router.get('/patients/:id/comptes-rendus', requirePermission('DOSSIER_PATIENTS'), async (req, res) => {
  const idPatient = req.params.id;
  if (!estUuid(idPatient)) return res.status(404).json({ message: 'Patient introuvable' });
  if (!(await aRelationDeSoins(req.user.id, idPatient))) {
    return refuser(req, res, `historique des comptes-rendus du patient ${idPatient} sans relation de soins`);
  }
  await journaliserAcces(req, { idPatient, action: 'consultation_dossier' });
  const { rows } = await db.query(
    `SELECT crd.id_compte_rendu, crd.contenu_chiffre, crd.visible_patient, crd.date_redaction,
            cr.debut AS date_consultation, c.ville, u.prenom AS dr_prenom, u.nom AS dr_nom, pr.specialite,
            (crd.id_praticien = $2) AS de_moi
       FROM comptes_rendus crd
       JOIN rendez_vous r ON r.id_rdv = crd.id_rdv
       JOIN creneaux cr ON cr.id_creneau = r.id_creneau
       JOIN plages_disponibilite p ON p.id_plage = cr.id_plage
       JOIN cliniques c ON c.id_clinique = p.id_clinique
       JOIN utilisateurs u ON u.id_utilisateur = crd.id_praticien
       JOIN praticiens pr ON pr.id_utilisateur = crd.id_praticien
      WHERE r.id_patient = $1 AND (crd.visible_patient OR crd.id_praticien = $2)
      ORDER BY cr.debut DESC, crd.date_redaction DESC`,
    [idPatient, req.user.id],
  );
  const lire = (valeur, contexte) => { try { return dechiffrer(valeur, contexte); } catch { return null; } };
  return res.json(rows.map(({ contenu_chiffre: chiffre, ...r }) => ({ ...r, contenu: lire(chiffre, r.id_compte_rendu) })));
});

module.exports = router;
