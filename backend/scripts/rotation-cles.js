// US-43 : rotation de la clé de chiffrement.
// Rechiffre avec la clé ACTIVE toutes les valeurs encore chiffrées avec une ancienne version.
// Procédure complète : deploy/ROTATION_CLES.md
//   docker compose exec api node scripts/rotation-cles.js
const db = require('../src/db');
const config = require('../src/config');
const { chiffrer, dechiffrer } = require('../src/security/chiffrement');

// Champs chiffrés : table, clé primaire, colonne chiffrée, colonne servant de contexte
const CHAMPS = [
  { table: 'utilisateurs', id: 'id_utilisateur', col: 'mfa_secret_chiffre', ctx: 'id_utilisateur' },
  { table: 'rendez_vous', id: 'id_rdv', col: 'motif_chiffre', ctx: 'id_patient' },
];

(async () => {
  const active = config.chiffrement.active;
  for (const c of CHAMPS) {
    const n = await db.withTransaction(async (client) => {
      // noms de tables / colonnes : constantes du script, jamais issues d'une saisie
      const { rows } = await client.query(
        `SELECT ${c.id} AS id, ${c.ctx} AS ctx, ${c.col} AS valeur FROM ${c.table}
          WHERE ${c.col} IS NOT NULL AND get_byte(${c.col}, 0) <> $1 FOR UPDATE`,
        [active],
      );
      for (const r of rows) {
        const clair = dechiffrer(r.valeur, r.ctx);
        await client.query(`UPDATE ${c.table} SET ${c.col} = $1 WHERE ${c.id} = $2`, [chiffrer(clair, r.ctx), r.id]);
      }
      return rows.length;
    });
    console.log(`${c.table}.${c.col} : ${n} valeur(s) rechiffrée(s) avec la clé ${active}`);
  }
  await db.pool.end();
})().catch(async (err) => {
  console.error('Erreur :', err.message);
  await db.pool.end();
  process.exit(1);
});
