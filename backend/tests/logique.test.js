// Règles métier de bout en bout : planning des praticiens, réservations des patients, cohérence
// des créneaux après annulation, report, absence et réactivation. Chaque test est un scénario.
//   docker compose exec api npx jest tests/logique.test.js
const { db, creerPatient, creerPraticien, creerAgent, creerAdmin, connecter, idClinique, prochainJour, creerRdv, creerCreneau, nettoyer } = require('./outils');

const comptes = [];
const suivre = (c) => { comptes.push(c); return c; };
const statutCreneau = async (id) => (await db.query('SELECT statut FROM creneaux WHERE id_creneau = $1', [id])).rows[0].statut;
const plusJours = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

beforeAll(() => { jest.spyOn(console, 'warn').mockImplementation(() => {}); });
afterAll(async () => {
  console.warn.mockRestore();
  await nettoyer(...comptes);
  await db.pool.end();
});

// ===================== A. Planning du praticien =====================
describe('A. planning du praticien', () => {
  let dr; let s; let sousse; let tunis; const lundi = prochainJour(1);
  const plage = (o) => s.post('/api/disponibilites').send({
    idClinique: sousse, jourSemaine: 1, heureDebut: '08:00', heureFin: '12:00', dureeCreneau: 30, dateDebut: lundi, dateFin: plusJours(lundi, 21), ...o,
  });

  beforeAll(async () => {
    dr = suivre(await creerPraticien('Cardiologie', ['Sousse', 'Tunis'], 'Sami', 'Planning'));
    s = await connecter(dr);
    sousse = await idClinique('Sousse'); tunis = await idClinique('Tunis');
  });

  test('A1 : une plage le lundi matin à Sousse est acceptée', async () => {
    expect((await plage({})).status).toBe(201);
  });
  test('A2 : le même lundi, le soir à Tunis : refusé (une seule clinique par jour)', async () => {
    const r = await plage({ idClinique: tunis, heureDebut: '18:00', heureFin: '21:00' });
    expect(r.status).toBe(409);
    expect(r.body.message).toMatch(/clinique/i);
  });
  test('A3 : le même lundi après-midi, toujours à Sousse : accepté', async () => {
    expect((await plage({ heureDebut: '14:00', heureFin: '17:00' })).status).toBe(201);
  });
  test('A4 : une plage qui chevauche une plage existante : refusée', async () => {
    expect((await plage({ heureDebut: '11:00', heureFin: '13:00' })).status).toBe(409);
  });
  test('A5 : Tunis un autre jour (mardi) : accepté', async () => {
    const mardi = prochainJour(2);
    expect((await plage({ idClinique: tunis, jourSemaine: 2, dateDebut: mardi, dateFin: plusJours(mardi, 14) })).status).toBe(201);
  });
  test('A6 : Tunis le lundi, mais sur des semaines où il n\'est pas à Sousse : accepté', async () => {
    const r = await plage({ idClinique: tunis, dateDebut: plusJours(lundi, 28), dateFin: plusJours(lundi, 42) });
    expect(r.status).toBe(201);
  });
  test('A7 : période sans aucun lundi : refusée (aucun créneau ne serait créé)', async () => {
    const mardi = prochainJour(2);
    const r = await plage({ jourSemaine: 1, dateDebut: mardi, dateFin: plusJours(mardi, 2), heureDebut: '18:00', heureFin: '19:00' });
    expect(r.status).toBe(422);
  });
  test('A8 : fin avant le début, ou plage plus courte qu\'un créneau : refusées', async () => {
    expect((await plage({ jourSemaine: 3, heureDebut: '12:00', heureFin: '10:00' })).status).toBe(422);
    expect((await plage({ jourSemaine: 3, heureDebut: '10:00', heureFin: '10:20', dureeCreneau: 30 })).status).toBe(422);
  });
  test('A9 : un autre praticien, même clinique, même heure : accepté (plannings indépendants)', async () => {
    const autre = suivre(await creerPraticien('Cardiologie', ['Sousse'], 'Rim', 'Voisine'));
    const r = await (await connecter(autre)).post('/api/disponibilites').send({
      idClinique: sousse, jourSemaine: 1, heureDebut: '08:00', heureFin: '12:00', dureeCreneau: 30, dateDebut: lundi, dateFin: plusJours(lundi, 7),
    });
    expect(r.status).toBe(201);
  });
});

