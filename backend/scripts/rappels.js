// US-48 : exécute une fois la tâche des rappels (démonstration et test d'acceptation TA-3.5).
//   docker compose exec api node scripts/rappels.js
// Lancé deux fois de suite, le second passage n'envoie rien : chaque rappel n'est envoyé qu'une fois.
const db = require('../src/db');
const { envoyerRappels, FENETRE_H } = require('../src/services/rappels');

(async () => {
  const r = await envoyerRappels();
  console.log(`Rendez-vous dans les ${FENETRE_H} prochaines heures sans rappel : ${r.rendezVous} — messages envoyés : ${r.envoyes}`);
  await db.pool.end();
})().catch(async (err) => {
  console.error('Erreur :', err.message);
  await db.pool.end();
  process.exit(1);
});
