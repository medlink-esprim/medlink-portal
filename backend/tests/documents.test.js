// US-13 / US-14 : documents du patient (intégration, base et volume « documents » requis)
//   docker compose exec api npx jest tests/documents.test.js
const fs = require('fs/promises');
const { db, creerPatient, creerPraticien, connecter, nettoyer } = require('./outils');
const { publierDocument, pdfExemple, cheminAbsolu } = require('../src/services/stockage');

let patient; let autre; let praticien; let idDoc;
const fichiers = [];

beforeAll(async () => {
  patient = await creerPatient();
  autre = await creerPatient('Amine', 'Jaziri');
  praticien = await creerPraticien();
  idDoc = await publierDocument({ idPatient: patient.id, type: 'resultat', titre: 'Bilan lipidique', contenu: pdfExemple('Bilan lipidique', ['Test']) });
  fichiers.push(idDoc);
});

afterAll(async () => {
  for (const id of fichiers) await fs.rm(cheminAbsolu(`${id}.enc`), { force: true });
  await nettoyer(patient, autre, praticien);
  await db.pool.end();
});

test('US-13 : le fichier est stocké chiffré, avec son empreinte SHA-256', async () => {
  const brut = await fs.readFile(cheminAbsolu(`${idDoc}.enc`));
  expect(brut.toString('latin1')).not.toContain('%PDF');
  const { rows: [d] } = await db.query('SELECT empreinte_sha256, chemin_fichier FROM documents_medicaux WHERE id_document = $1', [idDoc]);
  expect(d.empreinte_sha256).toMatch(/^[0-9a-f]{64}$/);
  expect(d.chemin_fichier).toBe(`${idDoc}.enc`);
});

test('US-13 : chaque patient ne voit que ses propres documents', async () => {
  const a = await connecter(patient);
  const liste = await a.get('/api/patients/moi/documents');
  expect(liste.status).toBe(200);
  expect(liste.body).toEqual([expect.objectContaining({ id_document: idDoc, type: 'resultat', titre: 'Bilan lipidique' })]);

  const b = await connecter(autre);
  expect((await b.get('/api/patients/moi/documents')).body).toEqual([]);

  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const p = await connecter(praticien);
  expect((await p.get('/api/patients/moi/documents')).status).toBe(403);   // pas la permission DOSSIER_PROPRE
  warn.mockRestore();
});

// lit la réponse binaire (PDF) dans un Buffer
const binaire = (res, cb) => {
  const morceaux = [];
  res.on('data', (m) => morceaux.push(m));
  res.on('end', () => cb(null, Buffer.concat(morceaux)));
};

test('US-14 : téléchargement déchiffré, identique à l\'original, accès journalisé', async () => {
  const a = await connecter(patient);
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const res = await a.get(`/api/documents/${idDoc}/fichier`).buffer(true).parse(binaire);
  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toBe('application/pdf');
  expect(res.headers['content-disposition']).toBe('attachment; filename="Bilan_lipidique.pdf"');
  expect(res.headers['cache-control']).toBe('no-store');
  expect(res.body.equals(pdfExemple('Bilan lipidique', ['Test']))).toBe(true);
  expect(warn.mock.calls.map((c) => JSON.parse(c[0])).some((l) => l.evenement === 'DOCUMENT_TELECHARGE' && l.document === idDoc)).toBe(true);
  warn.mockRestore();
});

test('TA-3.6 : identifiant du document d\'un autre patient dans l\'URL => 403 journalisé', async () => {
  const b = await connecter(autre);
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const res = await b.get(`/api/documents/${idDoc}/fichier`);
  expect(res.status).toBe(403);
  expect(JSON.parse(warn.mock.calls.at(-1)[0])).toMatchObject({ evenement: 'ACCES_REFUSE', utilisateur: autre.id });
  warn.mockRestore();
  expect((await b.get('/api/documents/pas-un-uuid/fichier')).status).toBe(404);
});

test('US-14 : fichier altéré => rien n\'est transmis, alerte journalisée', async () => {
  const id = await publierDocument({ idPatient: patient.id, type: 'autre', titre: 'Test intégrité', contenu: pdfExemple('Test') });
  fichiers.push(id);
  const chemin = cheminAbsolu(`${id}.enc`);
  const brut = await fs.readFile(chemin);
  brut[brut.length - 1] ^= 1;   // un seul bit modifié
  await fs.writeFile(chemin, brut);

  const a = await connecter(patient);
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const res = await a.get(`/api/documents/${id}/fichier`);
  expect(res.status).toBe(500);
  expect(res.headers['content-type']).toMatch(/json/);
  expect(warn.mock.calls.map((c) => JSON.parse(c[0])).some((l) => l.evenement === 'DOCUMENT_ALTERE')).toBe(true);
  warn.mockRestore();
});
