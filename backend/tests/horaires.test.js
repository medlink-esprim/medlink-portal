// US-49 : disponibilité du portail de 6 h à 22 h (heure de Tunis)
//   docker compose exec api npx jest tests/horaires.test.js
const { app, db } = require('./outils');
const request = require('supertest');
const config = require('../src/config');
const { etatService, lirePlage } = require('../src/security/horaires');

const tunis = (hhmm) => new Date(`2026-12-01T${hhmm}:00+01:00`);   // Tunis = UTC+1, sans heure d'été

afterEach(() => { config.horairesService = ''; });
afterAll(() => db.pool.end());

test('plage 06:00-22:00 : ouvert de 6 h à 21 h 59, fermé sinon', () => {
  expect(etatService(tunis('05:59'), '06:00-22:00').ouvert).toBe(false);
  expect(etatService(tunis('06:00'), '06:00-22:00')).toEqual({ ouvert: true, plage: '06:00-22:00', ouverture: '06:00', fermeture: '22:00' });
  expect(etatService(tunis('21:59'), '06:00-22:00').ouvert).toBe(true);
  expect(etatService(tunis('22:00'), '06:00-22:00').ouvert).toBe(false);
  expect(etatService(tunis('03:00'), '22:00-06:00').ouvert).toBe(true);     // plage passant minuit
  expect(etatService(tunis('03:00'), '').ouvert).toBe(true);               // non configuré : toujours ouvert
  expect(lirePlage('6h-22h')).toBeNull();
});

function plageQuiExclutMaintenant() {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Tunis', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
  const d = (h + 2) % 24; const f = (h + 3) % 24;
  return `${String(d).padStart(2, '0')}:00-${String(f).padStart(2, '0')}:00`;
}

test('hors plage : 503 avec message, santé et horaires toujours disponibles', async () => {
  config.horairesService = plageQuiExclutMaintenant();
  const res = await request(app).post('/api/auth/login').send({ email: 'x@exemple.tn', password: 'x' });
  expect(res.status).toBe(503);
  expect(res.body).toMatchObject({ horsService: true, plage: config.horairesService });
  expect(res.body.message).toMatch(/MedLink est accessible de/);
  expect(res.headers['retry-after']).toBe('3600');
  expect((await request(app).get('/api/health')).status).toBe(200);
  const h = await request(app).get('/api/horaires');
  expect(h.status).toBe(200);
  expect(h.body.ouvert).toBe(false);
  expect((await request(app).get('/api/maintenance/annonce')).status).toBe(200);
});

test('dans la plage : le portail répond normalement', async () => {
  config.horairesService = '00:00-24:00';
  expect((await request(app).get('/api/horaires')).body.ouvert).toBe(true);
  expect((await request(app).post('/api/auth/login').send({ email: 'x@exemple.tn', password: 'x' })).status).not.toBe(503);
});
