// Configuration lue dans les variables d'environnement (.env, jamais commité).
require('dotenv').config();

const required = ['DATABASE_URL', 'JWT_SECRET', 'APP_URL'];
for (const name of required) {
  if (!process.env[name]) {
    console.error(`Variable d'environnement manquante : ${name}`);
    process.exit(1);
  }
}
if (process.env.JWT_SECRET.length < 32) {
  console.error('JWT_SECRET doit contenir au moins 32 caractères (openssl rand -hex 32).');
  process.exit(1);
}

module.exports = {
  port: Number(process.env.PORT || 3000),
  isProd: process.env.NODE_ENV === 'production',
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  appUrl: process.env.APP_URL.replace(/\/$/, ''),
  smtpUrl: process.env.SMTP_URL || 'smtp://mailpit:1025',
  mailFrom: process.env.MAIL_FROM || 'MedLink <no-reply@medlink.local>',
  trustProxy: Number(process.env.TRUST_PROXY || 1),
};
