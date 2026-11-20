// US-45 : chargement des secrets depuis Vault (test unitaire, faux serveur Vault local, sans base)
//   docker compose exec api npx jest tests/vault.test.js
const http = require('http');
const { chargerSecrets } = require('../src/security/vault');

const ROLE = 'role-api'; const SECRET = 'secret-api'; const JETON = 'hvs.jeton-test';
let serveur; let adresse; let appels; let secretStocke;

beforeAll(async () => {
  serveur = http.createServer((req, res) => {
    let corps = '';
    req.on('data', (d) => { corps += d; });
    req.on('end', () => {
      appels.push(`${req.method} ${req.url}`);
      const json = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (req.url === '/v1/auth/approle/login' && req.method === 'POST') {
        const { role_id: r, secret_id: s } = JSON.parse(corps || '{}');
        return r === ROLE && s === SECRET ? json(200, { auth: { client_token: JETON } }) : json(400, { errors: ['invalid role or secret ID'] });
      }
      if (req.headers['x-vault-token'] !== JETON) return json(403, { errors: ['permission denied'] });
      if (req.url === '/v1/secret/data/medlink') return json(200, { data: { data: secretStocke } });
      if (req.url === '/v1/auth/token/revoke-self') { res.writeHead(204); return res.end(); }
      return json(404, { errors: [] });
    });
  });
  await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok));
  adresse = `http://127.0.0.1:${serveur.address().port}`;
});
afterAll(() => new Promise((ok) => serveur.close(ok)));
beforeEach(() => {
  appels = [];
  secretStocke = { JWT_SECRET: 'v'.repeat(40), CHIFFREMENT_CLES: '1:cle-de-vault', DATABASE_URL: 'postgres://vault', AUTRE: 'ignorée' };
});

test('sans VAULT_ADDR : rien n\'est chargé (développement, CI)', async () => {
  const env = { JWT_SECRET: 'du-env' };
  expect(await chargerSecrets(env)).toEqual({ source: 'env', cles: [] });
  expect(env.JWT_SECRET).toBe('du-env');
});

test('AppRole : secrets autorisés copiés dans l\'environnement, jeton révoqué, valeurs jamais journalisées', async () => {
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  const env = { VAULT_ADDR: `${adresse}/`, VAULT_ROLE_ID: ROLE, VAULT_SECRET_ID: SECRET, JWT_SECRET: 'ancien' };
  const r = await chargerSecrets(env);
  expect(r).toEqual({ source: 'vault', cles: ['DATABASE_URL', 'JWT_SECRET', 'CHIFFREMENT_CLES'] });
  expect(env).toMatchObject({ JWT_SECRET: 'v'.repeat(40), CHIFFREMENT_CLES: '1:cle-de-vault', DATABASE_URL: 'postgres://vault' });
  expect(env.AUTRE).toBeUndefined();
  expect(appels).toEqual(['POST /v1/auth/approle/login', 'GET /v1/secret/data/medlink', 'POST /v1/auth/token/revoke-self']);
  const traces = log.mock.calls.map((c) => c.join(' ')).join('\n');
  expect(traces).toMatch(/SECRETS_VAULT/);
  expect(traces).not.toMatch(/vvvv|cle-de-vault|postgres:/);
  log.mockRestore();
});

test('secret_id lu dans un fichier (VAULT_SECRET_ID_FILE)', async () => {
  const fichier = require('path').join(require('os').tmpdir(), `vault-secret-${process.pid}`);
  require('fs').writeFileSync(fichier, `${SECRET}\n`, { mode: 0o600 });
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  const env = { VAULT_ADDR: adresse, VAULT_ROLE_ID: ROLE, VAULT_SECRET_ID_FILE: fichier };
  expect((await chargerSecrets(env)).source).toBe('vault');
  log.mockRestore();
  require('fs').unlinkSync(fichier);
});

test('échecs : l\'API refuse de démarrer', async () => {
  await expect(chargerSecrets({ VAULT_ADDR: adresse })).rejects.toThrow(/VAULT_ROLE_ID/);
  await expect(chargerSecrets({ VAULT_ADDR: adresse, VAULT_ROLE_ID: ROLE, VAULT_SECRET_ID: 'faux' })).rejects.toThrow(/invalid role/);
  delete secretStocke.CHIFFREMENT_CLES;
  await expect(chargerSecrets({ VAULT_ADDR: adresse, VAULT_ROLE_ID: ROLE, VAULT_SECRET_ID: SECRET })).rejects.toThrow(/CHIFFREMENT_CLES/);
  expect(appels).toContain('POST /v1/auth/token/revoke-self');     // jeton révoqué même en cas d'échec
  await expect(chargerSecrets({ VAULT_ADDR: 'http://127.0.0.1:1', VAULT_ROLE_ID: ROLE, VAULT_SECRET_ID: SECRET }, { delaiMs: 500 })).rejects.toThrow();
});
