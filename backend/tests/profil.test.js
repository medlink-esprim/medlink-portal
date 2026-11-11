// US-04 / US-12 / US-15 : profil, préférences et consentement (intégration, base requise)
//   docker compose exec api npx jest tests/profil.test.js
const request = require('supertest');
const { app, db, creerPatient, connecter, nettoyer } = require('./outils');
const { POLITIQUE_VERSION } = require('../src/politique');

const PASSWORD = 'Ksv!7rTq2#Lm';
let patient; let agent;

beforeAll(async () => {
  patient = await creerPatient();
  agent = await connecter(patient);
});

afterAll(async () => {
  await nettoyer(patient);
  await db.pool.end();
});

test('US-15 : profil du patient connecté, préférences par défaut', async () => {
  const res = await agent.get('/api/patients/moi');
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({
    email: patient.email,
    preferences: { emailActif: true, smsActif: false, rappelActif: true },
    consentement: null,
    politiqueVersion: POLITIQUE_VERSION,
  });
});

test('US-04 : nouveau consentement historisé', async () => {
  expect((await agent.post('/api/patients/moi/consentement')).status).toBe(201);
  const res = await agent.get('/api/patients/moi');
  expect(res.body.consentement.version).toBe(POLITIQUE_VERSION);
});

test('US-12 : SMS refusé sans téléphone, accepté après l\'avoir ajouté', async () => {
  const prefs = { emailActif: true, smsActif: true, rappelActif: false };
  expect((await agent.put('/api/patients/moi/preferences').send(prefs)).status).toBe(422);
  const coord = await agent.put('/api/patients/moi/coordonnees').send({ email: patient.email, telephone: '+216 98 000 001' });
  expect(coord.status).toBe(200);
  expect((await agent.put('/api/patients/moi/preferences').send(prefs)).status).toBe(200);
  expect((await agent.get('/api/patients/moi')).body.preferences).toEqual(prefs);
});

test('US-15 : changement d\'e-mail => mot de passe exigé, nouvelle adresse à confirmer', async () => {
  const nouvelle = `nouveau.${Date.now()}@exemple.tn`;
  const sansMdp = await agent.put('/api/patients/moi/coordonnees').send({ email: nouvelle, telephone: '+216 98 000 001', motDePasseActuel: 'faux' });
  expect(sansMdp.status).toBe(403);
  const ok = await agent.put('/api/patients/moi/coordonnees').send({ email: nouvelle, telephone: '+216 98 000 001', motDePasseActuel: PASSWORD });
  expect(ok.status).toBe(200);
  const { rows: [u] } = await db.query('SELECT email, email_verifie FROM utilisateurs WHERE id_utilisateur = $1', [patient.id]);
  expect(u).toEqual({ email: nouvelle, email_verifie: false });
  // tant que la nouvelle adresse n'est pas confirmée, la connexion est refusée
  expect((await request(app).post('/api/auth/login').send({ email: nouvelle, password: PASSWORD })).status).toBe(401);
});

test('US-15 : sans session, l\'espace patient est refusé', async () => {
  const res = await request(app).get('/api/patients/moi');
  expect(res.status).toBe(401);
});
