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
  const { marquerAbsences } = require('./services/presences');

  app.listen(config.port, () => {
    console.log(`API MedLink démarrée sur le port ${config.port} (${config.isProd ? 'production' : 'développement'})`);
  });

  // rendez-vous passés sans présence notée depuis 48 h : « manqué » (au démarrage, la VM pouvant être
  // arrêtée la nuit, puis chaque jour à 03:00)
  const absences = () => marquerAbsences().catch((err) => console.error('Marquage des absences en échec :', err.message));
  absences();
  cron.schedule('0 3 * * *', absences, { timezone: 'Africa/Tunis' });

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
