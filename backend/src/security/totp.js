// US-17 / US-34 : mots de passe à usage unique basés sur le temps (TOTP, RFC 6238),
// compatibles avec Google Authenticator, FreeOTP, Microsoft Authenticator…
// HMAC-SHA1, 6 chiffres, période de 30 s ; on accepte ±1 période pour le décalage d'horloge.
const crypto = require('crypto');

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const PERIODE = 30;
const CHIFFRES = 6;

function base32Encode(buf) {
  let bits = 0; let valeur = 0; let sortie = '';
  for (const octet of buf) {
    valeur = (valeur << 8) | octet; bits += 8;
    while (bits >= 5) { sortie += ALPHABET[(valeur >>> (bits - 5)) & 31]; bits -= 5; }
    valeur &= (1 << bits) - 1;
  }
  if (bits > 0) sortie += ALPHABET[(valeur << (5 - bits)) & 31];
  return sortie;
}

function base32Decode(texte) {
  const s = String(texte).toUpperCase().replace(/[\s=]/g, '');
  let bits = 0; let valeur = 0; const octets = [];
  for (const c of s) {
    const i = ALPHABET.indexOf(c);
    if (i < 0) throw new Error('Secret base32 invalide');
    valeur = (valeur << 5) | i; bits += 5;
    if (bits >= 8) { octets.push((valeur >>> (bits - 8)) & 255); bits -= 8; }
    valeur &= (1 << bits) - 1;
  }
  return Buffer.from(octets);
}

function hotp(cle, compteur, chiffres = CHIFFRES) {
  const c = Buffer.alloc(8);
  c.writeBigUInt64BE(BigInt(compteur));
  const h = crypto.createHmac('sha1', cle).update(c).digest();
  const o = h[h.length - 1] & 0x0f;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 10 ** chiffres).padStart(chiffres, '0');
}

// Secret de 160 bits (recommandation RFC 4226), encodé en base32 pour l'application
const genererSecret = () => base32Encode(crypto.randomBytes(20));

const codeCourant = (secret, maintenant = Date.now()) =>
  hotp(base32Decode(secret), Math.floor(maintenant / 1000 / PERIODE));

function verifierCode(secret, code, maintenant = Date.now(), fenetre = 1) {
  const saisi = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(saisi)) return false;
  const cle = base32Decode(secret);
  const t = Math.floor(maintenant / 1000 / PERIODE);
  let valide = false;
  for (let d = -fenetre; d <= fenetre; d += 1) {
    // comparaison à temps constant : la durée ne révèle pas les chiffres corrects
    if (crypto.timingSafeEqual(Buffer.from(hotp(cle, t + d)), Buffer.from(saisi))) valide = true;
  }
  return valide;
}

// Adresse lue par l'application d'authentification (affichée sous forme de QR code)
const uriOtpauth = (email, secret) =>
  `otpauth://totp/MedLink:${encodeURIComponent(email)}?secret=${secret}&issuer=MedLink&algorithm=SHA1&digits=${CHIFFRES}&period=${PERIODE}`;

module.exports = { base32Encode, base32Decode, hotp, genererSecret, codeCourant, verifierCode, uriOtpauth };
