// US-43 : chiffrement des champs médicaux au repos, en AES-256-GCM (chiffrement authentifié).
// Format stocké (BYTEA) : version de clé (1 octet) | IV (12 octets) | étiquette GCM (16 octets) | texte chiffré
//  - un IV aléatoire par valeur : deux motifs identiques donnent deux valeurs différentes ;
//  - l'étiquette détecte toute modification ; le « contexte » (ex. id du patient) est lié à la
//    valeur comme donnée authentifiée : copier un motif chiffré sur la ligne d'un autre patient échoue ;
//  - la version de clé permet la rotation (scripts/rotation-cles.js).
const crypto = require('crypto');
const config = require('../config');

const ALGO = 'aes-256-gcm';
const IV = 12;
const TAG = 16;

// Chiffre des octets (fichiers de documents, US-13) ; renvoie un Buffer au format ci-dessus
function chiffrerOctets(octets, contexte = '') {
  const version = config.chiffrement.active;
  const iv = crypto.randomBytes(IV);
  const cipher = crypto.createCipheriv(ALGO, config.chiffrement.cles.get(version), iv);
  cipher.setAAD(Buffer.from(String(contexte)));
  const corps = Buffer.concat([cipher.update(octets), cipher.final()]);
  return Buffer.concat([Buffer.from([version]), iv, cipher.getAuthTag(), corps]);
}

function dechiffrerOctets(valeur, contexte = '') {
  const buf = Buffer.from(valeur);
  const cle = config.chiffrement.cles.get(buf[0]);
  if (!cle) throw new Error(`Clé de chiffrement version ${buf[0]} absente`);
  const decipher = crypto.createDecipheriv(ALGO, cle, buf.subarray(1, 1 + IV));
  decipher.setAAD(Buffer.from(String(contexte)));
  decipher.setAuthTag(buf.subarray(1 + IV, 1 + IV + TAG));
  return Buffer.concat([decipher.update(buf.subarray(1 + IV + TAG)), decipher.final()]);
}

function chiffrer(texte, contexte = '') {
  if (texte === null || texte === undefined || texte === '') return null;
  return chiffrerOctets(Buffer.from(String(texte), 'utf8'), contexte);
}

function dechiffrer(valeur, contexte = '') {
  if (!valeur) return null;
  return dechiffrerOctets(valeur, contexte).toString('utf8');
}

// Version de clé utilisée par une valeur chiffrée (pour la rotation)
const versionDe = (valeur) => (valeur ? Buffer.from(valeur)[0] : null);

module.exports = { chiffrer, dechiffrer, chiffrerOctets, dechiffrerOctets, versionDe };
