// US-35 : consultation du journal d'audit (intégration, base requise)
//   docker compose exec api npx jest tests/audit.test.js
const { db, creerPatient, creerPraticien, creerAdmin, creerAgent, connecter, creerRdv, nettoyer } = require('./outils');

let admin; let agent; let dr; let salma; let agentAdmin;

beforeAll(async () => {
  admin = await creerAdmin();
  agent = await creerAgent('Sousse');
  dr = await creerPraticien('Cardiologie', ['Sousse']);
  salma = await creerPatient('Salma', 'Ben Ali');
  await creerRdv(salma, dr, { dansJours: -3, statut: 'honore' });
  const agentDr = await connecter(dr);
  await agentDr.get(`/api/praticien/patients/${salma.id}/dossier`);   // une ligne dans le journal (US-47)
  agentAdmin = await connecter(admin);
});

afterAll(async () => {
  await nettoyer(admin, agent, dr, salma);
  await db.pool.end();
});

test('US-35 : l\'administrateur voit l\'utilisateur, le dossier, l\'action, la date et l\'heure', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const res = await agentAdmin.get('/api/admin/audit?patient=ben%20ali&utilisateur=trabelsi');
  expect(res.status).toBe(200);
  expect(res.body.total).toBeGreaterThanOrEqual(1);
  expect(res.body.lignes[0]).toMatchObject({
    utilisateur_nom: 'Trabelsi', role: 'PRATICIEN', patient_nom: 'Ben Ali', action: 'consultation_dossier',
  });
  expect(new Date(res.body.lignes[0].date_acces).getTime()).toBeLessThanOrEqual(Date.now());
  // la consultation du journal est elle-même tracée
  expect(warn.mock.calls.map((c) => JSON.parse(c[0])).some((l) => l.evenement === 'AUDIT_CONSULTE' && l.utilisateur === admin.id)).toBe(true);
  warn.mockRestore();
});

test('US-35 : filtres par action et par date, export CSV', async () => {
  const rien = await agentAdmin.get('/api/admin/audit?action=publication_document&patient=ben%20ali');
  expect(rien.body.total).toBe(0);
  expect((await agentAdmin.get('/api/admin/audit?du=2001-01-01&au=2001-01-02')).body.total).toBe(0);
  expect((await agentAdmin.get('/api/admin/audit?action=supprimer')).status).toBe(400);

  const csv = await agentAdmin.get('/api/admin/audit/export.csv?patient=ben%20ali');
  expect(csv.status).toBe(200);
  expect(csv.headers['content-type']).toMatch(/text\/csv/);
  expect(csv.text).toContain('"consultation_dossier"');
  expect(csv.text.split('\r\n')[0]).toContain('date;role;utilisateur');
});

test('US-35 : réservé à l\'administrateur (agent, praticien, patient => 403)', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  for (const u of [agent, salma]) expect((await (await connecter(u)).get('/api/admin/audit')).status).toBe(403);
  warn.mockRestore();
});
