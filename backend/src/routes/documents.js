// US-14 : téléchargement d'un document médical, déchiffré à la volée et journalisé.
// Montée sur /api/documents : GET /:id/fichier (?inline=1 pour l'afficher dans le navigateur)
// Contrôles : le patient propriétaire (permission DOSSIER_PROPRE) ou un praticien qui le suit
// (permission DOSSIER_PATIENTS + relation de soins, US-23) ; sinon 403 journalisé (TA-3.6),
// intégrité (empreinte SHA-256 vérifiée avant tout envoi). Transmis uniquement en HTTPS (US-44).
// US-47 : chaque accès autorisé est écrit dans le journal des accès aux dossiers avant l'envoi.
const express = require('express');
const Joi = require('joi');
const db = require('../db');
const { requireAuth, refuser } = require('../middleware/auth');
const { aRelationDeSoins } = require('../security/soins');
const { lireDocument, IntegriteError } = require('../services/stockage');
const { journaliser } = require('../security/journal');
const { journaliserAcces } = require('../security/acces');

const router = express.Router();

const nomFichier = (titre) => `${titre.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 _-]/g, '').trim().replace(/\s+/g, '_') || 'document'}.pdf`;

router.get('/:id/fichier', requireAuth, async (req, res) => {
  if (Joi.string().guid().validate(req.params.id).error) return res.status(404).json({ message: 'Document introuvable' });
  const { rows: [doc] } = await db.query(
    `SELECT doc.id_document, doc.titre, doc.chemin_fichier, doc.empreinte_sha256, d.id_patient
       FROM documents_medicaux doc JOIN dossiers_medicaux d USING (id_dossier)
      WHERE doc.id_document = $1`,
    [req.params.id],
  );
  if (!doc) return res.status(404).json({ message: 'Document introuvable' });
  const perms = req.user.perms || [];
  const proprietaire = perms.includes('DOSSIER_PROPRE') && doc.id_patient === req.user.id;
  const soignant = !proprietaire && perms.includes('DOSSIER_PATIENTS') && await aRelationDeSoins(req.user.id, doc.id_patient);
  if (!proprietaire && !soignant) return refuser(req, res, `document ${doc.id_document} hors de ses dossiers`);

  let contenu;
  try {
    contenu = await lireDocument(doc);
  } catch (err) {
    // fichier altéré, absent ou clé manquante : rien n'est transmis et une alerte est journalisée
    journaliser('DOCUMENT_ALTERE', req, { document: doc.id_document, erreur: err instanceof IntegriteError ? err.message : err.code || err.message });
    return res.status(500).json({ message: "Document momentanément indisponible (contrôle d'intégrité). La clinique a été alertée." });
  }

  const inline = req.query.inline === '1';
  journaliser('DOCUMENT_TELECHARGE', req, { document: doc.id_document, mode: inline ? 'consultation' : 'telechargement' });
  await journaliserAcces(req, {
    idPatient: doc.id_patient,
    idDocument: doc.id_document,
    action: inline ? 'consultation_document' : 'telechargement_document',
  });
  const nom = nomFichier(doc.titre);
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Length': contenu.length,
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${nom}"`,
    'Cache-Control': 'no-store',   // jamais conservé dans un cache partagé
  });
  return res.send(contenu);
});

module.exports = router;
