// Accès à PostgreSQL. Toujours des requêtes paramétrées ($1, $2...) :
// jamais de concaténation de chaînes dans le SQL (OWASP A03 - Injection).
const { Pool } = require('pg');
const config = require('./config');

const pool = new Pool({ connectionString: config.databaseUrl });

// Exécute fn(client) dans une transaction : COMMIT si tout réussit, ROLLBACK sinon.
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  query: (text, params) => pool.query(text, params),
  withTransaction,
  pool,
};
