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

// ---------- US-07 ----------
async function premierCreneauLibre() {
  const res = await agentPatient.get(`/api/creneaux?praticien=${praticien.id}&debut=${prochainJour(1)}`);
  return res.body.find((c) => c.statut === 'libre');
}

test('US-07 : réservation, motif chiffré en base (TA-2.4), créneau retiré', async () => {
  const c = await premierCreneauLibre();
  const res = await agentPatient.post('/api/rendez-vous').send({ idCreneau: c.id_creneau, motif: 'Essoufflement à l\'effort' });
  expect(res.status).toBe(201);

  const { rows } = await db.query('SELECT motif_chiffre, statut, origine FROM rendez_vous WHERE id_rdv = $1', [res.body.idRdv]);
  expect(rows[0]).toMatchObject({ statut: 'planifie', origine: 'en_ligne' });
  expect(rows[0].motif_chiffre.toString('latin1')).not.toContain('Essoufflement');

  const detail = await agentPatient.get(`/api/rendez-vous/${res.body.idRdv}`);
  expect(detail.body.motif).toBe('Essoufflement à l\'effort');
  const praticienVoit = await agentPraticien.get(`/api/rendez-vous/${res.body.idRdv}`);
  expect(praticienVoit.status).toBe(200);

  const apres = await agentPatient.get(`/api/creneaux?praticien=${praticien.id}&debut=${prochainJour(1)}`);
  expect(apres.body.find((x) => x.id_creneau === c.id_creneau).statut).toBe('reserve');
});

test('TA-2.6 : deux réservations simultanées du même créneau => une seule réussit', async () => {
  const c = await premierCreneauLibre();
  const autre = await connecter(autrePatient);
  const [a, b] = await Promise.all([
    agentPatient.post('/api/rendez-vous').send({ idCreneau: c.id_creneau }),
    autre.post('/api/rendez-vous').send({ idCreneau: c.id_creneau }),
  ]);
  expect([a.status, b.status].sort()).toEqual([201, 409]);
  const { rows } = await db.query('SELECT count(*)::int AS n FROM rendez_vous WHERE id_creneau = $1', [c.id_creneau]);
  expect(rows[0].n).toBe(1);
});

test('TA-2.3 : le rendez-vous d\'un autre patient => 403 journalisé', async () => {
  const { rows } = await db.query('SELECT id_rdv FROM rendez_vous WHERE id_patient = $1 LIMIT 1', [patient.id]);
  const autre = await connecter(autrePatient);
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const res = await autre.get(`/api/rendez-vous/${rows[0].id_rdv}`);
  expect(res.status).toBe(403);
  expect(JSON.parse(warn.mock.calls.at(-1)[0]).evenement).toBe('ACCES_REFUSE');
  warn.mockRestore();
});

// ---------- Sprint 3 ----------
test('US-08 : confirmation enregistrée et envoyée par e-mail après la réservation', async () => {
  const { rows } = await db.query(
    `SELECT n.canal, n.statut FROM notifications n JOIN rendez_vous r USING (id_rdv)
      WHERE r.id_patient = $1 AND n.type = 'confirmation'`,
    [patient.id],
  );
  expect(rows.length).toBeGreaterThanOrEqual(1);
  expect(rows.every((r) => r.canal === 'email' && r.statut === 'envoyee')).toBe(true);
});

// Réserve un créneau libre d'au moins 7 jours plus tard (bien au-delà du délai de 24 h)
// Créneaux libres du praticien, en écartant les jours où le patient a déjà un rendez-vous planifié avec lui
// (règle : un rendez-vous par jour chez le même praticien)
async function libresSansConflit(debut) {
  const libres = (await agentPatient.get(`/api/creneaux?praticien=${praticien.id}&debut=${debut}`)).body.filter((c) => c.statut === 'libre');
  const { rows } = await db.query(
    `SELECT DISTINCT to_char(cr.debut AT TIME ZONE 'Africa/Tunis', 'YYYY-MM-DD') AS j
       FROM rendez_vous r JOIN creneaux cr USING (id_creneau) JOIN plages_disponibilite p USING (id_plage)
      WHERE r.id_patient = $1 AND p.id_praticien = $2 AND r.statut = 'planifie'`,
    [patient.id, praticien.id],
  );
  const jours = new Set(rows.map((r) => r.j));
  return libres.filter((c) => !jours.has(new Date(c.debut).toLocaleDateString('sv-SE', { timeZone: 'Africa/Tunis' })));
}

async function reserver(agent, decalage = 0) {
  const debut = new Date(new Date(`${prochainJour(1)}T00:00:00Z`).getTime() + 7 * 86400000).toISOString().slice(0, 10);
  const libres = await libresSansConflit(debut);
  const c = libres[decalage];
  const res = await agent.post('/api/rendez-vous').send({ idCreneau: c.id_creneau, motif: 'Contrôle' });
  expect(res.status).toBe(201);
  return { idRdv: res.body.idRdv, creneau: c };
}

