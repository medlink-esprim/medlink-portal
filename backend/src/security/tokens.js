// Jetons envoyés par e-mail (vérification, activation, réinitialisation).
// Seule l'empreinte SHA-256 est stockée : une fuite de la base ne donne aucun lien utilisable.
const crypto = require('crypto');

const sha256 = (t) => crypto.createHash('sha256').update(t).digest('hex');

// Crée un jeton valable `minutes` minutes et renvoie la valeur à mettre dans le lien.
async function issueToken(client, userId, type, minutes) {
  const token = crypto.randomBytes(32).toString('base64url');
  await client.query(
    `INSERT INTO jetons_securite (id_utilisateur, type, jeton_hash, expire_le)
     VALUES ($1, $2, $3, now() + make_interval(mins => $4))`,
    [userId, type, sha256(token), minutes],
  );
  return token;
}

// Lit un jeton valide SANS le consommer (pour vérifier le mot de passe avant).
async function findValidToken(client, token, type) {
  const { rows } = await client.query(
    `SELECT j.id_utilisateur, u.email
       FROM jetons_securite j JOIN utilisateurs u USING (id_utilisateur)
      WHERE j.jeton_hash = $1 AND j.type = $2 AND NOT j.utilise AND j.expire_le > now()
      FOR UPDATE OF j`,
    [sha256(token), type],
  );
  return rows[0] || null;
}

// Consomme le jeton : un seul UPDATE ... RETURNING => utilisable une seule fois,
// même si le lien est ouvert deux fois en même temps.
async function consumeToken(client, token, type) {
  const { rows } = await client.query(
    `UPDATE jetons_securite SET utilise = true
      WHERE jeton_hash = $1 AND type = $2 AND NOT utilise AND expire_le > now()
      RETURNING id_utilisateur`,
    [sha256(token), type],
  );
  return rows[0] ? rows[0].id_utilisateur : null;
}

module.exports = { issueToken, findValidToken, consumeToken, sha256 };
