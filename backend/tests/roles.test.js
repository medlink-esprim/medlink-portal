// US-33 : rôles et droits (intégration, base requise)
//   docker compose exec api npx jest tests/roles.test.js
const { db, creerPatient, creerAdmin, connecter, nettoyer } = require('./outils');

let admin; let patient; let agentAdmin; let matriceInitiale;

beforeAll(async () => {
  admin = await creerAdmin();
  patient = await creerPatient();
  agentAdmin = await connecter(admin);
  matriceInitiale = (await agentAdmin.get('/api/admin/roles')).body.matrice;
});

afterAll(async () => {
  // la matrice est partagée par toute la base : on la remet toujours dans son état initial
  if (matriceInitiale) await agentAdmin.put('/api/admin/roles').send({ matrice: matriceInitiale });
  await nettoyer(admin, patient);
  await db.pool.end();
});

test('US-33 : l\'administrateur lit la matrice, un patient est refusé', async () => {
  expect(matriceInitiale.PATIENT).toEqual(expect.arrayContaining(['DOSSIER_PROPRE', 'RDV_PRENDRE']));
  expect(matriceInitiale.AGENT_ADMIN).not.toContain('DOSSIER_PROPRE');   // moindre privilège
  const p = await connecter(patient);
  expect((await p.get('/api/admin/roles')).status).toBe(403);
});

test('TA-3.3 : retrait d\'une permission, effectif à la connexion suivante', async () => {
  const avant = await connecter(patient);
  expect((await avant.get('/api/praticiens')).status).toBe(200);

  const matrice = { ...matriceInitiale, PATIENT: matriceInitiale.PATIENT.filter((p) => p !== 'RDV_PRENDRE') };
  const put = await agentAdmin.put('/api/admin/roles').send({ matrice });
  expect(put.status).toBe(200);
  expect(put.body.changements).toEqual([{ role: 'PATIENT', ajouts: [], retraits: ['RDV_PRENDRE'] }]);

  const apres = await connecter(patient);
  expect((await apres.get('/api/praticiens')).status).toBe(403);
  const me = await apres.get('/api/auth/me');
  expect(me.body.permissions).not.toContain('RDV_PRENDRE');

  await agentAdmin.put('/api/admin/roles').send({ matrice: matriceInitiale });
  expect((await (await connecter(patient)).get('/api/praticiens')).status).toBe(200);
});

test('US-33 : l\'administrateur ne peut pas retirer la gestion des droits à son rôle', async () => {
  const matrice = { ...matriceInitiale, ADMIN: matriceInitiale.ADMIN.filter((p) => p !== 'ROLES_GERER') };
  expect((await agentAdmin.put('/api/admin/roles').send({ matrice })).status).toBe(422);
});
