const app = require('./app');
const config = require('./config');

app.listen(config.port, () => {
  console.log(`API MedLink démarrée sur le port ${config.port} (${config.isProd ? 'production' : 'développement'})`);
});
