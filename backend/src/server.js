// Démarrage de l'API. US-45 : les secrets sont d'abord lus dans Vault (si VAULT_ADDR est défini),
// puis seulement l'application et sa configuration sont chargées.
require('dotenv').config();
const { chargerSecrets } = require('./security/vault');

async function demarrer() {
  await chargerSecrets();
  const cron = require('node-cron');
  const app = require('./app');
  const config = require('./config');
  const { envoyerRappels } = require('./services/rappels');

  app.listen(config.port, () => {
    console.log(`API MedLink démarrée sur le port ${config.port} (${config.isProd ? 'production' : 'développement'})`);
  });

  // US-48 : rappels automatiques, toutes les 15 minutes (désactivables avec RAPPELS_ACTIFS=false)
  if (config.rappelsActifs) {
    cron.schedule('*/15 * * * *', async () => {
      try {
        const r = await envoyerRappels();
        if (r.rendezVous) console.log(JSON.stringify({ date: new Date().toISOString(), evenement: 'RAPPELS', ...r }));
      } catch (err) {
        console.error('Tâche des rappels en échec :', err.message);
      }
    }, { timezone: 'Africa/Tunis' });
  }
}

demarrer().catch((err) => {
  console.error(`Démarrage impossible : ${err.message}`);
  process.exit(1);
});
