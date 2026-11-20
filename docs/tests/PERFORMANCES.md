# Performance des pages (US-63) — objectif : chaque page en moins de 2 secondes

## Optimisations

| Optimisation | Où | Effet |
|---|---|---|
| Pages chargées à la demande (`React.lazy` + `Suspense`) | `frontend/src/App.jsx` | le premier téléchargement ne contient que la connexion ; chaque espace charge ses pages quand on les ouvre |
| React et le routeur dans un fichier séparé (`manualChunks`) | `frontend/vite.config.js` | ce fichier reste en cache d'une version à l'autre |
| Compression gzip (HTML, JS, CSS, JSON de l'API, CSV) | `frontend/nginx.conf` | ~70 % d'octets en moins sur les scripts |
| Cache d'un an des fichiers du build (nom avec empreinte), `index.html` toujours revalidé | `frontend/nginx.conf` | visites suivantes sans re-téléchargement, mise à jour immédiate après un déploiement |
| Index SQL sur les créneaux (`idx_creneaux_debut`), le journal d'accès, les rendez-vous par patient | migrations 003 à 007 | recherches de créneaux et agendas sans parcours complet |
| Pagination (journal d'audit : 100 lignes), plafonds (export : 5 000 lignes, période : 366 jours) | API | temps de réponse bornés |

## Mesurer

```bash
# depuis un PC (Node 20), VM démarrée — avec un compte patient de démonstration pour les pages connectées
node deploy/perf/mesurer.mjs https://medlink-esprit.francecentral.cloudapp.azure.com salma.benali@exemple.tn '<mot de passe>'
```

Le script charge chaque page comme un navigateur (HTML, puis scripts et styles en parallèle, puis les appels d'API
de la page), 5 fois, et retient la médiane. Code de sortie 1 si une page dépasse 2 000 ms.

Contrôle complémentaire dans Chrome : F12 > **Lighthouse** > Navigation, Desktop > *Analyze page load*
(noter *Largest Contentful Paint*), sur la connexion, le tableau de bord, « Prendre rendez-vous » et « Mon agenda ».

## Résultats (à compléter)

| Page | Script (médiane) | Lighthouse LCP | < 2 s |
|---|---|---|---|
| Connexion | | | |
| Inscription | | | |
| Tableau de bord | | | |
| Mes rendez-vous | | | |
| Prendre rendez-vous | | | |
| Mes résultats | | | |
| Mon profil | | | |
| Mon agenda (praticien) | | | |
| Supervision (agent) | | | |
