// Sprint 2 : disponibilités, recherche et réservation (intégration, base requise)
//   docker compose exec api npx jest tests/rendezvous.test.js
const { db, creerPatient, creerPraticien, connecter, idClinique, prochainJour, nettoyer } = require('./outils');

let praticien; let patient; let autrePatient;
let agentPraticien; let agentPatient;

beforeAll(async () => {
  praticien = await creerPraticien('Cardiologie', ['Sousse', 'Sfax']);
  patient = await creerPatient();
  autrePatient = await creerPatient('Amine', 'Gharbi');
  agentPraticien = await connecter(praticien);
  agentPatient = await connecter(patient);
});

afterAll(async () => {
  await nettoyer(praticien, patient, autrePatient);
  await db.pool.end();
});

// ---------- US-18 ----------
test('US-18 : une plage publiée génère les créneaux (lundi 08:30-12:30, 30 min, 3 semaines)', async () => {
  const debut = prochainJour(1);
  const fin = new Date(new Date(`${debut}T00:00:00Z`).getTime() + 20 * 86400000).toISOString().slice(0, 10);
  const res = await agentPraticien.post('/api/disponibilites').send({
    idClinique: await idClinique('Sousse'), jourSemaine: 1, heureDebut: '08:30', heureFin: '12:30',
    dureeCreneau: 30, dateDebut: debut, dateFin: fin,
  });
  expect(res.status).toBe(201);
  expect(res.body.creneauxGeneres).toBe(24);   // 3 lundis x 8 créneaux

  const liste = await agentPraticien.get('/api/disponibilites');
  expect(liste.body).toHaveLength(1);
  expect(liste.body[0]).toMatchObject({ ville: 'Sousse', jour_semaine: 1, heure_debut: '08:30', creneaux_a_venir: 24 });
});

test('US-18 : une plage qui chevauche la précédente est refusée (409)', async () => {
  const res = await agentPraticien.post('/api/disponibilites').send({
    idClinique: await idClinique('Sfax'), jourSemaine: 1, heureDebut: '12:00', heureFin: '13:00',
    dureeCreneau: 30, dateFin: prochainJour(1),
  });
  expect(res.status).toBe(409);
});

test('US-18 / US-39 : clinique non affectée => 403 ; patient => 403', async () => {
  const res = await agentPraticien.post('/api/disponibilites').send({
    idClinique: await idClinique('Tunis'), jourSemaine: 2, heureDebut: '08:00', heureFin: '10:00',
    dureeCreneau: 30, dateFin: prochainJour(2),
  });
  expect(res.status).toBe(403);
  expect((await agentPatient.get('/api/disponibilites')).status).toBe(403);
});

// ---------- US-05 / US-06 ----------
test('US-05 : recherche par spécialité et clinique', async () => {
  const sousse = await idClinique('Sousse');
  const res = await agentPatient.get(`/api/praticiens?specialite=Cardiologie&clinique=${sousse}`);
  expect(res.status).toBe(200);
  const trouve = res.body.find((p) => p.id_praticien === praticien.id);
  expect(trouve).toMatchObject({ specialite: 'Cardiologie', villes: 'Sfax, Sousse' });
  expect(trouve.creneaux_libres).toBeGreaterThanOrEqual(8);

  const tunis = await idClinique('Tunis');
  const aucun = await agentPatient.get(`/api/praticiens?clinique=${tunis}`);
  expect(aucun.body.find((p) => p.id_praticien === praticien.id)).toBeUndefined();
});

test('US-06 / TA-2.7 : créneaux libres triés par date', async () => {
  const debut = prochainJour(1);
  const res = await agentPatient.get(`/api/creneaux?praticien=${praticien.id}&debut=${debut}`);
  expect(res.status).toBe(200);
  expect(res.body).toHaveLength(8);
  const dates = res.body.map((c) => new Date(c.debut).getTime());
  expect(dates).toEqual([...dates].sort((a, b) => a - b));
  expect(res.body.every((c) => c.statut === 'libre')).toBe(true);
});

test('US-06 : période de plus de 31 jours => aucun résultat ; praticien => 403', async () => {
  const debut = prochainJour(1);
  const fin = new Date(new Date(`${debut}T00:00:00Z`).getTime() + 60 * 86400000).toISOString().slice(0, 10);
  const res = await agentPatient.get(`/api/creneaux?praticien=${praticien.id}&debut=${debut}&fin=${fin}`);
  expect(res.body).toHaveLength(0);
  expect((await agentPraticien.get(`/api/creneaux?praticien=${praticien.id}`)).status).toBe(403);
});
