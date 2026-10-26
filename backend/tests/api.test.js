// Tests d'intégration : à lancer DANS le conteneur, la base doit tourner.
//   docker compose exec api npm test
const request = require('supertest');
const app = require('../src/app');
const db = require('../src/db');
const { issueToken } = require('../src/security/tokens');

const email = `test.${Date.now()}@exemple.tn`;
const password = 'Ksv!7rTq2#Lm';

afterAll(async () => {
  await db.query('DELETE FROM utilisateurs WHERE email = $1', [email]);
  await db.pool.end();
});

test('US-56 : /api/health lit la base', async () => {
  const res = await request(app).get('/api/health');
  expect(res.status).toBe(200);
  expect(res.body.cliniques).toBe(3);
});

test('US-01 : mot de passe trop court => 422 avec les règles', async () => {
  const res = await request(app).post('/api/auth/inscription')
    .send({ nom: 'Test', prenom: 'Patient', email, telephone: '+216 98 000 000', password: 'court' });
  expect(res.status).toBe(422);
  expect(res.body.regles).toContain('12 caractères minimum');
});

test('US-01 + US-02 : inscription, vérification puis connexion', async () => {
  const signup = await request(app).post('/api/auth/inscription')
    .send({ nom: 'Test', prenom: 'Patient', email, telephone: '+216 98 000 000', password });
  expect(signup.status).toBe(202);

  // avant vérification : connexion refusée
  let login = await request(app).post('/api/auth/login').send({ email, password });
  expect(login.status).toBe(401);

  // on émet un jeton de vérification comme l'aurait fait l'e-mail
  const { rows } = await db.query('SELECT id_utilisateur FROM utilisateurs WHERE email = $1', [email]);
  const token = await db.withTransaction((c) => issueToken(c, rows[0].id_utilisateur, 'verification_email', 5));
  const verif = await request(app).post('/api/auth/verification').send({ token });
  expect(verif.status).toBe(200);

  // jeton à usage unique
  const again = await request(app).post('/api/auth/verification').send({ token });
  expect(again.status).toBe(400);

  login = await request(app).post('/api/auth/login').send({ email, password });
  expect(login.status).toBe(200);
  expect(login.headers['set-cookie'][0]).toMatch(/medlink_session=.*HttpOnly/);
});

test('US-02 : e-mail inconnu et mauvais mot de passe => réponse identique', async () => {
  const a = await request(app).post('/api/auth/login').send({ email: 'inconnu@exemple.tn', password });
  const b = await request(app).post('/api/auth/login').send({ email, password: 'Mauvais!Pass99' });
  expect(a.status).toBe(401);
  expect(b.status).toBe(401);
  expect(a.body).toEqual(b.body);
});

test('US-27 : un patient ne peut pas créer de compte => 403', async () => {
  const login = await request(app).post('/api/auth/login').send({ email, password });
  const res = await request(app).post('/api/comptes')
    .set('Cookie', login.headers['set-cookie'])
    .send({ nom: 'X', prenom: 'Y', email: 'x@y.tn', role: 'PRATICIEN', specialite: 'Cardiologie' });
  expect(res.status).toBe(403);
});

// ---------------- Sprint 2 ----------------

test('US-40 : refresh puis expiration après 15 min d\'inactivité (TA-2.2)', async () => {
  const agent = request.agent(app);
  const login = await agent.post('/api/auth/login').send({ email, password });
  expect(login.status).toBe(200);
  expect(login.headers['set-cookie'].join(';')).toMatch(/medlink_refresh=.*Path=\/api\/auth.*HttpOnly/);

  expect((await agent.get('/api/auth/me')).status).toBe(200);
  expect((await agent.post('/api/auth/refresh')).status).toBe(200);

  // on simule 16 minutes sans aucune requête
  await db.query(
    `UPDATE sessions SET derniere_activite = now() - interval '16 minutes'
      WHERE id_utilisateur = (SELECT id_utilisateur FROM utilisateurs WHERE email = $1)`,
    [email],
  );
  const me = await agent.get('/api/auth/me');
  expect(me.status).toBe(401);
  expect(me.body.code).toBe('SESSION_EXPIREE');
  expect((await agent.post('/api/auth/refresh')).status).toBe(401);
});

test('US-40 : la déconnexion révoque le jeton de rafraîchissement', async () => {
  const agent = request.agent(app);
  const login = await agent.post('/api/auth/login').send({ email, password });
  const refreshCookie = login.headers['set-cookie'].find((c) => c.startsWith('medlink_refresh=')).split(';')[0];
  expect((await agent.post('/api/auth/logout')).status).toBe(204);
  // même avec l'ancien cookie conservé par un attaquant, la session ne peut plus être prolongée
  const replay = await request(app).post('/api/auth/refresh').set('Cookie', refreshCookie);
  expect(replay.status).toBe(401);
});

test('US-39 : un patient sur une route du back-office => 403 journalisé (TA-2.3)', async () => {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password });
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const res = await agent.get('/api/comptes');
  expect(res.status).toBe(403);
  const ligne = JSON.parse(warn.mock.calls.at(-1)[0]);
  expect(ligne).toMatchObject({ evenement: 'ACCES_REFUSE', role: 'PATIENT', route: '/api/comptes' });
  warn.mockRestore();
});
