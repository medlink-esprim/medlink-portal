// US-17 : tests unitaires TOTP avec les vecteurs officiels de la RFC 6238 (annexe B)
//   docker compose exec api npx jest tests/totp.test.js
const { base32Encode, base32Decode, hotp, codeCourant, verifierCode, genererSecret } = require('../src/security/totp');

const CLE_RFC = Buffer.from('12345678901234567890');   // clé SHA-1 de la RFC

test('vecteurs RFC 6238 (8 chiffres)', () => {
  const cas = [[59, '94287082'], [1111111109, '07081804'], [1111111111, '14050471'],
    [1234567890, '89005924'], [2000000000, '69279037'], [20000000000, '65353130']];
  for (const [t, attendu] of cas) expect(hotp(CLE_RFC, Math.floor(t / 30), 8)).toBe(attendu);
});

test('base32 : aller-retour et vecteur RFC 4648', () => {
  expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
  expect(base32Decode('MZXW6YTBOI').toString()).toBe('foobar');
  const s = genererSecret();
  expect(s).toHaveLength(32);
  expect(base32Encode(base32Decode(s))).toBe(s);
});

test('code accepté pendant sa période et la suivante, refusé ensuite', () => {
  const s = base32Encode(CLE_RFC);
  const t0 = 1111111111 * 1000;
  const code = codeCourant(s, t0);
  expect(code).toBe('050471');
  expect(verifierCode(s, code, t0)).toBe(true);
  expect(verifierCode(s, code, t0 + 30000)).toBe(true);    // décalage d'horloge toléré
  expect(verifierCode(s, code, t0 + 90000)).toBe(false);   // trop tard
  expect(verifierCode(s, '000000', t0)).toBe(false);
  expect(verifierCode(s, 'abc', t0)).toBe(false);
});
