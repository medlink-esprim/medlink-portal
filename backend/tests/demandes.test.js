// US-16 : export et suppression des données personnelles (intégration, base et Mailpit requis)
//   docker compose exec api npx jest tests/demandes.test.js
const { db, creerPatient, creerPraticien, creerAdmin, connecter, creerRdv, nettoyer } = require('./outils');

let admin; let dr; let salma; let amine; let patiente; let agentAdmin;

beforeAll(async () => {
  admin = await creerAdmin();
  dr = await creerPraticien('Cardiologie', ['Sousse']);
  salma = await creerPatient('Salma', 'Ben Ali');
  amine = await creerPatient('Amine', 'Jaziri');
  await creerRdv(salma, dr, { dansJours: -10, statut: 'honore' });
  patiente = await connecter(salma);
  agentAdmin = await connecter(admin);
});

afterAll(async () => {
  await nettoyer(admin, dr, salma, amine);
  await db.pool.end();
});

test('US-16 : la demande d\'export est transmise à l\'administration et suivie jusqu\'au fichier', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const res = await patiente.post('/api/patients/moi/demandes').send({ type: 'export', message: 'Pour mon nouveau médecin' });
  expect(res.status).toBe(201);
  expect((await patiente.post('/api/patients/moi/demandes').send({ type: 'export' })).status).toBe(409);   // une seule ouverte
  const { rows: mails } = await db.query("SELECT statut FROM notifications WHERE id_destinataire = $1 AND type = 'demande'", [admin.id]);
  expect(mails).toEqual([{ statut: 'envoyee' }]);

  const liste = await agentAdmin.get('/api/admin/demandes');
  expect(liste.body.find((d) => d.id_demande === res.body.idDemande)).toMatchObject({ type: 'export', statut: 'recue', nom: 'Ben Ali' });
  expect((await agentAdmin.patch(`/api/admin/demandes/${res.body.idDemande}`).send({ statut: 'en_cours' })).status).toBe(200);
  expect((await agentAdmin.patch(`/api/admin/demandes/${res.body.idDemande}`).send({ statut: 'traitee' })).status).toBe(200);
  warn.mockRestore();

  const mes = await patiente.get('/api/patients/moi/demandes');
  expect(mes.body[0]).toMatchObject({ statut: 'traitee', export_disponible: true });
  const fichier = await patiente.get(`/api/patients/moi/demandes/${res.body.idDemande}/export`);
  expect(fichier.status).toBe(200);
  const json = JSON.parse(fichier.text);
  expect(json.identite).toMatchObject({ nom: 'Ben Ali', prenom: 'Salma' });
  expect(json.rendez_vous).toEqual([expect.objectContaining({ statut: 'honore', motif: 'Contrôle annuel' })]);
  // stocké chiffré, et inaccessible à un autre patient
  const { rows: [d] } = await db.query('SELECT export_chiffre FROM demandes_donnees WHERE id_demande = $1', [res.body.idDemande]);
  expect(d.export_chiffre.toString('latin1')).not.toContain('Ben Ali');
  expect((await (await connecter(amine)).get(`/api/patients/moi/demandes/${res.body.idDemande}/export`)).status).toBe(404);
  const { rows: info } = await db.query("SELECT count(*)::int AS n FROM notifications WHERE id_destinataire = $1 AND type = 'demande'", [salma.id]);
  expect(info[0].n).toBe(2);   // « en cours » puis « traitée »
});

test('US-16 : suppression traitée => compte désactivé, session fermée, dossier médical conservé', async () => {
  const agentAmine = await connecter(amine);
  const res = await agentAmine.post('/api/patients/moi/demandes').send({ type: 'suppression' });
  expect(res.status).toBe(201);
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  expect((await agentAdmin.patch(`/api/admin/demandes/${res.body.idDemande}`).send({ statut: 'refusee' })).status).toBe(400);   // motif obligatoire
  expect((await agentAdmin.patch(`/api/admin/demandes/${res.body.idDemande}`).send({ statut: 'traitee' })).status).toBe(200);
  warn.mockRestore();
  const { rows: [u] } = await db.query('SELECT statut FROM utilisateurs WHERE id_utilisateur = $1', [amine.id]);
  expect(u.statut).toBe('desactive');
  expect((await agentAmine.get('/api/patients/moi')).status).toBe(401);
  const { rows: [p] } = await db.query('SELECT count(*)::int AS n FROM patients WHERE id_utilisateur = $1', [amine.id]);
  expect(p.n).toBe(1);   // le dossier patient existe toujours
  expect((await agentAdmin.patch(`/api/admin/demandes/${res.body.idDemande}`).send({ statut: 'traitee' })).status).toBe(409);
});

test('US-16 : réservé à l\'administrateur', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  expect((await patiente.get('/api/admin/demandes')).status).toBe(403);
  expect((await (await connecter(dr)).get('/api/admin/demandes')).status).toBe(403);
  warn.mockRestore();
});
