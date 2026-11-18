// US-19 / US-20 : agenda multi-sites du praticien et alertes d'annulation (intégration, base requise)
//   docker compose exec api npx jest tests/agenda.test.js
const { db, creerPatient, creerPraticien, connecter, creerRdv, nettoyer } = require('./outils');

let dr; let autreDr; let salma; let amine; let agentDr; let jour; let rdvSousse; let rdvSfax;

beforeAll(async () => {
  dr = await creerPraticien('Cardiologie', ['Sousse', 'Sfax']);
  autreDr = await creerPraticien('Dermatologie', ['Sousse'], 'Leila', 'Gharbi');
  salma = await creerPatient('Salma', 'Ben Ali');
  amine = await creerPatient('Amine', 'Jaziri');
  rdvSousse = await creerRdv(salma, dr, { ville: 'Sousse', dansJours: 3, heure: '09:00' });
  rdvSfax = await creerRdv(amine, dr, { ville: 'Sfax', dansJours: 3, heure: '15:00', origine: 'accueil' });
  await creerRdv(salma, autreDr, { ville: 'Sousse', dansJours: 3, heure: '11:00' });
  jour = (await db.query("SELECT ((now() AT TIME ZONE 'Africa/Tunis')::date + 3)::text AS j")).rows[0].j;
  agentDr = await connecter(dr);
});

afterAll(async () => {
  await nettoyer(dr, autreDr, salma, amine);
  await db.pool.end();
});

test('US-19 : les rendez-vous de Sousse et de Sfax apparaissent dans une seule vue', async () => {
  const res = await agentDr.get(`/api/praticien/agenda?debut=${jour}`);
  expect(res.status).toBe(200);
  expect(new Date(`${res.body.semaine}T12:00:00Z`).getUTCDay()).toBe(1);   // la semaine commence un lundi
  expect(res.body.cliniques.map((c) => c.ville)).toEqual(['Sfax', 'Sousse']);
  const rdv = res.body.creneaux.filter((c) => c.id_rdv);
  expect(rdv.map((c) => [c.ville, c.id_patient, c.origine])).toEqual([
    ['Sousse', salma.id, 'en_ligne'],
    ['Sfax', amine.id, 'accueil'],
  ]);
  // jamais les créneaux d'un autre praticien
  expect(res.body.creneaux.every((c) => [rdvSousse.idCreneau, rdvSfax.idCreneau].includes(c.id_creneau))).toBe(true);
});

test('US-19 : filtre par clinique et paramètres invalides', async () => {
  const { rows: [sfax] } = await db.query("SELECT id_clinique FROM cliniques WHERE ville = 'Sfax'");
  const res = await agentDr.get(`/api/praticien/agenda?debut=${jour}&clinique=${sfax.id_clinique}`);
  expect(res.body.creneaux.map((c) => c.ville)).toEqual(['Sfax']);
  expect((await agentDr.get('/api/praticien/agenda?debut=2026-02-30')).status).toBe(400);
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  expect((await (await connecter(salma)).get('/api/praticien/agenda')).status).toBe(403);
  warn.mockRestore();
});

test('US-20 : le patient annule => alerte au praticien et créneau libéré dans l\'agenda', async () => {
  const patiente = await connecter(salma);
  expect((await patiente.patch(`/api/rendez-vous/${rdvSousse.idRdv}/annulation`)).status).toBe(200);

  const alertes = await agentDr.get('/api/praticien/alertes');
  expect(alertes.status).toBe(200);
  expect(alertes.body.nonLues).toBe(1);
  expect(alertes.body.alertes[0]).toMatchObject({ nature: 'annulation', id_rdv: rdvSousse.idRdv, prenom: 'Salma', nom: 'Ben Ali', ville: 'Sousse', lue_le: null });

  const agenda = await agentDr.get(`/api/praticien/agenda?debut=${jour}`);
  const creneau = agenda.body.creneaux.find((c) => c.id_creneau === rdvSousse.idCreneau);
  expect(creneau).toMatchObject({ statut: 'libre', id_rdv: null });

  // l'autre praticien ne reçoit rien
  expect((await (await connecter(autreDr)).get('/api/praticien/alertes')).body.alertes).toEqual([]);

  expect((await agentDr.post('/api/praticien/alertes/lues')).body.lues).toBe(1);
  expect((await agentDr.get('/api/praticien/alertes')).body.nonLues).toBe(0);
});
