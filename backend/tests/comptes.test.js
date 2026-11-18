// US-28 : modification et désactivation des comptes (intégration, base requise)
//   docker compose exec api npx jest tests/comptes.test.js
const { db, creerPatient, creerPraticien, creerAdmin, creerAgent, connecter, creerRdv, nettoyer } = require('./outils');

let admin; let agent; let dr; let salma; let amine; let agentAdmin; let agentAccueil;

beforeAll(async () => {
  admin = await creerAdmin();
  agent = await creerAgent('Sousse');
  dr = await creerPraticien('Cardiologie', ['Sousse']);
  salma = await creerPatient('Salma', 'Ben Ali');
  amine = await creerPatient('Amine', 'Jaziri');
  agentAdmin = await connecter(admin);
  agentAccueil = await connecter(agent);
});

afterAll(async () => {
  await nettoyer(admin, agent, dr, salma, amine);
  await db.pool.end();
});

test('US-28 : recherche des comptes par nom, rôle et statut', async () => {
  const res = await agentAccueil.get('/api/comptes/recherche?q=ben%20ali&role=PATIENT');
  expect(res.status).toBe(200);
  expect(res.body.map((c) => c.id_utilisateur)).toContain(salma.id);
  expect(res.body.every((c) => c.role === 'PATIENT')).toBe(true);
  const detail = await agentAccueil.get(`/api/comptes/${dr.id}`);
  expect(detail.body).toMatchObject({ role: 'PRATICIEN', specialite: 'Cardiologie', statut: 'actif', rdv_a_venir: 0 });
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  expect((await (await connecter(salma)).get('/api/comptes/recherche')).status).toBe(403);
  warn.mockRestore();
});

test('US-28 : modification (changement de poste) et refus d\'un champ d\'un autre rôle', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const res = await agentAccueil.put(`/api/comptes/${dr.id}`).send({ nom: 'Trabelsi', prenom: 'Karim', telephone: '+216 71 000 000', specialite: 'Cardiologie interventionnelle' });
  expect(res.status).toBe(200);
  expect(res.body.compte).toMatchObject({ specialite: 'Cardiologie interventionnelle', telephone: '+216 71 000 000' });
  expect(warn.mock.calls.map((c) => JSON.parse(c[0])).some((l) => l.evenement === 'COMPTE_MODIFIE' && l.compte === dr.id && l.role === 'AGENT_ADMIN')).toBe(true);

  expect((await agentAccueil.put(`/api/comptes/${salma.id}`).send({ nom: 'Ben Ali', prenom: 'Salma', specialite: 'X' })).status).toBe(422);
  // un agent ne modifie pas le compte d'un administrateur
  expect((await agentAccueil.put(`/api/comptes/${admin.id}`).send({ nom: 'X', prenom: 'Y' })).status).toBe(403);
  warn.mockRestore();
});

test('US-28 : désactivation => connexion impossible, session fermée aussitôt, historique conservé', async () => {
  const session = await connecter(amine);
  expect((await session.get('/api/patients/moi')).status).toBe(200);

  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const res = await agentAdmin.patch(`/api/comptes/${amine.id}/statut`).send({ statut: 'desactive' });
  expect(res.status).toBe(200);
  expect(warn.mock.calls.map((c) => JSON.parse(c[0])).some((l) => l.evenement === 'COMPTE_DESACTIVE' && l.compte === amine.id)).toBe(true);
  warn.mockRestore();

  expect((await session.get('/api/patients/moi')).status).toBe(401);                 // session révoquée
  const login = await (await connecter(amine)).get('/api/patients/moi');
  expect(login.status).toBe(401);                                                      // nouvelle connexion refusée
  const { rows: [u] } = await db.query('SELECT statut, date_desactivation, email FROM utilisateurs WHERE id_utilisateur = $1', [amine.id]);
  expect(u.statut).toBe('desactive');
  expect(u.date_desactivation).toBeTruthy();

  expect((await agentAdmin.patch(`/api/comptes/${amine.id}/statut`).send({ statut: 'desactive' })).status).toBe(409);
  expect((await agentAdmin.patch(`/api/comptes/${amine.id}/statut`).send({ statut: 'actif' })).status).toBe(200);
  expect((await (await connecter(amine)).get('/api/patients/moi')).status).toBe(200);
});

test('US-28 : pas de désactivation avec des rendez-vous à venir, ni de son propre compte', async () => {
  await creerRdv(salma, dr, { dansJours: 4 });
  const res = await agentAdmin.patch(`/api/comptes/${dr.id}/statut`).send({ statut: 'desactive' });
  expect(res.status).toBe(409);
  expect(res.body.rendezVous).toBe(1);
  expect((await agentAdmin.patch(`/api/comptes/${admin.id}/statut`).send({ statut: 'desactive' })).status).toBe(422);
  expect((await agentAdmin.patch(`/api/comptes/${dr.id}/statut`).send({ statut: 'supprime' })).status).toBe(400);
});
