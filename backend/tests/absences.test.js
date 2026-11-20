// US-21 : blocage de créneaux pour une absence ou un congé (intégration, base requise)
//   docker compose exec api npx jest tests/absences.test.js
const { db, creerPatient, creerPraticien, connecter, creerRdv, creerCreneau, idClinique, nettoyer } = require('./outils');

let dr; let autreDr; let salma; let agentDr; let libre; let rdv; let jour3; let jour4;

beforeAll(async () => {
  dr = await creerPraticien('Cardiologie', ['Sousse']);
  autreDr = await creerPraticien('Dermatologie', ['Sousse'], 'Leila', 'Gharbi');
  salma = await creerPatient('Salma', 'Ben Ali');
  libre = await creerCreneau(dr, { dansJours: 3, heure: '10:00' });
  rdv = await creerRdv(salma, dr, { dansJours: 3, heure: '11:00' });
  const { rows: [d] } = await db.query(
    "SELECT ((now() AT TIME ZONE 'Africa/Tunis')::date + 3)::text AS j3, ((now() AT TIME ZONE 'Africa/Tunis')::date + 4)::text AS j4",
  );
  jour3 = d.j3; jour4 = d.j4;
  agentDr = await connecter(dr);
});

afterAll(async () => {
  await nettoyer(dr, autreDr, salma);
  await db.pool.end();
});

const statut = async (id) => (await db.query('SELECT statut FROM creneaux WHERE id_creneau = $1', [id])).rows[0].statut;

test('US-21 : la période bloquée n\'est plus réservable ; les rendez-vous déjà pris sont signalés', async () => {
  const res = await agentDr.post('/api/disponibilites/absences').send({ dateDebut: jour3, dateFin: jour4, motif: 'Congrès' });
  expect(res.status).toBe(201);
  expect(res.body.creneauxBloques).toBe(1);
  expect(res.body.rendezVousAPrevenir).toEqual([expect.objectContaining({ id_rdv: rdv.idRdv, prenom: 'Salma' })]);
  expect(await statut(libre)).toBe('bloque');

  const patiente = await connecter(salma);
  const resa = await patiente.post('/api/rendez-vous').send({ idCreneau: libre });
  expect(resa.status).toBe(409);
  const liste = await agentDr.get('/api/disponibilites/absences');
  expect(liste.body).toEqual([expect.objectContaining({ motif: 'Congrès', creneaux_bloques: 1 })]);
});

test('US-21 : une plage publiée ensuite naît bloquée pendant l\'absence', async () => {
  const jourSemaine = new Date(`${jour3}T12:00:00Z`).getUTCDay() || 7;
  const fin = new Date(`${jour3}T12:00:00Z`); fin.setUTCDate(fin.getUTCDate() + 14);
  const res = await agentDr.post('/api/disponibilites').send({
    idClinique: await idClinique('Sousse'), jourSemaine, heureDebut: '14:00', heureFin: '15:00', dureeCreneau: 30, dateFin: fin.toISOString().slice(0, 10),
  });
  expect(res.status).toBe(201);
  const { rows } = await db.query(
    `SELECT to_char(debut AT TIME ZONE 'Africa/Tunis', 'YYYY-MM-DD') AS jour, statut FROM creneaux WHERE id_plage = $1 ORDER BY debut`,
    [res.body.idPlage],
  );
  expect(rows.filter((r) => r.jour === jour3).every((r) => r.statut === 'bloque')).toBe(true);
  expect(rows.filter((r) => r.jour > jour4).every((r) => r.statut === 'libre')).toBe(true);
});

test('US-21 : supprimer l\'absence rend les créneaux réservables ; propriété et dates contrôlées', async () => {
  const [a] = (await agentDr.get('/api/disponibilites/absences')).body;
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  expect((await (await connecter(autreDr)).delete(`/api/disponibilites/absences/${a.id_absence}`)).status).toBe(403);
  warn.mockRestore();
  const res = await agentDr.delete(`/api/disponibilites/absences/${a.id_absence}`);
  expect(res.status).toBe(200);
  expect(await statut(libre)).toBe('libre');
  expect(await statut(rdv.idCreneau)).toBe('reserve');   // le créneau du rendez-vous reste réservé
  expect((await agentDr.post('/api/disponibilites/absences').send({ dateDebut: '2020-01-01', dateFin: '2020-01-02' })).status).toBe(422);
  expect((await agentDr.post('/api/disponibilites/absences').send({ dateDebut: jour4, dateFin: jour3 })).status).toBe(400);
});
