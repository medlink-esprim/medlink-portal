# Checklist de sécurité OWASP (US-59)

Chaque exigence de sécurité du cahier des charges est reliée à un risque de l'**OWASP Top 10 (2021)**,
à son implémentation dans le code et à la preuve qui la vérifie. Mise à jour à chaque release ;
dernière revue : Release 3 (Sprint 6). ✅ = vérifié automatiquement (CI) ou par test documenté.

## A01 — Contrôle d'accès défaillant

| # | Exigence | Implémentation | Preuve | US | ✓ |
|---|---|---|---|---|---|
| 1.1 | Accès par rôle et par permission, jamais côté client seulement | `middleware/auth.js` : `requirePermission(code)` sur chaque route ; permissions dans le jeton, matrice en base (`role_permission`) | `tests/rbac.test.js` (27 routes × 5 rôles), `tests/roles.test.js` | 39, 33, 62 | ✅ |
| 1.2 | Un praticien n'ouvre que le dossier d'un patient reçu | `security/soins.js` (`aRelationDeSoins`) | `tests/praticien.test.js`, `tests/rbac.test.js` | 23 | ✅ |
| 1.3 | Un patient ne voit que ses propres données (IDOR) | contrôle `id_patient = req.user.id` sur rendez-vous et documents | `tests/rbac.test.js` (accès horizontaux) | 11, 14 | ✅ |
| 1.4 | Tout refus est tracé | `refuser()` → `ACCES_REFUSE` | `tests/rbac.test.js` | 39 | ✅ |
| 1.5 | Accès aux dossiers journalisés, journal non modifiable | table `journal_acces_dossiers` + déclencheur « ajout seul » | `tests/acces.test.js` | 47 | ✅ |
| 1.6 | Détection d'accès massifs | `security/surveillance.js` (> 20 dossiers / h) | `tests/surveillance.test.js` | 36 | ✅ |
| 1.7 | Cookies `SameSite=Strict` (CSRF), même origine, aucun CORS | `security/session.js`, proxy Vite / Nginx | revue de code, `tests/api.test.js` | 40 | ✅ |

## A02 — Défaillances cryptographiques

