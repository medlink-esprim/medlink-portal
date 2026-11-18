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
// idAuteur (Sprint 4) : praticien qui publie le document (NULL pour un document publié par script).
async function publierDocument({ idPatient, type, titre, contenu, idAuteur = null }) {
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
        `INSERT INTO documents_medicaux (id_document, id_dossier, type, titre, chemin_fichier, empreinte_sha256, id_auteur)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [idDocument, d.id_dossier, type, titre, nom, sha256(contenu), idAuteur],
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

// US-24 : PDF texte de plusieurs pages (Helvetica 11 pt), lignes coupées à 92 caractères.
// Les caractères accentués sont transcrits en lettres simples (police standard du PDF).
function pdfTexte(titre, lignes = []) {
  const esc = (t) => String(t).replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D\u00AB\u00BB]/g, '"').replace(/[\u2013\u2014]/g, '-')
    .replace(/\u0153/g, 'oe').replace(/\u2026/g, '...').replace(/\u00A0/g, ' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\x7E]/g, '?');
  const coupees = [];
  for (const ligne of lignes) {
    const mots = String(ligne).split(/\s+/).filter(Boolean);
    if (!mots.length) { coupees.push(''); continue; }
    let courante = '';
    for (const mot of mots) {
      if (courante && (courante.length + 1 + mot.length) > 92) { coupees.push(courante); courante = ''; }
      courante = courante ? `${courante} ${mot}` : mot.slice(0, 92);
    }
    coupees.push(courante);
  }
  const PAR_PAGE = 40;
  const pages = [];
  for (let i = 0; i === 0 || i < coupees.length; i += PAR_PAGE) pages.push(coupees.slice(i, i + PAR_PAGE));
  const objets = ['<< /Type /Catalog /Pages 2 0 R >>', null, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const kids = [];
  pages.forEach((page, n) => {
    const texte = [n === 0 ? `BT /F1 16 Tf 60 790 Td (${esc(titre)}) Tj ET` : `BT /F1 9 Tf 60 800 Td (${esc(titre)} - page ${n + 1}) Tj ET`,
      ...page.map((l, i) => `BT /F1 11 Tf 60 ${755 - i * 17} Td (${esc(l)}) Tj ET`)].join('\n');
    objets.push(`<< /Length ${Buffer.byteLength(texte)} >>\nstream\n${texte}\nendstream`);
    const contenu = objets.length;
    objets.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${contenu} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`);
    kids.push(`${objets.length} 0 R`);
  });
  objets[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`;
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objets.forEach((o, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objets.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

module.exports = { publierDocument, lireDocument, pdfExemple, pdfTexte, IntegriteError, cheminAbsolu };
