// US-48 / US-12 : rappels automatiques (intégration, base requise)
//   docker compose exec api npx jest tests/rappels.test.js
const { db, creerPatient, creerPraticien, nettoyer } = require('./outils');
const { envoyerRappels } = require('../src/services/rappels');

let praticien; let patient; let sansRappel;

// Rendez-vous planifié qui commence dans `heures` heures
async function rdvDans(p, heures) {
  const { rows: [pl] } = await db.query(
    `INSERT INTO plages_disponibilite (id_praticien, id_clinique, jour_semaine, heure_debut, heure_fin, duree_creneau, date_debut, date_fin)
     SELECT $1, id_clinique, 1, '07:00', '07:30', 30, current_date, current_date + 1
       FROM praticien_clinique WHERE id_praticien = $1 LIMIT 1
     RETURNING id_plage`,
    [praticien.id],
  );
  const { rows: [c] } = await db.query(
    `INSERT INTO creneaux (id_plage, debut, fin, statut)
     VALUES ($1, now() + make_interval(hours => $2), now() + make_interval(hours => $2) + interval '30 minutes', 'reserve')
     RETURNING id_creneau`,
    [pl.id_plage, heures],
  );
  const { rows: [r] } = await db.query(
    'INSERT INTO rendez_vous (id_patient, id_creneau) VALUES ($1, $2) RETURNING id_rdv',
    [p.id, c.id_creneau],
  );
  return r.id_rdv;
}

const rappels = async (idRdv) => (await db.query(
  "SELECT canal, statut FROM notifications WHERE id_rdv = $1 AND type = 'rappel'", [idRdv],
)).rows;

beforeAll(async () => {
  praticien = await creerPraticien();
  patient = await creerPatient();
  sansRappel = await creerPatient('Youssef', 'Mansour');
  await db.query('INSERT INTO preferences_notification (id_patient, rappel_actif) VALUES ($1, false)', [sansRappel.id]);
});

afterAll(async () => {
  await nettoyer(praticien, patient, sansRappel);
  await db.pool.end();
});

test('TA-3.5 : exécutions répétées => un seul rappel par rendez-vous', async () => {
  const demain = await rdvDans(patient, 20);
  const plusTard = await rdvDans(patient, 50);   // hors fenêtre de 24 h
  await envoyerRappels();
  await envoyerRappels();
  await Promise.all([envoyerRappels(), envoyerRappels()]);   // même en parallèle
  expect(await rappels(demain)).toEqual([{ canal: 'email', statut: 'envoyee' }]);
  expect(await rappels(plusTard)).toEqual([]);
});

test('US-12 : pas de rappel si le patient l\'a désactivé', async () => {
  const idRdv = await rdvDans(sansRappel, 10);
  await envoyerRappels();
  expect(await rappels(idRdv)).toEqual([]);
});
