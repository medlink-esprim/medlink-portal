// US-42 : tests unitaires de la politique de mots de passe (aucune base nécessaire)
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://x:y@localhost/z';
const { checkPassword } = require('../src/security/passwordPolicy');

describe('politique de mots de passe', () => {
  test('11 caractères : refusé', () => {
    expect(checkPassword('Abcdefgh1!x')).toContain('12 caractères minimum');
  });

  test('12 caractères avec les 4 classes : accepté', () => {
    expect(checkPassword('Ksv!7rTq2#Lm')).toEqual([]);
  });

  test('mot courant suivi de chiffres et symboles : refusé', () => {
    expect(checkPassword('Password1234!')).toContain('Mot de passe trop courant');
  });

  test('chaque classe manquante est signalée', () => {
    expect(checkPassword('abcdefghijkl')).toEqual(
      expect.arrayContaining(['Une majuscule', 'Un chiffre', 'Un caractère spécial']),
    );
  });

  test("ne doit pas contenir la partie locale de l'e-mail", () => {
    expect(checkPassword('Salma.benali#2026', { email: 'salma.benali@exemple.tn' }))
      .toContain('Ne doit pas contenir votre e-mail');
  });
});