// ===================== B. Réservations du patient =====================
describe('B. réservations du patient', () => {
  let drA; let drB; let salma; let nour; let sSalma; let sNour;
  beforeAll(async () => {
    drA = suivre(await creerPraticien('Cardiologie', ['Sousse'], 'Karim', 'Alpha'));
    drB = suivre(await creerPraticien('Dermatologie', ['Sfax'], 'Leila', 'Beta'));
    salma = suivre(await creerPatient('Salma', 'Logique'));
    nour = suivre(await creerPatient('Nour', 'Logique'));
    sSalma = await connecter(salma); sNour = await connecter(nour);
  });
  const reserver = (s, idCreneau) => s.post('/api/rendez-vous').send({ idCreneau, motif: 'test' });

  test('B1 : deux rendez-vous à la même heure chez deux praticiens : le second est refusé', async () => {
    const a = await creerCreneau(drA, { dansJours: 10, heure: '10:00' });
    const b = await creerCreneau(drB, { ville: 'Sfax', dansJours: 10, heure: '10:00' });
    expect((await reserver(sSalma, a)).status).toBe(201);
    const r = await reserver(sSalma, b);
    expect(r.status).toBe(409);
    expect(await statutCreneau(b)).toBe('libre');
  });
  test('B2 : un créneau qui chevauche en partie (10:15) : refusé', async () => {
    const b = await creerCreneau(drB, { ville: 'Sfax', dansJours: 10, heure: '10:15' });
    expect((await reserver(sSalma, b)).status).toBe(409);
  });
  test('B3 : plus tard le même jour, sans chevauchement (autre praticien) : accepté', async () => {
    const b = await creerCreneau(drB, { ville: 'Sfax', dansJours: 10, heure: '13:30' });
    expect((await reserver(sSalma, b)).status).toBe(201);
  });
  test('B4 : un second rendez-vous le même jour chez le même praticien : refusé', async () => {
    const a2 = await creerCreneau(drA, { dansJours: 10, heure: '16:00' });
    expect((await reserver(sSalma, a2)).status).toBe(409);
  });
  test('B5 : après annulation, la même heure redevient possible ailleurs', async () => {
    const a = await creerCreneau(drA, { dansJours: 12, heure: '09:00' });
    const b = await creerCreneau(drB, { ville: 'Sfax', dansJours: 12, heure: '09:00' });
    const r = await reserver(sSalma, a);
    expect((await sSalma.patch(`/api/rendez-vous/${r.body.idRdv}/annulation`)).status).toBe(200);
    expect((await reserver(sSalma, b)).status).toBe(201);
  });
  test('B6 : deux patients, le même créneau, au même moment : un seul réussit', async () => {
    const c = await creerCreneau(drA, { dansJours: 14, heure: '11:00' });
    const res = await Promise.all([reserver(sSalma, c), reserver(sNour, c)]);
    expect(res.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await db.query("SELECT count(*)::int AS n FROM rendez_vous WHERE id_creneau = $1 AND statut = 'planifie'", [c])).rows[0].n).toBe(1);
  });
  test('B7 : le même patient, deux créneaux qui se chevauchent, au même moment : un seul réussit', async () => {
    const a = await creerCreneau(drA, { dansJours: 16, heure: '15:00' });
    const b = await creerCreneau(drB, { ville: 'Sfax', dansJours: 16, heure: '15:00' });
    const res = await Promise.all([reserver(sNour, a), reserver(sNour, b)]);
    expect(res.map((r) => r.status).sort()).toEqual([201, 409]);
  });
  test('B8 : créneau passé, bloqué ou inexistant : refusé', async () => {
    const bloque = await creerCreneau(drA, { dansJours: 18, heure: '08:00' });
    await db.query("UPDATE creneaux SET statut = 'bloque' WHERE id_creneau = $1", [bloque]);
    expect((await reserver(sNour, bloque)).status).toBe(409);
    const { rows: [p] } = await db.query(
      `INSERT INTO creneaux (id_plage, debut, fin) SELECT id_plage, now() - interval '2 hours', now() - interval '90 minutes'
         FROM creneaux WHERE id_creneau = $1 RETURNING id_creneau`, [bloque],
    );
    expect((await reserver(sNour, p.id_creneau)).status).toBe(409);
    expect((await reserver(sNour, '00000000-0000-4000-8000-000000000000')).status).toBe(404);
  });
  test('B9 : report vers une heure où le patient a déjà un rendez-vous : refusé', async () => {
    const a = await creerCreneau(drA, { dansJours: 20, heure: '09:00' });
    const autreJour = await creerCreneau(drA, { dansJours: 21, heure: '09:00' });
    const b = await creerCreneau(drB, { ville: 'Sfax', dansJours: 21, heure: '09:00' });
    const r = await reserver(sNour, a);
    expect((await reserver(sNour, b)).status).toBe(201);
    expect((await sNour.patch(`/api/rendez-vous/${r.body.idRdv}/report`).send({ idCreneau: autreJour })).status).toBe(409);
    expect(await statutCreneau(a)).toBe('reserve');             // l'ancien rendez-vous est conservé
  });
  test('B10 : report le même jour chez le même praticien (autre heure) : accepté', async () => {
    const a = await creerCreneau(drA, { dansJours: 23, heure: '09:00' });
    const a2 = await creerCreneau(drA, { dansJours: 23, heure: '11:00' });
    const r = await reserver(sNour, a);
    expect((await sNour.patch(`/api/rendez-vous/${r.body.idRdv}/report`).send({ idCreneau: a2 })).status).toBe(200);
    expect(await statutCreneau(a)).toBe('libre');
  });
  test('B11 : l\'accueil ne peut pas donner un rendez-vous qui chevauche un rendez-vous du patient', async () => {
    const agent = suivre(await creerAgent('Sousse', 'Rania', 'Logique'));
    const b = await creerCreneau(drB, { ville: 'Sfax', dansJours: 25, heure: '10:00' });
    const a = await creerCreneau(drA, { dansJours: 25, heure: '10:00' });
    expect((await reserver(sNour, b)).status).toBe(201);
    const r = await (await connecter(agent)).post('/api/accueil/rendez-vous').send({ idPatient: nour.id, idCreneau: a });
    expect(r.status).toBe(409);
  });
});

