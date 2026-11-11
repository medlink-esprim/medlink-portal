// US-58 : analyse statique du backend (ESLint 9, configuration « flat »).
// Les variables non déclarées et le code inaccessible sont des ERREURS qui bloquent la CI ;
// les autres règles recommandées sont signalées en avertissement.
const js = require('@eslint/js');
const globals = require('globals');

const avertissements = Object.fromEntries(Object.keys(js.configs.recommended.rules).map((r) => [r, 'warn']));

module.exports = [
  { ignores: ['node_modules/**', 'stockage/**', 'coverage/**'] },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node, ...globals.jest },
    },
    rules: {
      ...avertissements,
      'no-undef': 'error',
      'no-unreachable': 'error',
      'no-dupe-keys': 'error',
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
    },
  },
];