| # | Exigence | Implémentation | Preuve | US | ✓ |
|---|---|---|---|---|---|
| 2.1 | Données médicales chiffrées au repos | AES-256-GCM, contexte lié à l'enregistrement, clés versionnées (rotation) | `tests/chiffrement.test.js` | 43 | ✅ |
| 2.2 | Fichiers médicaux chiffrés et contrôlés | `services/stockage.js` (chiffrement + empreinte, `DOCUMENT_ALTERE`) | `tests/documents.test.js` | 13, 14 | ✅ |
| 2.3 | HTTPS uniquement, TLS 1.2/1.3, HSTS | `deploy/nginx-medlink*.conf` (Let's Encrypt, suites ECDHE-GCM) | SSL Labs, `tests/entetes.test.js` | 44 | ✅ |
| 2.4 | Mots de passe hachés | Argon2id | `tests/api.test.js` | 01, 42 | ✅ |
| 2.5 | Secrets hors du code | `.env` ignoré ; production : HashiCorp Vault (AppRole, jeton révoqué) | `tests/vault.test.js`, `deploy/VAULT.md` | 45 | ✅ |
| 2.6 | Sauvegardes chiffrées | AES-256 (PBKDF2), clé hors VM | `deploy/SAUVEGARDES.md` | 37 | ✅ |
| 2.7 | Statistiques sans donnée personnelle | agrégats, effectifs < 3 masqués | `tests/statistiques.test.js` | 32, 46 | ✅ |

## A03 — Injection

| # | Exigence | Implémentation | Preuve | US | ✓ |
|---|---|---|---|---|---|
| 3.1 | Aucune requête SQL concaténée | requêtes paramétrées `node-pg` (`$1…`) partout ; `%` et `_` échappés dans les recherches | revue de code, `tests/praticien.test.js` | 22, 30 | ✅ |
| 3.2 | Entrées validées | schémas Joi (`middleware/validate.js`), `stripUnknown` | tous les tests 400 | — | ✅ |
| 3.3 | Pas d'injection CSV | cellules `= + - @` neutralisées | `tests/audit.test.js`, `tests/statistiques.test.js` | 35, 32 | ✅ |
| 3.4 | Pas de XSS | React échappe l'affichage ; CSP `default-src 'self'` sans `unsafe-inline` | `tests/entetes.test.js`, ZAP | 44, 61 | ✅ |

## A04 — Conception non sécurisée

| # | Exigence | Implémentation | Preuve | US | ✓ |
|---|---|---|---|---|---|
| 4.1 | Double réservation impossible | verrou de ligne + index unique partiel `uq_rdv_creneau_actif` | `tests/rendezvous.test.js` | 07 | ✅ |
| 4.2 | Moindre privilège des comptes de service | politique Vault en lecture d'un seul chemin ; port Postgres non publié | `deploy/vault/medlink-api.hcl`, compose prod | 45, 57 | ✅ |
| 4.3 | Suppression des données conforme INPDP | désactivation + effacement des coordonnées, dossiers médicaux conservés (obligation légale) | `tests/demandes.test.js` | 16 | ✅ |

## A05 — Mauvaise configuration de sécurité

| # | Exigence | Implémentation | Preuve | US | ✓ |
|---|---|---|---|---|---|
| 5.1 | En-têtes de sécurité | helmet (API) ; Nginx : CSP, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, COOP, CORP | `tests/entetes.test.js` | 44, 61 | ✅ |
| 5.2 | Aucune information technique en erreur | gestionnaire d'erreurs générique, `x-powered-by` désactivé, `server_tokens off` | `tests/entetes.test.js` | 61 | ✅ |
| 5.3 | Réponses de l'API non mises en cache | `Cache-Control: no-store` | `tests/entetes.test.js` | 61 | ✅ |
| 5.4 | Seul le port 443 exposé | Nginx de l'hôte → `127.0.0.1:8080` ; Mailpit et Vault non publiés | `docker-compose.prod.yml` | 57 | ✅ |
| 5.5 | Scan de vulnérabilités avant production | OWASP ZAP (passif + actif), 0 High | `docs/securite/ZAP.md` | 60, 61 | ⬜ à chaque release |

## A06 — Composants vulnérables

| # | Exigence | Implémentation | Preuve | US | ✓ |
|---|---|---|---|---|---|
| 6.1 | Dépendances analysées | `npm audit` (backend et frontend) dans la CI | `.github/workflows/ci.yml` | 58 | ✅ |
| 6.2 | Images de base suivies | `node:20-slim`, `postgres:16`, `nginx:1.27-alpine`, `hashicorp/vault:1.17` | revue à chaque release | — | ✅ |

## A07 — Identification et authentification

| # | Exigence | Implémentation | Preuve | US | ✓ |
|---|---|---|---|---|---|
| 7.1 | Politique de mot de passe | 12 caractères, 4 classes, liste de mots de passe courants | `tests/passwordPolicy.test.js` | 42 | ✅ |
| 7.2 | Anti brute-force | 5 échecs → verrouillage 15 min ; 20 essais / 15 min / IP sur `/api/auth` ; 600 req / 5 min / IP sur l'API | `tests/bruteforce.test.js` | 41, 61 | ✅ |
| 7.3 | MFA du personnel | TOTP (RFC 6238), codes de secours, obligatoire praticien et admin | `tests/mfa.test.js`, `tests/totp.test.js` | 17, 34 | ✅ |
| 7.4 | Sessions maîtrisées | JWT court en cookie HttpOnly, rafraîchissement, 15 min d'inactivité, 8 h max, révocation | `tests/api.test.js` | 40 | ✅ |
| 7.5 | Messages génériques | « identifiants invalides » sans distinguer e-mail / mot de passe | `tests/api.test.js` | 02 | ✅ |
| 7.6 | Compte désactivé = sessions coupées | `revokeAllSessions` | `tests/comptes.test.js` | 28 | ✅ |

## A08 — Intégrité des logiciels et des données

| # | Exigence | Implémentation | Preuve | US | ✓ |
|---|---|---|---|---|---|
| 8.1 | Intégrité des documents | empreinte vérifiée au téléchargement, PDF signé `%PDF-` à l'envoi | `tests/documents.test.js`, `tests/praticien.test.js` | 14, 25 | ✅ |
| 8.2 | Intégrité des sauvegardes | SHA-256 vérifié avant restauration | `deploy/sauvegarde/restaurer.sh` | 37 | ✅ |
| 8.3 | Code revu et testé avant fusion | PR obligatoire, relecture, CI verte | règles du dépôt | 55, 58 | ✅ |

## A09 — Journalisation et surveillance

| # | Exigence | Implémentation | Preuve | US | ✓ |
|---|---|---|---|---|---|
| 9.1 | Événements de sécurité journalisés sans secret | `security/journal.js` (JSON), 26 événements, voir `docs/JOURNAL_AUDIT.md` | tests des événements | 35, 47 | ✅ |
| 9.2 | Journal consultable et exportable par l'admin | page « Journal d'audit » | `tests/audit.test.js` | 35 | ✅ |
| 9.3 | Alerte en temps réel | e-mail aux administrateurs (`ACCES_SUSPECT`) | `tests/surveillance.test.js` | 36 | ✅ |

## A10 — Falsification de requête côté serveur (SSRF)

| # | Exigence | Implémentation | Preuve | US | ✓ |
|---|---|---|---|---|---|
| 10.1 | Aucune URL fournie par l'utilisateur n'est appelée par le serveur | seules sorties : SMTP et Vault, adresses fixées par la configuration | revue de code | — | ✅ |
