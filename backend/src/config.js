// Configuration lue dans les variables d'environnement (.env, jamais commité).
require('dotenv').config();

const required = ['DATABASE_URL', 'JWT_SECRET', 'APP_URL', 'CHIFFREMENT_CLES'];
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

// US-43 : clés AES-256 (32 octets en base64), versionnées pour permettre la rotation.
//   CHIFFREMENT_CLES=1:<clé base64>,2:<clé base64>   CHIFFREMENT_CLE_ACTIVE=2
// Générer une clé avec : openssl rand -base64 32
function lireCles(texte) {
  const cles = new Map();
  for (const morceau of texte.split(',').map((m) => m.trim()).filter(Boolean)) {
    const [version, b64] = morceau.split(':');
    const v = Number(version);
    const cle = Buffer.from(b64 || '', 'base64');
    if (!Number.isInteger(v) || v < 1 || v > 255 || cle.length !== 32) {
      console.error('CHIFFREMENT_CLES invalide : format attendu 1:<32 octets en base64> (openssl rand -base64 32).');
      process.exit(1);
    }
    cles.set(v, cle);
  }
  return cles;
}
const cles = lireCles(process.env.CHIFFREMENT_CLES);
const active = Number(process.env.CHIFFREMENT_CLE_ACTIVE || Math.max(...cles.keys()));
if (!cles.has(active)) {
  console.error(`CHIFFREMENT_CLE_ACTIVE=${active} ne correspond à aucune clé de CHIFFREMENT_CLES.`);
  process.exit(1);
}

module.exports = {
  chiffrement: { cles, active },
  rappelsActifs: process.env.RAPPELS_ACTIFS !== 'false',   // US-48
  seuilAccesSuspects: Number(process.env.SEUIL_ACCES_SUSPECTS || 20),   // US-36 : dossiers distincts par heure
  // US-13 : fichiers des documents médicaux, chiffrés, hors de la racine web (volume Docker « documents »)
  documentsDir: process.env.DOCUMENTS_DIR || require('path').join(__dirname, '..', 'stockage'),
  port: Number(process.env.PORT || 3000),
  isProd: process.env.NODE_ENV === 'production',
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  appUrl: process.env.APP_URL.replace(/\/$/, ''),
  smtpUrl: process.env.SMTP_URL || 'smtp://mailpit:1025',
  mailFrom: process.env.MAIL_FROM || 'MedLink <no-reply@medlink.local>',
  trustProxy: Number(process.env.TRUST_PROXY || 1),
};
