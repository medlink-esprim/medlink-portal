// Crée le PREMIER compte agent administratif (impossible depuis l'interface,
// puisque seul un agent peut créer des comptes). Affiche un lien d'activation :
// l'agent choisit lui-même son mot de passe, aucun mot de passe ne passe par le terminal.
//
// Usage (dans le conteneur api) :
//   docker compose exec api node scripts/create-agent.js --email agent@medlink.tn --nom Jaziri --prenom Nour --ville Sousse
const db = require('../src/db');
const config = require('../src/config');
const { issueToken } = require('../src/security/tokens');

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

(async () => {
  const email = (arg('email') || '').trim().toLowerCase();
  const nom = arg('nom');
  const prenom = arg('prenom');
  const ville = arg('ville') || 'Sousse';
  const role = arg('role') === 'ADMIN' ? 'ADMIN' : 'AGENT_ADMIN';
  if (!email || !nom || !prenom) {
    console.error('Usage : node scripts/create-agent.js --email <e-mail> --nom <nom> --prenom <prénom> [--ville Sousse|Sfax|Tunis] [--role ADMIN]');
    process.exit(1);
  }

  const token = await db.withTransaction(async (client) => {
    const clinique = await client.query('SELECT id_clinique FROM cliniques WHERE ville = $1', [ville]);
    if (!clinique.rows[0]) throw new Error(`Clinique introuvable pour la ville ${ville}`);
    const { rows } = await client.query(
      `INSERT INTO utilisateurs (id_role, nom, prenom, email)
       VALUES ((SELECT id_role FROM roles WHERE code = $1), $2, $3, $4)
       RETURNING id_utilisateur`,
      [role, nom, prenom, email],
    );
    const id = rows[0].id_utilisateur;
    await client.query(
      'INSERT INTO personnels (id_utilisateur, fonction, id_clinique) VALUES ($1, $2, $3)',
      [id, role === 'ADMIN' ? 'Administrateur du portail' : 'Agent administratif', clinique.rows[0].id_clinique],
    );
    return issueToken(client, id, 'activation', 72 * 60);
  });

  console.log(`Compte ${role} créé pour ${email}.`);
  console.log(`Lien d'activation (72 h) : ${config.appUrl}/activation?token=${token}`);
  await db.pool.end();
})().catch(async (err) => {
  console.error('Erreur :', err.message);
  await db.pool.end();
  process.exit(1);
});
