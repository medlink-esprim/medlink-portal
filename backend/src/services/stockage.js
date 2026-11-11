// US-13 / US-14 : stockage des documents médicaux.
// Chaque fichier est chiffré en AES-256-GCM (clé US-43, contexte = identifiant du document) et
// écrit hors de la racine web, dans le volume « documents ». La base ne garde que le chemin et
// l'empreinte SHA-256 du fichier en clair, vérifiée à chaque lecture (intégrité).
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const db = require('../db');
const config = require('../config');
const { chiffrerOctets, dechiffrerOctets } = require('../security/chiffrement');

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const cheminAbsolu = (nom) => path.join(config.documentsDir, path.basename(nom));   // jamais de « ../ »

class IntegriteError extends Error {}

// Publie un document dans le dossier du patient (créé au besoin) ; renvoie son identifiant.
async function publierDocument({ idPatient, type, titre, contenu }) {
  const idDocument = crypto.randomUUID();
  const nom = `${idDocument}.enc`;
  await fs.mkdir(config.documentsDir, { recursive: true, mode: 0o700 });
  await fs.writeFile(cheminAbsolu(nom), chiffrerOctets(contenu, idDocument), { mode: 0o600 });
  try {
    await db.withTransaction(async (client) => {
      const { rows: [d] } = await client.query(
        `INSERT INTO dossiers_medicaux (id_patient) VALUES ($1)
         ON CONFLICT (id_patient) DO UPDATE SET id_patient = EXCLUDED.id_patient
         RETURNING id_dossier`,
        [idPatient],
      );
      await client.query(
        `INSERT INTO documents_medicaux (id_document, id_dossier, type, titre, chemin_fichier, empreinte_sha256)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [idDocument, d.id_dossier, type, titre, nom, sha256(contenu)],
      );
    });
  } catch (err) {
    await fs.rm(cheminAbsolu(nom), { force: true });   // pas de fichier orphelin
    throw err;
  }
  return idDocument;
}

// Lit, déchiffre et vérifie un document (ligne de documents_medicaux) ; renvoie le Buffer en clair.
async function lireDocument(doc) {
  const chiffre = await fs.readFile(cheminAbsolu(doc.chemin_fichier));
  let clair;
  try {
    clair = dechiffrerOctets(chiffre, doc.id_document);
  } catch {
    throw new IntegriteError('Déchiffrement impossible (fichier modifié ou clé absente)');
  }
  if (sha256(clair) !== doc.empreinte_sha256) throw new IntegriteError('Empreinte SHA-256 différente');
  return clair;
}

// Petit PDF d'une page (démonstration et tests) : titre + lignes de texte
function pdfExemple(titre, lignes = []) {
  const esc = (t) => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\x7E]/g, '?');
  const texte = [`BT /F1 18 Tf 60 780 Td (${esc(titre)}) Tj ET`,
    ...lignes.map((l, i) => `BT /F1 11 Tf 60 ${740 - i * 18} Td (${esc(l)}) Tj ET`)].join('\n');
  const objets = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(texte)} >>\nstream\n${texte}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objets.forEach((o, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objets.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

module.exports = { publierDocument, lireDocument, pdfExemple, IntegriteError, cheminAbsolu };
