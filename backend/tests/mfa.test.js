// US-17 / US-34 : connexion d'un praticien avec second facteur TOTP (intégration, base requise)
//   docker compose exec api npx jest tests/mfa.test.js
const request = require('supertest');
const argon2 = require('argon2');
const app = require('../src/app');
const db = require('../src/db');
const { codeCourant } = require('../src/security/totp');

const email = `praticien.${Date.now()}@exemple.tn`;
const password = 'Ksv!7rTq2#Lm';
let secret;
let codesSecours;

beforeAll(async () => {
  const hash = await argon2.hash(password, { type: argon2.argon2id });
  const { rows } = await db.query(
    `INSERT INTO utilisateurs (id_role, nom, prenom, email, mot_de_passe_hash, statut, email_verifie)
     VALUES ((SELECT id_role FROM roles WHERE code = 'PRATICIEN'), 'Trabelsi', 'Karim', $1, $2, 'actif', true)
     RETURNING id_utilisateur`,
    [email, hash],
  );
  await db.query("INSERT INTO praticiens (id_utilisateur, specialite) VALUES ($1, 'Cardiologie')", [rows[0].id_utilisateur]);
});

afterAll(async () => {
  await db.query('DELETE FROM utilisateurs WHERE email = $1', [email]);
  await db.pool.end();
});

test('1re connexion : enrôlement obligatoire, aucune session avant le code', async () => {
  const agent = request.agent(app);
  const login = await agent.post('/api/auth/login').send({ email, password });
  expect(login.status).toBe(200);
  expect(login.body).toEqual({ mfaEnrolement: true });
  expect((await agent.get('/api/auth/me')).status).toBe(401);

  const enrol = await agent.post('/api/auth/mfa/enrolement');
  expect(enrol.status).toBe(200);
  expect(enrol.body.qr).toMatch(/^data:image\/png;base64,/);
  secret = enrol.body.secret;

  // le secret est stocké chiffré, jamais en clair
  const { rows } = await db.query('SELECT mfa_secret_chiffre FROM utilisateurs WHERE email = $1', [email]);
  expect(rows[0].mfa_secret_chiffre.toString('latin1')).not.toContain(secret);

  const confirm = await agent.post('/api/auth/mfa/enrolement/confirmation').send({ code: codeCourant(secret) });
  expect(confirm.status).toBe(200);
  expect(confirm.body.codesSecours).toHaveLength(10);
  codesSecours = confirm.body.codesSecours;
  expect((await agent.get('/api/auth/me')).status).toBe(200);
});

test('TA-2.1 : mot de passe correct + code TOTP erroné => refus', async () => {
  const agent = request.agent(app);
  const login = await agent.post('/api/auth/login').send({ email, password });
  expect(login.body).toEqual({ mfaRequis: true });
  const bad = await agent.post('/api/auth/mfa').send({ code: '000000' === codeCourant(secret) ? '111111' : '000000' });
  expect(bad.status).toBe(401);
  expect((await agent.get('/api/auth/me')).status).toBe(401);

  const ok = await agent.post('/api/auth/mfa').send({ code: codeCourant(secret) });
  expect(ok.status).toBe(200);
  expect(ok.body.role).toBe('PRATICIEN');
  expect((await agent.get('/api/auth/me')).status).toBe(200);
});

test('code de secours : accepté une seule fois', async () => {
  const a = request.agent(app);
  await a.post('/api/auth/login').send({ email, password });
  const first = await a.post('/api/auth/mfa').send({ codeSecours: codesSecours[0].toLowerCase() });
  expect(first.status).toBe(200);
  expect(first.body.codesSecoursRestants).toBe(9);

  const b = request.agent(app);
  await b.post('/api/auth/login').send({ email, password });
  expect((await b.post('/api/auth/mfa').send({ codeSecours: codesSecours[0] })).status).toBe(401);
});

test('sans passer par le mot de passe, /api/auth/mfa est refusé', async () => {
  const res = await request(app).post('/api/auth/mfa').send({ code: codeCourant(secret) });
  expect(res.status).toBe(401);
});
