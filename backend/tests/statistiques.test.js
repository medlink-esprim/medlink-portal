// Statistiques de la Release 3 (intégration, base requise)
//   docker compose exec api npx jest tests/statistiques.test.js
const { db, creerPatient, creerPraticien, creerAgent, creerAdmin, connecter, creerRdv, creerCreneau, nettoyer } = require('./outils');

let agent; let admin; let drSousse; let drSfax; let salma; let amine; let agentAccueil; let du; let au;

beforeAll(async () => {
  agent = await creerAgent('Sousse');
  admin = await creerAdmin();
  drSousse = await creerPraticien('Cardiologie', ['Sousse']);
  drSfax = await creerPraticien('Dermatologie', ['Sfax'], 'Leila', 'Gharbi');
  salma = await creerPatient('Salma', 'Ben Ali');
  amine = await creerPatient('Amine', 'Jaziri');
  // période de test : un jour lointain, pour ne compter que les données créées ici
  await creerRdv(salma, drSousse, { dansJours: 400, heure: '09:00' });
  await creerRdv(amine, drSousse, { dansJours: 400, heure: '09:30', origine: 'accueil' });
  await creerCreneau(drSousse, { dansJours: 400, heure: '10:00' });
  await creerCreneau(drSousse, { dansJours: 400, heure: '10:30' });
  await creerRdv(salma, drSfax, { ville: 'Sfax', dansJours: 400, heure: '11:00', statut: 'annule' });
  await creerCreneau(drSfax, { ville: 'Sfax', dansJours: 400, heure: '11:30' });
  const { rows: [d] } = await db.query("SELECT ((now() AT TIME ZONE 'Africa/Tunis')::date + 400)::text AS j");
  du = d.j; au = d.j;
  agentAccueil = await connecter(agent);
});

afterAll(async () => {
  await nettoyer(agent, admin, drSousse, drSfax, salma, amine);
  await db.pool.end();
});

test('US-31 : taux d\'occupation et rendez-vous par clinique', async () => {
  const res = await agentAccueil.get(`/api/statistiques/supervision?du=${du}&au=${au}`);
  expect(res.status).toBe(200);
  const sousse = res.body.cliniques.find((c) => c.ville === 'Sousse');
  const sfax = res.body.cliniques.find((c) => c.ville === 'Sfax');
  expect(sousse).toMatchObject({ creneaux_ouverts: 4, creneaux_reserves: 2, taux_occupation: 50, rendez_vous: 2, en_ligne: 1, accueil: 1 });
  expect(sfax).toMatchObject({ creneaux_ouverts: 2, creneaux_reserves: 0, taux_occupation: 0, annules: 1 });
  expect(res.body.cliniques).toHaveLength(3);
  expect(JSON.stringify(res.body)).not.toMatch(/Ben Ali|Jaziri|exemple\.tn/);
});

test('US-31 : période contrôlée et accès réservé', async () => {
  expect((await agentAccueil.get('/api/statistiques/supervision?du=2026-02-30')).status).toBe(400);
  expect((await agentAccueil.get('/api/statistiques/supervision?du=2026-05-01&au=2026-04-01')).status).toBe(400);
  expect((await agentAccueil.get('/api/statistiques/supervision')).status).toBe(200);   // mois en cours par défaut
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  expect((await (await connecter(salma)).get('/api/statistiques/supervision')).status).toBe(403);
  warn.mockRestore();
  expect((await (await connecter(admin)).get(`/api/statistiques/supervision?du=${du}&au=${au}`)).status).toBe(200);
});