// ===================== C. Cohérence des créneaux =====================
describe('C. cohérence des créneaux (absences, annulations, réactivation)', () => {
  let dr; let sDr; let amine; let sAmine;
  beforeAll(async () => {
    dr = suivre(await creerPraticien('Pédiatrie', ['Sousse'], 'Hela', 'Gamma'));
    amine = suivre(await creerPatient('Amine', 'Logique'));
    sDr = await connecter(dr); sAmine = await connecter(amine);
  });
  const jour = (n) => db.query("SELECT to_char((now() AT TIME ZONE 'Africa/Tunis')::date + $1::int, 'YYYY-MM-DD') AS j", [n]).then((r) => r.rows[0].j);

  test('C1 : annuler un rendez-vous tombant pendant une absence ne rouvre pas le créneau', async () => {
    const c = await creerCreneau(dr, { dansJours: 30, heure: '10:00' });
    const r = await sAmine.post('/api/rendez-vous').send({ idCreneau: c });
    expect(r.status).toBe(201);
    const j = await jour(30);
    const abs = await sDr.post('/api/disponibilites/absences').send({ dateDebut: j, dateFin: j, motif: 'Congrès' });
    expect(abs.status).toBe(201);
    expect(abs.body.rendezVousAPrevenir).toHaveLength(1);
    expect((await sAmine.patch(`/api/rendez-vous/${r.body.idRdv}/annulation`)).status).toBe(200);
    expect(await statutCreneau(c)).toBe('bloque');
  });
  test('C2 : reporter un rendez-vous hors d\'une absence ne rouvre pas l\'ancien créneau', async () => {
    const c = await creerCreneau(dr, { dansJours: 32, heure: '10:00' });
    const ailleurs = await creerCreneau(dr, { dansJours: 33, heure: '10:00' });
    const r = await sAmine.post('/api/rendez-vous').send({ idCreneau: c });
    const j = await jour(32);
    await sDr.post('/api/disponibilites/absences').send({ dateDebut: j, dateFin: j });
    expect((await sAmine.patch(`/api/rendez-vous/${r.body.idRdv}/report`).send({ idCreneau: ailleurs })).status).toBe(200);
    expect(await statutCreneau(c)).toBe('bloque');
  });
  test('C3 : supprimer l\'absence rend réservables les créneaux sans rendez-vous', async () => {
    const c = await creerCreneau(dr, { dansJours: 40, heure: '10:00' });
    const j = await jour(40);
    const abs = await sDr.post('/api/disponibilites/absences').send({ dateDebut: j, dateFin: j });
    expect(await statutCreneau(c)).toBe('bloque');
    expect((await sDr.delete(`/api/disponibilites/absences/${abs.body.idAbsence}`)).status).toBe(200);
    expect(await statutCreneau(c)).toBe('libre');
  });
  test('C4 : réactiver un praticien ne rouvre pas les créneaux de ses absences', async () => {
    const dr2 = suivre(await creerPraticien('Pédiatrie', ['Sousse'], 'Omar', 'Delta'));
    const admin = suivre(await creerAdmin('Sami', 'Logique'));
    const dansAbsence = await creerCreneau(dr2, { dansJours: 45, heure: '10:00' });
    const horsAbsence = await creerCreneau(dr2, { dansJours: 46, heure: '10:00' });
    const j = await jour(45);
    expect((await (await connecter(dr2)).post('/api/disponibilites/absences').send({ dateDebut: j, dateFin: j })).status).toBe(201);
    const sAdmin = await connecter(admin);
    expect((await sAdmin.patch(`/api/comptes/${dr2.id}/statut`).send({ statut: 'desactive' })).status).toBe(200);
    expect(await statutCreneau(horsAbsence)).toBe('bloque');
    expect((await sAmine.post('/api/rendez-vous').send({ idCreneau: horsAbsence })).status).toBe(409);
    expect((await sAdmin.patch(`/api/comptes/${dr2.id}/statut`).send({ statut: 'actif' })).status).toBe(200);
    expect(await statutCreneau(horsAbsence)).toBe('libre');
    expect(await statutCreneau(dansAbsence)).toBe('bloque');
  });
  test('C5 : désactiver un patient ou un praticien avec des rendez-vous à venir : refusé', async () => {
    const admin = suivre(await creerAdmin('Lina', 'Logique'));
    const sAdmin = await connecter(admin);
    await creerRdv(amine, dr, { dansJours: 50, heure: '09:00' });
    expect((await sAdmin.patch(`/api/comptes/${amine.id}/statut`).send({ statut: 'desactive' })).status).toBe(409);
    expect((await sAdmin.patch(`/api/comptes/${dr.id}/statut`).send({ statut: 'desactive' })).status).toBe(409);
  });
  test('C6 : compte-rendu impossible avant la consultation ou sur un rendez-vous annulé', async () => {
    const futur = await creerRdv(amine, dr, { dansJours: 52, heure: '09:00' });
    expect((await sDr.post(`/api/praticien/rendez-vous/${futur.idRdv}/compte-rendu`).send({ contenu: 'RAS', visiblePatient: false })).status).toBe(422);
    const annule = await creerRdv(amine, dr, { dansJours: -3, heure: '09:00', statut: 'annule' });
    expect((await sDr.post(`/api/praticien/rendez-vous/${annule.idRdv}/compte-rendu`).send({ contenu: 'RAS', visiblePatient: false })).status).toBe(409);
  });
  test('C7 : annuler deux fois, ou le rendez-vous d\'un autre : refusé', async () => {
    const c = await creerCreneau(dr, { dansJours: 54, heure: '10:00' });
    const r = await sAmine.post('/api/rendez-vous').send({ idCreneau: c });
    const autre = suivre(await creerPatient('Youssef', 'Logique'));
    expect((await (await connecter(autre)).patch(`/api/rendez-vous/${r.body.idRdv}/annulation`)).status).toBe(403);
    expect((await sAmine.patch(`/api/rendez-vous/${r.body.idRdv}/annulation`)).status).toBe(200);
    expect((await sAmine.patch(`/api/rendez-vous/${r.body.idRdv}/annulation`)).status).toBe(409);
  });
});
