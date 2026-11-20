// US-26 : historique des comptes-rendus d'un patient (intégration, base requise)
//   docker compose exec api npx jest tests/historique.test.js
const { db, creerPatient, creerPraticien, connecter, creerRdv, nettoyer } = require('./outils');

let dr; let confrere; let autreDr; let salma; let agentDr;

beforeAll(async () => {
  dr = await creerPraticien('Cardiologie', ['Sousse']);
  confrere = await creerPraticien('Médecine générale', ['Sousse'], 'Sami', 'Kefi');
  autreDr = await creerPraticien('Dermatologie', ['Sousse'], 'Leila', 'Gharbi');
  salma = await creerPatient('Salma', 'Ben Ali');
  agentDr = await connecter(dr);
  const agentConfrere = await connecter(confrere);
  // trois consultations passées : deux chez le confrère (dont une note privée), une chez dr
  const ancien = await creerRdv(salma, confrere, { dansJours: -40 });
  const prive = await creerRdv(salma, confrere, { dansJours: -20, heure: '10:00' });
  const recent = await creerRdv(salma, dr, { dansJours: -5 });
  await agentConfrere.post(`/api/praticien/rendez-vous/${ancien.idRdv}/compte-rendu`).send({ contenu: 'Bilan initial : tension 14/9.', visiblePatient: true });
  await agentConfrere.post(`/api/praticien/rendez-vous/${prive.idRdv}/compte-rendu`).send({ contenu: 'Note privée du confrère.', visiblePatient: false });
  await agentDr.post(`/api/praticien/rendez-vous/${recent.idRdv}/compte-rendu`).send({ contenu: 'Contrôle : tension 12/8, traitement efficace.', visiblePatient: true });
});

afterAll(async () => {
  const { rows } = await db.query(
    'SELECT doc.chemin_fichier FROM documents_medicaux doc JOIN dossiers_medicaux d USING (id_dossier) WHERE d.id_patient = $1',
    [salma.id],
  );
  const fs = require('fs/promises');
  const { cheminAbsolu } = require('../src/services/stockage');
  for (const r of rows) await fs.rm(cheminAbsolu(r.chemin_fichier), { force: true });
  await nettoyer(dr, confrere, autreDr, salma);
  await db.pool.end();
});

test('US-26 : les comptes-rendus s\'affichent du plus récent au plus ancien, tous praticiens', async () => {
  const res = await agentDr.get(`/api/praticien/patients/${salma.id}/comptes-rendus`);
  expect(res.status).toBe(200);
  expect(res.body.map((c) => [c.contenu, c.dr_nom, c.de_moi])).toEqual([
    ['Contrôle : tension 12/8, traitement efficace.', 'Trabelsi', true],
    ['Bilan initial : tension 14/9.', 'Kefi', false],
  ]);
  const dates = res.body.map((c) => new Date(c.date_consultation).getTime());
  expect(dates[0]).toBeGreaterThan(dates[1]);
  // l'accès est journalisé (US-47)
  const { rows: [j] } = await db.query('SELECT action FROM journal_acces_dossiers WHERE id_utilisateur = $1 ORDER BY id_acces DESC LIMIT 1', [dr.id]);
  expect(j.action).toBe('consultation_dossier');
});

test('US-26 : la note non visible reste visible de son seul auteur', async () => {
  const res = await (await connecter(confrere)).get(`/api/praticien/patients/${salma.id}/comptes-rendus`);
  expect(res.body.map((c) => c.contenu)).toContain('Note privée du confrère.');
});

test('US-26 : sans relation de soins => 403', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  expect((await (await connecter(autreDr)).get(`/api/praticien/patients/${salma.id}/comptes-rendus`)).status).toBe(403);
  warn.mockRestore();
});
