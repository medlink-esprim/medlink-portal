// US-38 : maintenance annoncée 48 h à l'avance (intégration, base requise)
//   docker compose exec api npx jest tests/maintenance.test.js
const request = require('supertest');
const { app, db, creerAdmin, creerPatient, connecter, nettoyer } = require('./outils');

let admin; let salma; let agentAdmin; let idAnnonce;
const dans = (heures) => new Date(Date.now() + heures * 3600 * 1000).toISOString();

beforeAll(async () => {
  admin = await creerAdmin();
  salma = await creerPatient();
  agentAdmin = await connecter(admin);
  await db.query('UPDATE annonces_maintenance SET annulee = true WHERE NOT annulee');   // base de test propre
});

afterAll(async () => {
  await db.query('DELETE FROM annonces_maintenance WHERE id_auteur = $1', [admin.id]);
  await nettoyer(admin, salma);
  await db.pool.end();
});

test('US-38 : annonce refusée à moins de 48 h, acceptée au-delà', async () => {
  expect((await agentAdmin.post('/api/maintenance').send({ debut: dans(47), fin: dans(49), message: 'Mise à jour du serveur' })).status).toBe(422);
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const res = await agentAdmin.post('/api/maintenance').send({ debut: dans(72), fin: dans(74), message: 'Mise à jour du serveur' });
  expect(res.status).toBe(201);
  expect(warn.mock.calls.map((c) => JSON.parse(c[0])).some((l) => l.evenement === 'MAINTENANCE_ANNONCEE')).toBe(true);
  warn.mockRestore();
  idAnnonce = res.body.idAnnonce;
  expect((await agentAdmin.post('/api/maintenance').send({ debut: dans(80), fin: dans(79), message: 'Fin avant début' })).status).toBe(400);
});

test('US-38 : le bandeau s\'affiche pour tous, même non connectés, dès 48 h avant le début', async () => {
  // 72 h avant : pas encore de bandeau
  expect((await request(app).get('/api/maintenance/annonce')).body.annonce).toBeNull();
  // le temps passe : début dans 24 h
  await db.query("UPDATE annonces_maintenance SET debut = now() + interval '24 hours', fin = now() + interval '26 hours' WHERE id_annonce = $1", [idAnnonce]);
  const res = await request(app).get('/api/maintenance/annonce');
  expect(res.status).toBe(200);
  expect(res.body.annonce).toMatchObject({ id_annonce: idAnnonce, message: 'Mise à jour du serveur' });
  // annulation : le bandeau disparaît
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  expect((await agentAdmin.delete(`/api/maintenance/${idAnnonce}`)).status).toBe(200);
  warn.mockRestore();
  expect((await request(app).get('/api/maintenance/annonce')).body.annonce).toBeNull();
});

test('US-38 : seul l\'administrateur publie une annonce', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  expect((await (await connecter(salma)).post('/api/maintenance').send({ debut: dans(72), fin: dans(74), message: 'Pirate' })).status).toBe(403);
  expect((await request(app).post('/api/maintenance').send({ debut: dans(72), fin: dans(74), message: 'Pirate' })).status).toBe(401);
  warn.mockRestore();
});
