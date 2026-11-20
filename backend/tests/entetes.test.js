// US-61 : en-têtes de sécurité vérifiés après le scan ZAP (API Express et Nginx du conteneur web)
//   docker compose exec api npx jest tests/entetes.test.js
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { app, db } = require('./outils');

afterAll(() => db.pool.end());

test('API : pas de cache, en-têtes helmet, aucune signature du serveur', async () => {
  const res = await request(app).get('/api/health');
  expect(res.headers['cache-control']).toBe('no-store');
  expect(res.headers['x-content-type-options']).toBe('nosniff');
  expect(res.headers['x-frame-options']).toBeDefined();
  expect(res.headers['strict-transport-security']).toMatch(/max-age=/);
  expect(res.headers['content-security-policy']).toMatch(/default-src 'self'/);
  expect(res.headers['x-powered-by']).toBeUndefined();
});

test('API : erreurs sans détail technique', async () => {
  const inconnue = await request(app).get('/api/nexiste-pas');
  expect(inconnue.status).toBe(404);
  expect(inconnue.body).toEqual({ message: 'Ressource introuvable' });
  const json = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"email":');
  expect(json.status).toBe(400);
  expect(JSON.stringify(json.body)).not.toMatch(/SyntaxError|at |node_modules/);
});

// nginx.conf est hors du conteneur api en local (seul backend/ y est monté) : vérifié en CI
const NGINX = path.join(__dirname, '../../frontend/nginx.conf');
(fs.existsSync(NGINX) ? test : test.skip)('Nginx (conteneur web) : en-têtes de sécurité des pages', () => {
  const conf = fs.readFileSync(NGINX, 'utf8');
  for (const h of ['X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy', 'Content-Security-Policy',
    'Permissions-Policy', 'Cross-Origin-Opener-Policy', 'Cross-Origin-Resource-Policy']) {
    expect(conf).toMatch(new RegExp(`add_header ${h} "[^"]+" always;`));
  }
  expect(conf).toMatch(/server_tokens off;/);
  expect(conf).toMatch(/frame-ancestors 'none'/);
});
