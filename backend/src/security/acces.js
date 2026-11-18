// US-47 : journal des accès aux dossiers médicaux (qui, quoi, quand).
// Chaque accès AUTORISÉ à un dossier ou à un document écrit une ligne dans la table
// journal_acces_dossiers (en ajout seul : ni modification ni suppression possibles),
// AVANT que la moindre donnée soit envoyée : si l'écriture échoue, l'accès échoue aussi.
// La même information est écrite sur une ligne JSON (docker compose logs api | grep ACCES_DOSSIER).
const db = require('../db');
const { journaliser } = require('./journal');

const ACTIONS = ['consultation_dossier', 'consultation_document', 'telechargement_document',
  'redaction_compte_rendu', 'publication_document'];

async function journaliserAcces(req, { idPatient, idDocument = null, action }, client = db) {
  if (!ACTIONS.includes(action)) throw new Error(`Action de journal inconnue : ${action}`);
  await client.query(
    `INSERT INTO journal_acces_dossiers (id_utilisateur, role, id_patient, id_document, action, adresse_ip)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [req.user.id, req.user.role, idPatient, idDocument, action, req.ip || null],
  );
  journaliser('ACCES_DOSSIER', req, { patient: idPatient, document: idDocument, action });
}

module.exports = { journaliserAcces, ACTIONS };
