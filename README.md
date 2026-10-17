# MedLink — Portail web sécurisé

Projet Labs Cyber Security & Coding — ESPRIM 5CC1.
Équipe : Jasser Fattouhi (Scrum Master), Iheb Ben Massoud, Akram Mejebri.
Product Owner : M. Mounir Abida.

## Structure

| Dossier | Contenu |
|---|---|
| `frontend/` | Application React (Vite) |
| `backend/` | API Node.js / Express |
| `db/migrations/` | Scripts SQL numérotés |
| `docs/` | SRS et diagrammes UML |
| `deploy/` | Configuration serveur et procédure de déploiement |

## Règles de travail

1. On ne pousse **jamais** directement sur `main`.
2. Une branche par user story, créée depuis `main` à jour :
   `git switch main && git pull && git switch -c feature/US-01-inscription`
3. Préfixes de branche : `feature/` (fonctionnalité), `fix/` (correction), `chore/` (outillage, docs).
4. Messages de commit : `type(US-xx): description courte`
   - `feat(US-01): endpoint d'inscription`
   - `fix(US-02): message d'erreur générique`
   - `docs(US-53): ajout du SRS`
5. Pull request vers `main` avec `Closes #<numéro d'issue>` dans la description.
6. Au moins **une relecture** par un autre membre avant fusion.
   Tout ce qui touche à l'authentification, aux jetons ou au SQL est relu par Jasser.
7. Fusion en **Squash and merge** ; la branche est supprimée automatiquement.

## Sécurité

- Aucun secret dans le dépôt : `.env` est ignoré, seul `.env.example` est versionné.
- Ne jamais journaliser un mot de passe ou un jeton.
