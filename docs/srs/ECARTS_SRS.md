# Mise à jour du SRS (US-65) — écarts entre `SRS_MedLink.pdf` et le portail livré

Le SRS initial reste la référence des besoins. Ce document liste ce qui a été précisé ou modifié pendant les six sprints.

| Exigence du SRS | Livré | Écart / précision | US |
|---|---|---|---|
| Hébergement sur un VPS en Tunisie | VM Azure France Central (crédit étudiant) | même procédure de déploiement (`deploy/DEPLOY.md`) ; migration vers un hébergeur tunisien nécessaire avant une mise en production réelle (INPDP) | 57 |
| Notifications par e-mail et SMS | e-mail réel (SMTP), SMS simulé (journal `SMS_SIMULE`) | branchement d'un fournisseur SMS = un seul fichier (`services/sms.js`) | 08, 12 |
| Rappel avant le rendez-vous | tâche toutes les 15 min, rappel 24 h avant, envoyé une seule fois | — | 12, 48 |
| Suppression des données (INPDP) | désactivation, effacement des coordonnées, sessions révoquées | les dossiers médicaux sont **conservés** (obligation de conservation) ; refus tant qu'un rendez-vous est à venir | 16 |
| Statistiques anonymisées | agrégats semaine × clinique × spécialité × origine × statut | effectifs de 1 ou 2 masqués (`<3`) | 32, 46 |
| Baisse de 40 % des appels | indicateur « part des rendez-vous pris en ligne » | hypothèse : avant le portail, 100 % des rendez-vous passaient par le standard | 51 |
| Disponibilité 6 h – 22 h | `HORAIRES_SERVICE=06:00-22:00` (heure de Tunis) | hors plage : 503 + page « fermé » ; santé, horaires et annonce de maintenance restent joignables | 49 |
| Gestion des secrets | HashiCorp Vault (AppRole) en production | `.env` en développement et en CI | 45 |
| Sauvegarde et restauration | quotidienne, chiffrée, 14 jours, test hebdomadaire | VM arrêtée la nuit : sauvegarde au démarrage si la dernière a plus de 24 h | 37 |
| Session | 15 min d'inactivité | ajout : durée maximale de 8 h | 40 |
| Rôles | Patient, Praticien, Agent administratif, Administrateur du portail, Direction | permissions modifiables par l'administrateur (US-33), 15 permissions | 33, 39 |
| Journal d'audit | journal des accès en base (ajout seul) + événements JSON | voir `docs/JOURNAL_AUDIT.md` | 35, 47 |

Exigences non fonctionnelles vérifiées : sécurité (`docs/securite/CHECKLIST_OWASP.md`, `ZAP.md`, `MATRICE_RBAC.md`),
performance < 2 s (`docs/tests/PERFORMANCES.md`), tests (`docs/tests/PLAN_DE_TESTS.md`).
