// US-41 : verrouillage après 5 échecs (intégration, base requise)
//   docker compose exec api npx jest tests/bruteforce.test.js
const request = require('supertest');
const { app, db, creerPatient, creerPraticien, nettoyer } = require('./outils');
const { codeCourant } = require('../src/security/totp');

const PASSWORD = 'Ksv!7rTq2#Lm';
let patient; let praticien;

beforeAll(async () => {
  patient = await creerPatient();
  praticien = await creerPraticien();
});

afterAll(async () => {
  await nettoyer(patient, praticien);
  await db.pool.end();
});

const login = (email, password) => request(app).post('/api/auth/login').send({ email, password });

test('TA-3.2 : 5 mots de passe erronés => compte verrouillé 15 min, échec journalisé', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  for (let i = 1; i <= 4; i += 1) expect((await login(patient.email, 'Mauvais!Mdp2026')).status).toBe(401);
  const cinquieme = await login(patient.email, 'Mauvais!Mdp2026');
  expect(cinquieme.status).toBe(423);

  const lignes = warn.mock.calls.map((c) => JSON.parse(c[0]));
  expect(lignes.filter((l) => l.evenement === 'CONNEXION_ECHEC')).toHaveLength(5);
  expect(lignes.some((l) => l.evenement === 'COMPTE_VERROUILLE' && l.utilisateur === patient.id)).toBe(true);

  // même le bon mot de passe est refusé pendant le verrouillage
  expect((await login(patient.email, PASSWORD)).status).toBe(423);
  warn.mockRestore();

  // fin du verrouillage simulée : la connexion réussit et le compteur repart de zéro
  await db.query("UPDATE utilisateurs SET verrouille_jusqua = now() - interval '1 second' WHERE id_utilisateur = $1", [patient.id]);
  expect((await login(patient.email, PASSWORD)).status).toBe(200);
  const { rows } = await db.query('SELECT tentatives_echouees, verrouille_jusqua FROM utilisateurs WHERE id_utilisateur = $1', [patient.id]);
  expect(rows[0]).toEqual({ tentatives_echouees: 0, verrouille_jusqua: null });
});

test('US-41 : les codes MFA erronés comptent aussi (5 => verrouillé)', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: praticien.email, password: PASSWORD })).body).toEqual({ mfaRequis: true });
  const faux = codeCourant(praticien.secret) === '000000' ? '111111' : '000000';
  for (let i = 1; i <= 4; i += 1) expect((await agent.post('/api/auth/mfa').send({ code: faux })).status).toBe(401);
  expect((await agent.post('/api/auth/mfa').send({ code: faux })).status).toBe(423);
  // le bon code ne passe plus, et un nouveau mot de passe correct non plus
  expect((await agent.post('/api/auth/mfa').send({ code: codeCourant(praticien.secret) })).status).toBe(423);
  expect((await login(praticien.email, PASSWORD)).status).toBe(423);
  warn.mockRestore();
});
