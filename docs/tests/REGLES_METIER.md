# Règles métier vérifiées (tests de logique)

Fichier de tests : `backend/tests/logique.test.js` (27 scénarios, exécutés par la CI à chaque pull request).
Avant correction, 11 scénarios échouaient : ils sont marqués **corrigé**.

## A. Planning du praticien

| # | Scénario | Résultat attendu | Avant |
|---|---|---|---|
| A1 | Plage le lundi matin à Sousse | acceptée | ✅ |
| A2 | Le même lundi, le soir à Tunis | **refusée : une seule clinique par jour** | corrigé |
| A3 | Le même lundi après-midi, à Sousse | acceptée | ✅ |
| A4 | Plage qui chevauche une plage existante | refusée | ✅ |
| A5 | Tunis un autre jour de la semaine | acceptée | ✅ |
| A6 | Tunis le lundi, sur des semaines où il n'est pas à Sousse | acceptée | ✅ |
| A7 | Période qui ne contient aucun lundi | **refusée (aucun créneau ne serait créé)** | corrigé |
| A8 | Fin avant le début, plage plus courte qu'un créneau | refusées | ✅ |
| A9 | Autre praticien, même clinique, même heure | acceptée | ✅ |

## B. Réservations du patient (en ligne, report, accueil)

| # | Scénario | Résultat attendu | Avant |
|---|---|---|---|
| B1 | Deux rendez-vous à la même heure chez deux praticiens | **le second est refusé** | corrigé |
| B2 | Créneau qui chevauche en partie (10:00 et 10:15) | **refusé** | corrigé |
| B3 | Plus tard le même jour, sans chevauchement, autre praticien | accepté | ✅ |
| B4 | Second rendez-vous le même jour chez le même praticien | **refusé** | corrigé |
| B5 | Après annulation, la même heure redevient possible | accepté | ✅ |
| B6 | Deux patients, même créneau, même instant | un seul réussit | ✅ |
| B7 | Même patient, deux créneaux qui se chevauchent, même instant | **un seul réussit** | corrigé |
| B8 | Créneau passé, bloqué ou inexistant | refusé | ✅ |
| B9 | Report vers une heure où le patient a déjà un rendez-vous | **refusé, ancien rendez-vous conservé** | corrigé |
| B10 | Report le même jour chez le même praticien | accepté | ✅ |
| B11 | L'accueil donne un rendez-vous qui chevauche celui du patient | **refusé** | corrigé |

## C. Cohérence des créneaux

| # | Scénario | Résultat attendu | Avant |
|---|---|---|---|
| C1 | Annuler un rendez-vous tombant pendant une absence du praticien | **le créneau reste bloqué** | corrigé |
| C2 | Reporter un rendez-vous hors d'une absence | **l'ancien créneau reste bloqué** | corrigé |
| C3 | Supprimer l'absence | créneaux sans rendez-vous réservables | ✅ |
| C4 | Désactiver puis réactiver un praticien | **les créneaux de ses absences restent bloqués** | corrigé |
| C5 | Désactiver un compte avec des rendez-vous à venir | refusé | ✅ |
| C6 | Compte-rendu avant la consultation, ou sur un rendez-vous annulé | refusé | ✅ |
| C7 | Annuler deux fois, ou le rendez-vous d'un autre | refusé | ✅ |

## Implémentation

- `backend/src/services/agenda.js` : `conflitPatient()` (verrou sur le patient puis contrôle des chevauchements
  et de la règle « un rendez-vous par jour chez le même praticien »), utilisé par la réservation en ligne, le report
  et l'accueil ; `libererCreneau()` (un créneau libéré reste bloqué pendant une absence ou si le praticien est désactivé).
- `backend/src/routes/disponibilites.js` : une seule clinique par jour, période contenant le jour choisi,
  chevauchement calculé sur les dates réellement communes.
- `backend/src/routes/comptes.js` : la réactivation ne rouvre pas les créneaux d'une absence.

## D. Présence aux rendez-vous (`backend/tests/presences.test.js`)

Avant : un rendez-vous passé sans compte-rendu restait « planifié » pour toujours et faussait la supervision.

| # | Scénario | Résultat attendu |
|---|---|---|
| D1 | Le praticien marque le patient absent, puis corrige en présent | « manqué » puis « honoré », événement `PRESENCE_MARQUEE` |
| D2 | Présence sur un rendez-vous à venir, annulé, d'un autre praticien, ou de plus de 30 jours | refusée |
| D3 | « Absent » alors qu'un compte-rendu existe | refusé ; rédiger un compte-rendu rend « honoré » un rendez-vous « manqué » |
| D4 | Rendez-vous resté « planifié » 48 h après sa fin | passe seul à « manqué » (tâche à 03:00 et au démarrage, événement `ABSENCES_MARQUEES`) |
| D5 | Dossier du patient | boutons « Présent / Absent » sur les rendez-vous passés de moins de 30 jours |

Implémentation : `PATCH /api/praticien/rendez-vous/:id/presence` `{ present }`, `backend/src/services/presences.js`, `backend/src/server.js`.
