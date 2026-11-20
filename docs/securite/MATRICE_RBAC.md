# Matrice des accès par rôle (US-62)

Vérifiée à chaque pull request par `backend/tests/rbac.test.js` : chaque route est appelée par les cinq rôles et sans session.
✅ = la route répond ; ⛔ = 403 (refus journalisé `ACCES_REFUSE`). Sans session : 401 partout.

| Route | Patient | Praticien | Agent admin. | Admin portail | Direction |
|---|:-:|:-:|:-:|:-:|:-:|
| `GET /api/patients/moi` | ✅ | ⛔ | ⛔ | ⛔ | ⛔ |
| `GET /api/patients/moi/rendez-vous` | ✅ | ⛔ | ⛔ | ⛔ | ⛔ |
| `GET /api/patients/moi/documents` | ✅ | ⛔ | ⛔ | ⛔ | ⛔ |
| `GET /api/patients/moi/acces` | ✅ | ⛔ | ⛔ | ⛔ | ⛔ |
| `GET /api/patients/moi/demandes` | ✅ | ⛔ | ⛔ | ⛔ | ⛔ |
| `GET /api/praticiens/filtres` | ✅ | ⛔ | ⛔ | ⛔ | ⛔ |
| `GET /api/praticiens` | ✅ | ⛔ | ⛔ | ⛔ | ⛔ |
| `GET /api/creneaux` | ✅ | ⛔ | ⛔ | ⛔ | ⛔ |
| `GET /api/disponibilites` | ⛔ | ✅ | ⛔ | ⛔ | ⛔ |
| `GET /api/disponibilites/absences` | ⛔ | ✅ | ⛔ | ⛔ | ⛔ |
| `GET /api/praticien/patients` | ⛔ | ✅ | ⛔ | ⛔ | ⛔ |
| `GET /api/praticien/agenda` | ⛔ | ✅ | ⛔ | ⛔ | ⛔ |
| `GET /api/praticien/alertes` | ⛔ | ✅ | ⛔ | ⛔ | ⛔ |
| `GET /api/accueil/contexte` | ⛔ | ⛔ | ✅ | ⛔ | ⛔ |
| `GET /api/accueil/patients?q=ben` | ⛔ | ⛔ | ✅ | ⛔ | ⛔ |
| `GET /api/comptes/recherche` | ⛔ | ⛔ | ✅ | ✅ | ⛔ |
| `GET /api/comptes/cliniques` | ⛔ | ⛔ | ✅ | ✅ | ⛔ |
| `GET /api/admin/roles` | ⛔ | ⛔ | ⛔ | ✅ | ⛔ |
| `GET /api/admin/audit` | ⛔ | ⛔ | ⛔ | ✅ | ⛔ |
| `GET /api/admin/audit/alertes` | ⛔ | ⛔ | ⛔ | ✅ | ⛔ |
| `GET /api/admin/audit/export.csv` | ⛔ | ⛔ | ⛔ | ✅ | ⛔ |
| `GET /api/admin/demandes` | ⛔ | ⛔ | ⛔ | ✅ | ⛔ |
| `GET /api/maintenance` | ⛔ | ⛔ | ⛔ | ✅ | ⛔ |
| `GET /api/statistiques/supervision` | ⛔ | ⛔ | ✅ | ✅ | ✅ |
| `GET /api/statistiques/export.csv` | ⛔ | ⛔ | ✅ | ⛔ | ✅ |
| `GET /api/statistiques/synthese` | ⛔ | ⛔ | ⛔ | ✅ | ✅ |
| `GET /api/statistiques/appels` | ⛔ | ⛔ | ⛔ | ✅ | ✅ |

## Accès horizontaux (même rôle, dossier d'un autre)

| Scénario | Résultat attendu |
|---|---|
| Patient B lit un rendez-vous ou un document du patient A | 403 |
| Praticien sans relation de soins ouvre le dossier, l'historique ou un document du patient | 403 |
| Praticien qui suit le patient ouvre son dossier | 200, accès écrit dans le journal (US-47) |
| Agent, administrateur ou Direction lit un document médical ou un rendez-vous | 403 |

Total : 27 routes × 5 rôles + 27 appels sans session + 4 scénarios horizontaux = 166 scénarios, 100 % attendus au vert.
