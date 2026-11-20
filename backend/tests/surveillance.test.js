// US-36 : alerte sur accès suspect (intégration, base et Mailpit requis)
//   docker compose exec api npx jest tests/surveillance.test.js
process.env.SEUIL_ACCES_SUSPECTS = '3';   // seuil abaissé pour le test (défaut : 20 dossiers par heure)
const { db, creerPatient, creerPraticien, creerAdmin, connecter, creerRdv, nettoyer } = require('./outils');

let admin; let dr; let calme; let patients; let agentDr;

beforeAll(async () => {
  admin = await creerAdmin();
  dr = await creerPraticien('Cardiologie', ['Sousse']);
  calme = await creerPraticien('Dermatologie', ['Sousse'], 'Leila', 'Gharbi');
  patients = [];
  for (const [p, n] of [['Salma', 'Ben Ali'], ['Amine', 'Jaziri'], ['Nour', 'Hammami'], ['Youssef', 'Mansour']]) {
    const pat = await creerPatient(p, n);
    await creerRdv(pat, dr, { dansJours: -2 - patients.length });
    patients.push(pat);
  }
  await creerRdv(patients[0], calme, { dansJours: -9 });
  agentDr = await connecter(dr);
});

afterAll(async () => {
  await nettoyer(admin, dr, calme, ...patients);
  await db.pool.end();
});

test('US-36 : 3 dossiers différents en une heure => une alerte et un e-mail à l\'administrateur', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  await agentDr.get(`/api/praticien/patients/${patients[0].id}/dossier`);
  await agentDr.get(`/api/praticien/patients/${patients[0].id}/dossier`);   // même dossier : ne compte qu'une fois
  await agentDr.get(`/api/praticien/patients/${patients[1].id}/dossier`);
  expect((await db.query('SELECT count(*)::int AS n FROM alertes_securite WHERE id_utilisateur = $1', [dr.id])).rows[0].n).toBe(0);

  await agentDr.get(`/api/praticien/patients/${patients[2].id}/dossier`);
  await agentDr.get(`/api/praticien/patients/${patients[3].id}/dossier`);   // 4e : pas de seconde alerte cette heure-ci
  const { rows } = await db.query('SELECT regle, nb_dossiers, details, statut FROM alertes_securite WHERE id_utilisateur = $1', [dr.id]);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ regle: 'ACCES_MASSIFS', nb_dossiers: 3, statut: 'nouvelle' });
  expect(rows[0].details.dossiers).toHaveLength(3);
  expect(warn.mock.calls.map((c) => JSON.parse(c[0])).some((l) => l.evenement === 'ACCES_SUSPECT' && l.utilisateur === dr.id)).toBe(true);
  warn.mockRestore();

  const { rows: mails } = await db.query("SELECT canal, statut FROM notifications WHERE id_destinataire = $1 AND type = 'securite'", [admin.id]);
  expect(mails).toEqual([{ canal: 'email', statut: 'envoyee' }]);
});

test('US-36 : un usage normal ne déclenche rien', async () => {
  await (await connecter(calme)).get(`/api/praticien/patients/${patients[0].id}/dossier`);
  expect((await db.query('SELECT count(*)::int AS n FROM alertes_securite WHERE id_utilisateur = $1', [calme.id])).rows[0].n).toBe(0);
});

test('US-36 : l\'administrateur voit l\'alerte et la marque comme traitée', async () => {
  const agentAdmin = await connecter(admin);
  const res = await agentAdmin.get('/api/admin/audit/alertes');
  const a = res.body.alertes.find((x) => x.email === dr.email);
  expect(a).toMatchObject({ nom: 'Trabelsi', nb_dossiers: 3, statut: 'nouvelle' });
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  expect((await agentAdmin.patch(`/api/admin/audit/alertes/${a.id_alerte}`)).status).toBe(200);
  warn.mockRestore();
  expect((await agentAdmin.patch(`/api/admin/audit/alertes/${a.id_alerte}`)).status).toBe(404);
  await db.query("UPDATE alertes_securite SET statut = 'traitee' WHERE id_utilisateur = $1", [dr.id]);
});
