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

// ===================== US-32 / US-46 : export anonymisé =====================
const { masquerPetitsEffectifs, versCsv, verifierColonnes } = require('../src/services/anonymisation');

test('US-46 : petits effectifs masqués, colonnes nominatives refusées, formules neutralisées', () => {
  expect(masquerPetitsEffectifs([{ nombre: 0 }, { nombre: 1 }, { nombre: 2 }, { nombre: 3 }]).map((l) => l.nombre)).toEqual([0, '<3', '<3', 3]);
  expect(() => verifierColonnes(['semaine', 'nom'])).toThrow(/nom/);
  expect(() => verifierColonnes(['clinique', 'telephone_patient'])).toThrow();
  expect(() => verifierColonnes(['semaine', 'clinique', 'specialite', 'nombre'])).not.toThrow();
  expect(versCsv(['clinique', 'nombre'], [{ clinique: '=CMD()', nombre: 4 }])).toBe('\uFEFFclinique;nombre\r\n"\'=CMD()";"4"\r\n');
});

test('US-32 : export CSV agrégé et anonymisé, réservé à STATS_EXPORTER', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  // trois rendez-vous honorés de plus à Sousse : la ligne (honore) atteint le seuil, (planifie) reste masquée
  for (const h of ['14:00', '14:30', '15:00']) await creerRdv(amine, drSousse, { dansJours: 400, heure: h, statut: 'honore' });
  const res = await agentAccueil.get(`/api/statistiques/export.csv?du=${du}&au=${au}`);
  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toMatch(/text\/csv/);
  const lignes = res.text.replace(/^\uFEFF/, '').trim().split('\r\n');
  expect(lignes[0]).toBe('semaine;clinique;specialite;origine;statut;nombre');
  expect(lignes).toContainEqual(expect.stringMatching(/"Sousse";"Cardiologie";"en_ligne";"honore";"3"$/));
  expect(lignes).toContainEqual(expect.stringMatching(/"Sousse";"Cardiologie";"en_ligne";"planifie";"<3"$/));
  expect(res.text).not.toMatch(/Ben Ali|Jaziri|Salma|Amine|Trabelsi|Gharbi|exemple\.tn|[0-9a-f]{8}-[0-9a-f]{4}-/i);
  expect(warn.mock.calls.some(([l]) => String(l).includes('STATS_EXPORTEES'))).toBe(true);
  // la direction exporte aussi ; l'administrateur du portail et le patient non (403)
  expect((await (await connecter(admin)).get(`/api/statistiques/export.csv?du=${du}&au=${au}`)).status).toBe(403);
  expect((await (await connecter(salma)).get('/api/statistiques/export.csv')).status).toBe(403);
  warn.mockRestore();
});
