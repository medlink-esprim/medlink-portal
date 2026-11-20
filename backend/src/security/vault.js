// US-45 : secrets de production lus dans HashiCorp Vault au démarrage de l'API.
// Facultatif : sans VAULT_ADDR, rien ne change (développement, tests, CI : variables du .env).
// Avec VAULT_ADDR :
//   1. connexion AppRole (VAULT_ROLE_ID + VAULT_SECRET_ID, ou VAULT_SECRET_ID_FILE) ;
//   2. lecture du secret KV v2 VAULT_SECRET_PATH (par défaut secret/data/medlink) ;
//   3. seules les clés de SECRETS_AUTORISES sont copiées dans process.env, AVANT le chargement de config.js ;
//   4. le jeton Vault est révoqué : l'API ne garde aucun accès à Vault après le démarrage.
// En cas d'échec, l'API refuse de démarrer (on ne retombe pas en silence sur d'autres secrets).
const fs = require('fs');

const SECRETS_AUTORISES = ['DATABASE_URL', 'JWT_SECRET', 'CHIFFREMENT_CLES', 'CHIFFREMENT_CLE_ACTIVE', 'SMTP_URL'];

async function appel(url, options, delaiMs) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(delaiMs) });
  const corps = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = (corps.errors || []).join(', ') || `HTTP ${res.status}`;
    throw new Error(`Vault ${new URL(url).pathname} : ${detail}`);
  }
  return corps;
}

async function chargerSecrets(env = process.env, { delaiMs = 5000 } = {}) {
  if (!env.VAULT_ADDR) return { source: 'env', cles: [] };
  const adresse = env.VAULT_ADDR.replace(/\/$/, '');
  const roleId = env.VAULT_ROLE_ID;
  const secretId = env.VAULT_SECRET_ID_FILE ? fs.readFileSync(env.VAULT_SECRET_ID_FILE, 'utf8').trim() : env.VAULT_SECRET_ID;
  if (!roleId || !secretId) throw new Error('VAULT_ROLE_ID et VAULT_SECRET_ID (ou VAULT_SECRET_ID_FILE) sont requis avec VAULT_ADDR');
  const chemin = (env.VAULT_SECRET_PATH || 'secret/data/medlink').replace(/^\/+/, '');

  const login = await appel(`${adresse}/v1/auth/approle/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role_id: roleId, secret_id: secretId }),
  }, delaiMs);
  const jeton = login.auth && login.auth.client_token;
  if (!jeton) throw new Error('Vault : connexion AppRole sans jeton');

  try {
    const lu = await appel(`${adresse}/v1/${chemin}`, { headers: { 'X-Vault-Token': jeton } }, delaiMs);
    const donnees = (lu.data && lu.data.data) || {};
    const cles = SECRETS_AUTORISES.filter((k) => typeof donnees[k] === 'string' && donnees[k] !== '');
    if (!cles.includes('JWT_SECRET') || !cles.includes('CHIFFREMENT_CLES')) {
      throw new Error(`Vault : JWT_SECRET et CHIFFREMENT_CLES doivent être présents dans ${chemin}`);
    }
    for (const k of cles) env[k] = donnees[k];
    // noms des clés seulement, jamais les valeurs
    console.log(JSON.stringify({ date: new Date().toISOString(), evenement: 'SECRETS_VAULT', chemin, cles }));
    return { source: 'vault', cles };
  } finally {
    await fetch(`${adresse}/v1/auth/token/revoke-self`, { method: 'POST', headers: { 'X-Vault-Token': jeton }, signal: AbortSignal.timeout(delaiMs) }).catch(() => {});
  }
}

module.exports = { chargerSecrets, SECRETS_AUTORISES };
