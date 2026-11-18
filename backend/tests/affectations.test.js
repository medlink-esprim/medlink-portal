// US-29 : affectation des praticiens aux cliniques (intégration, base requise)
//   docker compose exec api npx jest tests/affectations.test.js
const { db, creerPatient, creerPraticien, creerAgent, connecter, idClinique, creerRdv, nettoyer } = require('./outils');

let agent; let dr; let salma; let agentAccueil; let agentDr; let sousse; let sfax;
const dans30Jours = () => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10) };
const plage = (idClinique, jourSemaine) => ({ idClinique, jourSemaine, heureDebut: '08:30', heureFin: '10:30', dureeCreneau: 30, dateFin: dans30Jours() });

beforeAll(async () => {
  agent = await creerAgent('Sousse');
  dr = await creerPraticien('Cardiologie', ['Sousse']);
  salma = await creerPatient('Salma', 'Ben Ali');
  agentAccueil = await connecter(agent);
  agentDr = await connecter(dr);
  sousse = await idClinique('Sousse');
  sfax = await idClinique('Sfax');
});

afterAll(async () => {
  await nettoyer(agent, dr, salma);
  await db.pool.end();
});

test('US-29 : affecté à Sfax, le praticien peut y publier ses disponibilités', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  expect((await agentDr.post('/api/disponibilites').send(plage(sfax, 3))).status).toBe(403);   // pas encore affecté

  const res = await agentAccueil.put(`/api/comptes/${dr.id}/cliniques`).send({ cliniques: [sousse, sfax] });
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ ajoutees: ['Sfax'], retirees: [] });
  expect(warn.mock.calls.map((c) => JSON.parse(c[0])).some((l) => l.evenement === 'AFFECTATIONS_MODIFIEES' && l.praticien === dr.id)).toBe(true);
  warn.mockRestore();

  const liste = await agentAccueil.get(`/api/comptes/${dr.id}/cliniques`);
  expect(liste.body.filter((c) => c.affecte).map((c) => c.ville)).toEqual(['Sfax', 'Sousse']);
  expect((await agentDr.get('/api/disponibilites/cliniques')).body.map((c) => c.ville)).toEqual(['Sfax', 'Sousse']);
  const pub = await agentDr.post('/api/disponibilites').send(plage(sfax, 3));
  expect(pub.status).toBe(201);
  expect(pub.body.creneauxGeneres).toBeGreaterThan(0);
});

test('US-29 : retrait refusé tant qu\'il reste des rendez-vous à venir dans la clinique', async () => {
  await creerRdv(salma, dr, { ville: 'Sousse', dansJours: 5 });
  const res = await agentAccueil.put(`/api/comptes/${dr.id}/cliniques`).send({ cliniques: [sfax] });
  expect(res.status).toBe(409);
  expect(res.body.conflits).toEqual([{ ville: 'Sousse', rendez_vous: 1 }]);
});

test('US-29 : retrait de Sfax => créneaux libres supprimés, publication et recherche impossibles', async () => {
  const res = await agentAccueil.put(`/api/comptes/${dr.id}/cliniques`).send({ cliniques: [sousse] });
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ ajoutees: [], retirees: ['Sfax'] });

  const { rows: [n] } = await db.query(
    `SELECT count(*)::int AS n FROM creneaux cr JOIN plages_disponibilite p USING (id_plage)
      WHERE p.id_praticien = $1 AND p.id_clinique = $2 AND cr.debut > now()`,
    [dr.id, sfax],
  );
  expect(n.n).toBe(0);
  const { rows: [pc] } = await db.query('SELECT actif FROM praticien_clinique WHERE id_praticien = $1 AND id_clinique = $2', [dr.id, sfax]);
  expect(pc.actif).toBe(false);   // affectation désactivée, pas supprimée

  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  expect((await agentDr.post('/api/disponibilites').send(plage(sfax, 4))).status).toBe(403);
  warn.mockRestore();
  const recherche = await (await connecter(salma)).get(`/api/praticiens?clinique=${sfax}`);
  expect(recherche.body.map((p) => p.id_praticien)).not.toContain(dr.id);

  // réaffectation possible
  expect((await agentAccueil.put(`/api/comptes/${dr.id}/cliniques`).send({ cliniques: [sousse, sfax] })).body.ajoutees).toEqual(['Sfax']);
});

test('US-29 : validations', async () => {
  expect((await agentAccueil.put(`/api/comptes/${dr.id}/cliniques`).send({ cliniques: [] })).status).toBe(400);
  expect((await agentAccueil.put(`/api/comptes/${salma.id}/cliniques`).send({ cliniques: [sousse] })).status).toBe(404);
  expect((await agentAccueil.put(`/api/comptes/${dr.id}/cliniques`).send({ cliniques: ['00000000-0000-4000-8000-000000000000'] })).status).toBe(422);
});
