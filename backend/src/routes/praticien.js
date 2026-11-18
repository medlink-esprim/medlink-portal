// Espace praticien : « mes patients » sont les patients qui ont (ou ont eu) un rendez-vous
// avec le praticien connecté (relation de soins). Le praticien est toujours celui du jeton.
// Montée sur /api/praticien :
//   GET /patients?q=              (US-22) recherche parmi mes patients (nom ou numéro de dossier)
//   GET /patients/:id/dossier     (US-23) dossier d'un patient reçu, accès journalisé (US-47)
const express = require('express');
const Joi = require('joi');
const db = require('../db');
const { requirePermission, refuser } = require('../middleware/auth');
const { dechiffrer } = require('../security/chiffrement');
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
      `SELECT r.id_rdv, r.statut, r.origine, r.motif_chiffre, cr.debut, cr.fin, c.nom AS clinique, c.ville
         FROM rendez_vous r
         JOIN creneaux cr USING (id_creneau)
         JOIN plages_disponibilite p USING (id_plage)
         JOIN cliniques c ON c.id_clinique = p.id_clinique
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
  // motif chiffré lié à l'identifiant du patient (US-43) ; illisible => null plutôt qu'une erreur
  const lireMotif = (valeur) => { try { return dechiffrer(valeur, idPatient); } catch { return null; } };
  return res.json({
    patient: patient.rows[0],
    rendezVous: rdv.rows.map(({ motif_chiffre: chiffre, ...r }) => ({ ...r, motif: lireMotif(chiffre) })),
    documents: documents.rows,
  });
});

module.exports = router;
