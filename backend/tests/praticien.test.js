// Espace praticien du Sprint 4 (intégration, base requise)
//   docker compose exec api npx jest tests/praticien.test.js
const fs = require('fs/promises');
const { db, creerPatient, creerPraticien, connecter, creerRdv, nettoyer } = require('./outils');
const { publierDocument, pdfExemple, cheminAbsolu } = require('../src/services/stockage');

let dr; let autreDr; let salma; let amine; let nour; let agentDr;
const fichiers = [];

beforeAll(async () => {
  dr = await creerPraticien('Cardiologie', ['Sousse', 'Sfax']);
  autreDr = await creerPraticien('Dermatologie', ['Tunis'], 'Leila', 'Gharbi');
  salma = await creerPatient('Salma', 'Ben Ali');
  amine = await creerPatient('Amine', 'Jaziri');
  nour = await creerPatient('Nour', 'Hammami');
  await creerRdv(salma, dr, { dansJours: -20, statut: 'honore' });
  await creerRdv(amine, dr, { ville: 'Sfax', dansJours: 3 });
  await creerRdv(nour, autreDr, { ville: 'Tunis', dansJours: 2 });   // patiente d'un autre praticien
  agentDr = await connecter(dr);
});

afterAll(async () => {
  for (const id of fichiers) await fs.rm(cheminAbsolu(`${id}.enc`), { force: true });
  await nettoyer(dr, autreDr, salma, amine, nour);
  await db.pool.end();
});

test('US-22 : le praticien ne voit que ses propres patients', async () => {
  const res = await agentDr.get('/api/praticien/patients');
  expect(res.status).toBe(200);
  const ids = res.body.map((p) => p.id_patient);
  expect(ids).toEqual(expect.arrayContaining([salma.id, amine.id]));
  expect(ids).not.toContain(nour.id);
});

test('US-22 : recherche par nom (insensible à la casse) et par numéro de dossier', async () => {
  const parNom = await agentDr.get('/api/praticien/patients?q=ben%20ali');
  expect(parNom.body.map((p) => p.id_patient)).toEqual([salma.id]);

  const { rows: [p] } = await db.query('SELECT numero_dossier FROM patients WHERE id_utilisateur = $1', [amine.id]);
  const parNumero = await agentDr.get(`/api/praticien/patients?q=${encodeURIComponent(p.numero_dossier)}`);
  expect(parNumero.body).toEqual([expect.objectContaining({ id_patient: amine.id, numero_dossier: p.numero_dossier })]);
  expect(parNumero.body[0].prochain_rdv).toBeTruthy();

  // la patiente d'un autre praticien n'est jamais trouvée, même par son nom exact
  expect((await agentDr.get('/api/praticien/patients?q=Hammami')).body).toEqual([]);
  // % et _ sont cherchés tels quels
  expect((await agentDr.get('/api/praticien/patients?q=%25')).body).toEqual([]);
});

test('US-22 : un patient n\'a pas accès à la recherche des praticiens', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  expect((await (await connecter(salma)).get('/api/praticien/patients')).status).toBe(403);
  warn.mockRestore();
});

test('US-23 / US-47 : dossier du patient reçu, accès écrit dans le journal', async () => {
  const idDoc = await publierDocument({ idPatient: salma.id, type: 'resultat', titre: 'Bilan lipidique', contenu: pdfExemple('Bilan') });
  fichiers.push(idDoc);
  const avant = (await db.query('SELECT count(*)::int AS n FROM journal_acces_dossiers WHERE id_patient = $1', [salma.id])).rows[0].n;

  const res = await agentDr.get(`/api/praticien/patients/${salma.id}/dossier`);
  expect(res.status).toBe(200);
  expect(res.body.patient).toMatchObject({ id_patient: salma.id, nom: 'Ben Ali', prenom: 'Salma' });
  expect(res.body.rendezVous).toEqual([expect.objectContaining({ statut: 'honore', motif: 'Contrôle annuel', ville: 'Sousse' })]);
  expect(res.body.documents).toEqual([expect.objectContaining({ id_document: idDoc, titre: 'Bilan lipidique' })]);

  const { rows } = await db.query(
    'SELECT id_utilisateur, role, action FROM journal_acces_dossiers WHERE id_patient = $1 ORDER BY id_acces DESC LIMIT 1',
    [salma.id],
  );
  expect(rows[0]).toEqual({ id_utilisateur: dr.id, role: 'PRATICIEN', action: 'consultation_dossier' });
  expect((await db.query('SELECT count(*)::int AS n FROM journal_acces_dossiers WHERE id_patient = $1', [salma.id])).rows[0].n).toBe(avant + 1);

  // le praticien peut ouvrir le document de son patient ; l'accès est journalisé
  const doc = await agentDr.get(`/api/documents/${idDoc}/fichier?inline=1`);
  expect(doc.status).toBe(200);
  const { rows: [j] } = await db.query('SELECT action, id_document FROM journal_acces_dossiers WHERE id_utilisateur = $1 ORDER BY id_acces DESC LIMIT 1', [dr.id]);
  expect(j).toEqual({ action: 'consultation_document', id_document: idDoc });

  // le patient voit cet accès dans « Mon profil »
  const vu = await (await connecter(salma)).get('/api/patients/moi/acces');
  expect(vu.body.some((a) => a.action === 'consultation_dossier' && a.auteur === 'Dr Karim Trabelsi')).toBe(true);
});

test('US-23 : sans rendez-vous avec le patient => 403 journalisé, aucune donnée', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const res = await agentDr.get(`/api/praticien/patients/${nour.id}/dossier`);
  expect(res.status).toBe(403);
  expect(res.body).toEqual({ message: 'Accès interdit' });
  expect(JSON.parse(warn.mock.calls.at(-1)[0])).toMatchObject({ evenement: 'ACCES_REFUSE', utilisateur: dr.id });

  const idDoc = await publierDocument({ idPatient: nour.id, type: 'resultat', titre: 'Glycémie', contenu: pdfExemple('G') });
  fichiers.push(idDoc);
  expect((await agentDr.get(`/api/documents/${idDoc}/fichier`)).status).toBe(403);
  warn.mockRestore();
  const { rows } = await db.query('SELECT count(*)::int AS n FROM journal_acces_dossiers WHERE id_utilisateur = $1 AND id_patient = $2', [dr.id, nour.id]);
  expect(rows[0].n).toBe(0);
  expect((await agentDr.get('/api/praticien/patients/pas-un-uuid/dossier')).status).toBe(404);
});
