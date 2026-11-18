// Espace praticien du Sprint 4 (intégration, base requise)
//   docker compose exec api npx jest tests/praticien.test.js
const { db, creerPatient, creerPraticien, connecter, creerRdv, nettoyer } = require('./outils');

let dr; let autreDr; let salma; let amine; let nour; let agentDr;

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
