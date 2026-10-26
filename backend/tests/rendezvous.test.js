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