test('US-09 / TA-3.4 : annulation => créneau libéré, patient et praticien prévenus', async () => {
  const { idRdv, creneau } = await reserver(agentPatient);
  const res = await agentPatient.patch(`/api/rendez-vous/${idRdv}/annulation`);
  expect(res.status).toBe(200);

  const { rows: [r] } = await db.query('SELECT statut, date_annulation FROM rendez_vous WHERE id_rdv = $1', [idRdv]);
  expect(r.statut).toBe('annule');
  expect(r.date_annulation).not.toBeNull();
  const { rows: [c] } = await db.query('SELECT statut FROM creneaux WHERE id_creneau = $1', [creneau.id_creneau]);
  expect(c.statut).toBe('libre');
  const { rows: n } = await db.query('SELECT type, id_destinataire FROM notifications WHERE id_rdv = $1 ORDER BY type', [idRdv]);
  expect(n).toEqual(expect.arrayContaining([
    { type: 'annulation', id_destinataire: patient.id },
    { type: 'alerte', id_destinataire: praticien.id },
  ]));
  // une seconde annulation est refusée
  expect((await agentPatient.patch(`/api/rendez-vous/${idRdv}/annulation`)).status).toBe(409);
});

test('US-09 : rendez-vous d\'un autre patient => 403 ; moins de 24 h => 422', async () => {
  const { idRdv, creneau } = await reserver(agentPatient);
  const autre = await connecter(autrePatient);
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  expect((await autre.patch(`/api/rendez-vous/${idRdv}/annulation`)).status).toBe(403);
  warn.mockRestore();

  await db.query("UPDATE creneaux SET debut = now() + interval '2 hours', fin = now() + interval '150 minutes' WHERE id_creneau = $1", [creneau.id_creneau]);
  const tard = await agentPatient.patch(`/api/rendez-vous/${idRdv}/annulation`);
  expect(tard.status).toBe(422);
  expect(tard.body.message).toMatch(/24 heures/);
});

test('US-11 : « Mes rendez-vous » liste uniquement les rendez-vous du patient, avec leur statut', async () => {
  const res = await agentPatient.get('/api/patients/moi/rendez-vous');
  expect(res.status).toBe(200);
  const { rows } = await db.query('SELECT id_rdv FROM rendez_vous WHERE id_patient = $1', [patient.id]);
  expect(res.body.map((r) => r.id_rdv).sort()).toEqual(rows.map((r) => r.id_rdv).sort());
  expect(res.body.some((r) => r.statut === 'annule')).toBe(true);
  expect(res.body[0]).toEqual(expect.objectContaining({ praticien_nom: 'Trabelsi', specialite: 'Cardiologie', modifiable: expect.any(Boolean) }));

  const autre = await connecter(autrePatient);
  const sesRdv = (await autre.get('/api/patients/moi/rendez-vous')).body;
  expect(sesRdv.every((r) => !rows.some((x) => x.id_rdv === r.id_rdv))).toBe(true);
});

test('US-10 / TA-3.4 : report => ancien créneau libéré, nouveau rendez-vous lié, praticien prévenu', async () => {
  const { idRdv, creneau } = await reserver(agentPatient);
  const debut = new Date(new Date(`${prochainJour(1)}T00:00:00Z`).getTime() + 7 * 86400000).toISOString().slice(0, 10);
  const libres = await libresSansConflit(debut);
  const cible = libres[0];

  expect((await agentPatient.patch(`/api/rendez-vous/${idRdv}/report`).send({ idCreneau: creneau.id_creneau })).status).toBe(422);
  const res = await agentPatient.patch(`/api/rendez-vous/${idRdv}/report`).send({ idCreneau: cible.id_creneau });
  expect(res.status).toBe(200);
  const nouveau = res.body.idRdv;

  const { rows } = await db.query(
    `SELECT r.id_rdv, r.statut, r.id_rdv_origine, c.statut AS creneau
       FROM rendez_vous r JOIN creneaux c USING (id_creneau) WHERE r.id_rdv = ANY($1::uuid[])`,
    [[idRdv, nouveau]],
  );
  const ancien = rows.find((r) => r.id_rdv === idRdv);
  const neuf = rows.find((r) => r.id_rdv === nouveau);
  expect(ancien).toMatchObject({ statut: 'reporte', creneau: 'libre' });
  expect(neuf).toMatchObject({ statut: 'planifie', creneau: 'reserve', id_rdv_origine: idRdv });

  // le motif chiffré suit le rendez-vous ; patient et praticien sont prévenus
  expect((await agentPatient.get(`/api/rendez-vous/${nouveau}`)).body.motif).toBe('Contrôle');
  const { rows: n } = await db.query('SELECT type FROM notifications WHERE id_rdv = $1 ORDER BY type::text', [nouveau]);
  expect(n.map((x) => x.type)).toEqual(['modification', 'alerte'].sort());

  // l'ancien rendez-vous ne peut plus être reporté, et un créneau déjà pris est refusé
  expect((await agentPatient.patch(`/api/rendez-vous/${idRdv}/report`).send({ idCreneau: libres[1].id_creneau })).status).toBe(409);
  const { idRdv: autreRdv } = await reserver(agentPatient);
  expect((await agentPatient.patch(`/api/rendez-vous/${autreRdv}/report`).send({ idCreneau: cible.id_creneau })).status).toBe(409);
});
