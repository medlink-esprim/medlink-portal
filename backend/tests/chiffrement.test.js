// US-43 : tests unitaires du module AES-256-GCM (sans base de données)
//   docker compose exec api npx jest tests/chiffrement.test.js
const { chiffrer, dechiffrer, versionDe } = require('../src/security/chiffrement');

test('aller-retour : le texte déchiffré est identique', () => {
  const v = chiffrer('Contrôle annuel, essoufflement à l\'effort.', 'patient-1');
  expect(dechiffrer(v, 'patient-1')).toBe('Contrôle annuel, essoufflement à l\'effort.');
});

test('la valeur stockée ne contient pas le texte en clair', () => {
  const v = chiffrer('essoufflement', 'patient-1');
  expect(v.toString('latin1')).not.toContain('essoufflement');
  expect(versionDe(v)).toBeGreaterThanOrEqual(1);
});

test('deux chiffrements du même texte sont différents (IV aléatoire)', () => {
  expect(chiffrer('motif', 'p').equals(chiffrer('motif', 'p'))).toBe(false);
});

test('une valeur modifiée ou déplacée vers un autre patient est rejetée', () => {
  const v = chiffrer('motif', 'patient-1');
  expect(() => dechiffrer(v, 'patient-2')).toThrow();
  const abimee = Buffer.from(v); abimee[abimee.length - 1] ^= 1;
  expect(() => dechiffrer(abimee, 'patient-1')).toThrow();
});

test('valeur vide : rien n\'est stocké', () => {
  expect(chiffrer('')).toBeNull();
  expect(dechiffrer(null)).toBeNull();
});
