// Présence aux rendez-vous : bouton « Présent / Absent » du praticien et marquage automatique
// des rendez-vous passés restés « planifiés » (48 h après la fin) ; plus aucun rendez-vous passé « planifié ».
//   docker compose exec api npx jest tests/presences.test.js
const { db, creerPatient, creerPraticien, connecter, creerRdv, nettoyer } = require('./outils');
const { marquerAbsences } = require('../src/services/presences');

let dr; let autreDr; let salma; let sDr;
const statut = async (id) => (await db.query('SELECT statut FROM rendez_vous WHERE id_rdv = $1', [id])).rows[0].statut;
const presence = (s, id, present) => s.patch(`/api/praticien/rendez-vous/${id}/presence`).send({ present });

beforeAll(async () => {
  dr = await creerPraticien('Cardiologie', ['Sousse'], 'Karim', 'Presence');
  autreDr = await creerPraticien('Cardiologie', ['Sousse'], 'Rim', 'Autre');
  salma = await creerPatient('Salma', 'Presence');
  sDr = await connecter(dr);
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterAll(async () => {
  console.warn.mockRestore(); console.log.mockRestore();
  await nettoyer(dr, autreDr, salma);
  await db.pool.end();
});

test('le praticien marque le patient absent puis corrige en présent ; le journal le trace', async () => {
  const { idRdv } = await creerRdv(salma, dr, { dansJours: -1, heure: '09:00' });
  const r = await presence(sDr, idRdv, false);
  expect(r.status).toBe(200);
  expect(await statut(idRdv)).toBe('manque');
  expect(console.warn.mock.calls.some(([l]) => String(l).includes('PRESENCE_MARQUEE'))).toBe(true);
  expect((await presence(sDr, idRdv, true)).status).toBe(200);
  expect(await statut(idRdv)).toBe('honore');
});

test('refus : rendez-vous à venir, annulé, d\'un autre praticien, trop ancien', async () => {
  const futur = await creerRdv(salma, dr, { dansJours: 5, heure: '09:00' });
  expect((await presence(sDr, futur.idRdv, true)).status).toBe(422);
  const annule = await creerRdv(salma, dr, { dansJours: -2, heure: '10:00', statut: 'annule' });
  expect((await presence(sDr, annule.idRdv, false)).status).toBe(409);
  const chezAutre = await creerRdv(salma, autreDr, { dansJours: -2, heure: '11:00' });
  expect((await presence(sDr, chezAutre.idRdv, false)).status).toBe(403);
  const ancien = await creerRdv(salma, dr, { dansJours: -40, heure: '09:00' });
  expect((await presence(sDr, ancien.idRdv, false)).status).toBe(422);
  expect((await presence(sDr, futur.idRdv, 'peut-être')).status).toBe(400);
});

test('« absent » refusé quand un compte-rendu existe ; un compte-rendu rend « honoré » un rendez-vous manqué', async () => {
  const { idRdv } = await creerRdv(salma, dr, { dansJours: -3, heure: '09:00', statut: 'manque' });
  const cr = await sDr.post(`/api/praticien/rendez-vous/${idRdv}/compte-rendu`).send({ contenu: 'Examen clinique sans particularité.', visiblePatient: false });
  expect(cr.status).toBe(201);
  expect(await statut(idRdv)).toBe('honore');
  expect((await presence(sDr, idRdv, false)).status).toBe(409);
});

test('marquage automatique : planifié depuis plus de 48 h => manqué ; récent ou avec compte-rendu => inchangé', async () => {
  const vieux = await creerRdv(salma, dr, { dansJours: -4, heure: '09:00' });
  const recent = await creerRdv(salma, dr, { dansJours: 0, heure: '00:00' });
  const futur = await creerRdv(salma, dr, { dansJours: 6, heure: '09:00' });
  const n = await marquerAbsences();
  expect(n).toBeGreaterThanOrEqual(1);
  expect(await statut(vieux.idRdv)).toBe('manque');
  expect(await statut(recent.idRdv)).toBe('planifie');
  expect(await statut(futur.idRdv)).toBe('planifie');
  expect(await marquerAbsences()).toBe(0);                  // rien à refaire au second passage
});

test('le dossier propose « Présent / Absent » sur les rendez-vous passés de moins de 30 jours', async () => {
  const res = await sDr.get(`/api/praticien/patients/${salma.id}/dossier`);
  expect(res.status).toBe(200);
  const passes = res.body.rendezVous.filter((r) => new Date(r.debut) < new Date() && ['planifie', 'honore', 'manque'].includes(r.statut));
  expect(passes.some((r) => r.presence_modifiable)).toBe(true);
  expect(res.body.rendezVous.filter((r) => new Date(r.debut) > new Date()).every((r) => !r.presence_modifiable)).toBe(true);
});
