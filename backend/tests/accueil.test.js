// US-30 : rendez-vous pris par l'accueil pour un patient (intégration, base requise)
//   docker compose exec api npx jest tests/accueil.test.js
const { db, creerPatient, creerPraticien, creerAgent, connecter, nettoyer } = require('./outils');

let agent; let agentSfax; let dr; let drSfax; let salma; let accueil; let libreSousse; let libreSfax;

// créneau libre à venir créé directement en base (plage d'un jour, 10:00, heure de Tunis)
async function creneauLibre(praticien, ville, dansJours) {
  const { rows: [p] } = await db.query(
    `INSERT INTO plages_disponibilite (id_praticien, id_clinique, jour_semaine, heure_debut, heure_fin, duree_creneau, date_debut, date_fin)
     SELECT $1, c.id_clinique, extract(isodow FROM j)::int, '10:00', '10:30', 30, j, j
       FROM cliniques c, (SELECT (now() AT TIME ZONE 'Africa/Tunis')::date + $3::int AS j) d
      WHERE c.ville = $2
     RETURNING id_plage, date_debut`,
    [praticien.id, ville, dansJours],
  );
  const { rows: [c] } = await db.query(
    `INSERT INTO creneaux (id_plage, debut, fin)
     VALUES ($1, ($2::date + time '10:00') AT TIME ZONE 'Africa/Tunis', ($2::date + time '10:30') AT TIME ZONE 'Africa/Tunis')
     RETURNING id_creneau`,
    [p.id_plage, p.date_debut],
  );
  return c.id_creneau;
}

beforeAll(async () => {
  agent = await creerAgent('Sousse');
  agentSfax = await creerAgent('Sfax', 'Hela', 'Kefi');
  dr = await creerPraticien('Cardiologie', ['Sousse']);
  drSfax = await creerPraticien('Dermatologie', ['Sfax'], 'Leila', 'Gharbi');
  salma = await creerPatient('Salma', 'Ben Ali');
  await db.query("UPDATE utilisateurs SET telephone = '+216 98 765 432' WHERE id_utilisateur = $1", [salma.id]);
  libreSousse = await creneauLibre(dr, 'Sousse', 3);
  libreSfax = await creneauLibre(drSfax, 'Sfax', 3);
  accueil = await connecter(agent);
});

afterAll(async () => {
  await nettoyer(agent, agentSfax, dr, drSfax, salma);
  await db.pool.end();
});

test('US-30 : l\'agent retrouve le dossier du patient (nom, numéro, téléphone)', async () => {
  const { rows: [p] } = await db.query('SELECT numero_dossier FROM patients WHERE id_utilisateur = $1', [salma.id]);
  for (const q of ['ben ali', p.numero_dossier, '98 765 432']) {
    const res = await accueil.get(`/api/accueil/patients?q=${encodeURIComponent(q)}`);
    expect(res.status).toBe(200);
    expect(res.body.map((x) => x.id_patient)).toContain(salma.id);
  }
  expect((await accueil.get('/api/accueil/patients?q=a')).status).toBe(400);
  // données administratives uniquement : pas de motif, pas de document
  const [premier] = (await accueil.get('/api/accueil/patients?q=ben%20ali')).body;
  expect(Object.keys(premier).sort()).toEqual(['date_naissance', 'email', 'id_patient', 'nom', 'numero_dossier', 'prenom', 'statut', 'telephone']);
});

test('US-30 : rendez-vous créé, signalé « pris par l\'accueil », patient notifié', async () => {
  const praticiens = await accueil.get('/api/accueil/praticiens');
  expect(praticiens.body.map((p) => p.id_praticien)).toContain(dr.id);
  expect(praticiens.body.map((p) => p.id_praticien)).not.toContain(drSfax.id);   // seulement sa clinique
  const creneaux = await accueil.get(`/api/accueil/creneaux?praticien=${dr.id}`);
  expect(creneaux.body.map((c) => c.id_creneau)).toContain(libreSousse);

  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const res = await accueil.post('/api/accueil/rendez-vous').send({ idPatient: salma.id, idCreneau: libreSousse, motif: 'Douleur thoracique' });
  expect(res.status).toBe(201);
  expect(warn.mock.calls.map((c) => JSON.parse(c[0])).some((l) => l.evenement === 'RDV_PRIS_ACCUEIL' && l.patient === salma.id)).toBe(true);
  warn.mockRestore();

  const { rows: [r] } = await db.query('SELECT origine, id_createur, statut FROM rendez_vous WHERE id_rdv = $1', [res.body.idRdv]);
  expect(r).toEqual({ origine: 'accueil', id_createur: agent.id, statut: 'planifie' });
  const { rows: notif } = await db.query("SELECT canal FROM notifications WHERE id_rdv = $1 AND type = 'confirmation'", [res.body.idRdv]);
  expect(notif.map((n) => n.canal)).toEqual(['email']);

  // le patient le voit dans « Mes rendez-vous » avec son origine
  const mes = await (await connecter(salma)).get('/api/patients/moi/rendez-vous');
  expect(mes.body.find((x) => x.id_rdv === res.body.idRdv)).toMatchObject({ origine: 'accueil', statut: 'planifie' });

  // le même créneau ne peut pas être réservé deux fois
  expect((await accueil.post('/api/accueil/rendez-vous').send({ idPatient: salma.id, idCreneau: libreSousse })).status).toBe(409);
});

test('US-30 : pas de réservation dans une autre clinique, ni par un patient', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  expect((await accueil.post('/api/accueil/rendez-vous').send({ idPatient: salma.id, idCreneau: libreSfax })).status).toBe(403);
  expect((await (await connecter(salma)).get('/api/accueil/patients?q=ben')).status).toBe(403);
  warn.mockRestore();
  expect((await accueil.post('/api/accueil/rendez-vous').send({ idPatient: dr.id, idCreneau: libreSfax })).status).toBe(404);
});
