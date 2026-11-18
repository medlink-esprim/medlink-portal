// Espace praticien : « mes patients » sont les patients qui ont (ou ont eu) un rendez-vous
// avec le praticien connecté (relation de soins). Le praticien est toujours celui du jeton.
// Montée sur /api/praticien :
//   GET /patients?q=              (US-22) recherche parmi mes patients (nom ou numéro de dossier)
//   GET /patients/:id/dossier     (US-23) dossier d'un patient reçu, accès journalisé (US-47)
//   POST /rendez-vous/:id/compte-rendu (US-24) compte-rendu chiffré, publié en PDF dans le dossier
const crypto = require('crypto');
const express = require('express');
const Joi = require('joi');
const db = require('../db');
const validate = require('../middleware/validate');
const { requirePermission, refuser } = require('../middleware/auth');
const { chiffrer, dechiffrer } = require('../security/chiffrement');
const { publierDocument, pdfTexte } = require('../services/stockage');
const { detailsRdv } = require('../services/notifications');
const { aRelationDeSoins } = require('../security/soins');
const { journaliserAcces } = require('../security/acces');

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
              (r.statut IN ('planifie', 'honore') AND cr.debut <= now() AND crd.id_compte_rendu IS NULL) AS redigeable
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
      if (!['planifie', 'honore'].includes(r.statut)) return { status: 409, body: { message: 'Ce rendez-vous a été annulé, reporté ou manqué : pas de compte-rendu.' } };
      if (!r.commence) return { status: 422, body: { message: 'Le compte-rendu se rédige une fois la consultation commencée.' } };
      if (r.existe) return { status: 409, body: { message: 'Un compte-rendu existe déjà pour cette consultation.' } };

      const id = crypto.randomUUID();
      await client.query(
        `INSERT INTO comptes_rendus (id_compte_rendu, id_rdv, id_praticien, contenu_chiffre, visible_patient)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, r.id_rdv, req.user.id, chiffrer(contenu, id), visiblePatient],
      );
      await client.query("UPDATE rendez_vous SET statut = 'honore' WHERE id_rdv = $1 AND statut = 'planifie'", [r.id_rdv]);
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

module.exports = router;
