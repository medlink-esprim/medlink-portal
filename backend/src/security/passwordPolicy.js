// Politique de mots de passe (US-42) : 12 caractères minimum, 4 classes,
// refus des mots de passe courants. Renvoie la liste des règles non respectées
// (liste vide = mot de passe valide), affichée telle quelle par le frontend.
const fs = require('fs');
const path = require('path');

const LIST_FILE = path.join(__dirname, 'common-passwords.txt');
let common = new Set();
try {
  common = new Set(
    fs.readFileSync(LIST_FILE, 'utf8')
      .split(/\r?\n/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
} catch {
  console.warn('common-passwords.txt introuvable : la vérification des mots de passe courants est désactivée.');
}

// "Password123!" -> "password" : un mot courant suivi de chiffres/symboles reste courant
function baseWord(pw) {
  return pw.toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, '');
}

function checkPassword(pw, { email = '' } = {}) {
  const errors = [];
  if (typeof pw !== 'string') return ['Mot de passe requis'];
  if (pw.length < 12) errors.push('12 caractères minimum');
  if (!/[a-z]/.test(pw)) errors.push('Une minuscule');
  if (!/[A-Z]/.test(pw)) errors.push('Une majuscule');
  if (!/[0-9]/.test(pw)) errors.push('Un chiffre');
  if (!/[^A-Za-z0-9]/.test(pw)) errors.push('Un caractère spécial');
  if (common.has(pw.toLowerCase()) || common.has(baseWord(pw))) {
    errors.push('Mot de passe trop courant');
  }
  const local = email.split('@')[0].toLowerCase();
  if (local.length >= 3 && pw.toLowerCase().includes(local)) {
    errors.push('Ne doit pas contenir votre e-mail');
  }
  return errors;
}

module.exports = { checkPassword };
