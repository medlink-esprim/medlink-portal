# Scan OWASP ZAP (US-60) et corrections (US-61)

## Lancer le scan

1. Démarrer la VM Azure (portail > Start).
2. GitHub > **Actions** > **Scan OWASP ZAP** > **Run workflow** : cible `https://medlink-esprit.francecentral.cloudapp.azure.com`,
   d'abord sans « Scan complet » (passif, ~3 min), puis avec (actif, ~20 min).
3. Résultat : résumé par niveau de risque dans la page du run, rapport HTML/JSON/Markdown dans **Artifacts**.
   Le job est rouge s'il reste une alerte **High**.

Depuis un PC avec Docker Desktop : `deploy/zap/scanner.sh <url> [complet]` (rapports dans `rapports-zap/`, non commités).

## Règles écartées (`.zap/rules.tsv`) et justification

| Règle | Nom | Raison |
|---|---|---|
| 10096 | Timestamp Disclosure | nombres du bundle JavaScript minifié, aucune date serveur |
| 10027 | Suspicious Comments | commentaires de bibliothèques tierces dans le bundle |
| 10109 | Modern Web Application | information : application React |
| 10049 | Storable and Cacheable Content | fichiers statiques versionnés ; l'API répond en `no-store` |

Toute autre alerte reste signalée.

## Corrections appliquées (US-61)

| Constat ZAP attendu | Risque | Correction | Vérification |
|---|---|---|---|
| Permissions Policy Header Not Set (10063) | Low | `Permissions-Policy` dans `frontend/nginx.conf` | `tests/entetes.test.js` |
| Insufficient Site Isolation Against Spectre (90004) | Low | `Cross-Origin-Opener-Policy` et `Cross-Origin-Resource-Policy: same-origin` | idem |
| Re-examine Cache-control Directives (10015) | Info | `Cache-Control: no-store` sur toute l'API | idem |
| Absence de limitation globale | — | 600 requêtes / 5 min / IP sur `/api` en production (en plus de 20 / 15 min sur `/api/auth`) | revue de code |
| (déjà en place) CSP, X-Frame-Options, nosniff, Referrer-Policy, HSTS, `server_tokens off`, cookies `HttpOnly; Secure; SameSite=Strict`, pas de `X-Powered-By` | — | Sprints 1 à 3 (US-44) | `tests/entetes.test.js` |

## Résultats (à compléter après chaque scan)

| Date | Type | High | Medium | Low | Info | Commentaire |
|---|---|---|---|---|---|---|
| | passif | | | | | avant corrections |
| | passif | 0 | | | | après corrections |
| | complet | 0 | | | | |

Objectif de la release : **0 alerte High et 0 alerte Medium non justifiée**. Une alerte Medium acceptée est
décrite ci-dessous avec sa justification (ex. `Server: nginx` sans version : `server_tokens off` masque la version,
le nom seul ne peut être retiré qu'avec un module Nginx supplémentaire).
