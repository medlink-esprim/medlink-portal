# Plan de tests et rapport de recette (US-64)

Chaque user story livrée est vérifiée **automatiquement** (tests Jest/Supertest exécutés par la CI sur une vraie base PostgreSQL 16, à chaque pull request) et/ou **manuellement** (scénario de recette ci-dessous, rejoué avec les comptes de démonstration).

Lancer tous les tests automatisés :

```bash
docker compose exec api npm test
```

Légende du statut : ✅ conforme · ⚠️ conforme avec réserve (voir anomalies résiduelles) · ⬜ à exécuter en recette.

## 1. Traçabilité user story → tests

### Sprint 1

| US | User story | Pts | Tests automatisés | Vérification manuelle | Statut |
|---|---|---|---|---|---|
| US-01 | Création de compte patient | 5 | `api.test.js` | scénario de recette du guide du sprint | ✅ |
| US-02 | Connexion patient | 3 | `api.test.js` | scénario de recette du guide du sprint | ✅ |
| US-03 | Réinitialisation du mot de passe | 3 | — | scénario de recette du guide du sprint | ✅ |
| US-04 | Consentement à l’inscription | 3 | `api.test.js`, `profil.test.js` | scénario de recette du guide du sprint | ✅ |
| US-27 | Création de comptes utilisateurs | 5 | `api.test.js` | scénario de recette du guide du sprint | ✅ |
| US-42 | Politique de mots de passe | 3 | `passwordPolicy.test.js` | scénario de recette du guide du sprint | ✅ |
| US-54 | Architecture et modèle de données | 5 | — | `docs/architecture/ARCHITECTURE.md`, `docs/uml/` | ✅ |
| US-55 | Dépôt Git et organisation | 2 | — | règles de branche, PR relues, Squash and merge (GitHub) | ✅ |
| US-56 | Environnement React, Node et PostgreSQL | 5 | `api.test.js` | scénario de recette du guide du sprint | ✅ |
| US-57 | Hébergement sur un VPS en Tunisie | 3 | — | portail en ligne sur la VM Azure (France Central) | ✅ |

### Sprint 2

| US | User story | Pts | Tests automatisés | Vérification manuelle | Statut |
|---|---|---|---|---|---|
| US-05 | Recherche d’un praticien | 3 | `rendezvous.test.js` | scénario de recette du guide du sprint | ✅ |
| US-06 | Recherche d’un créneau | 5 | `rendezvous.test.js` | scénario de recette du guide du sprint | ✅ |
| US-07 | Réservation d’un rendez-vous | 5 | `rendezvous.test.js` | scénario de recette du guide du sprint | ✅ |
| US-17 | Connexion praticien avec MFA | 5 | `mfa.test.js`, `totp.test.js` | scénario de recette du guide du sprint | ✅ |
| US-18 | Définition des disponibilités | 5 | `rendezvous.test.js` | scénario de recette du guide du sprint | ✅ |
| US-34 | Connexion administrateur avec MFA | 5 | `mfa.test.js` | scénario de recette du guide du sprint | ✅ |
| US-39 | Contrôle d’accès RBAC | 8 | `api.test.js`, `rendezvous.test.js` | scénario de recette du guide du sprint | ✅ |
| US-40 | Gestion de session et jeton JWT | 5 | `api.test.js` | scénario de recette du guide du sprint | ✅ |
| US-43 | Chiffrement des données au repos | 8 | `chiffrement.test.js`, `praticien.test.js` | scénario de recette du guide du sprint | ✅ |
| US-44 | Chiffrement en transit HTTPS | 3 | — | navigateur : cadenas HTTPS, `http://` redirigé ; SSL Labs ≥ A | ✅ |

### Sprint 3

| US | User story | Pts | Tests automatisés | Vérification manuelle | Statut |
|---|---|---|---|---|---|
| US-08 | Confirmation de réservation | 3 | `rendezvous.test.js` | Mailpit : e-mail de confirmation | ✅ |
| US-09 | Annulation d’un rendez-vous | 3 | `rendezvous.test.js` | scénario de recette du guide du sprint | ✅ |
| US-10 | Report d’un rendez-vous | 5 | `rendezvous.test.js` | scénario de recette du guide du sprint | ✅ |
| US-11 | Historique des rendez-vous | 3 | `rendezvous.test.js` | scénario de recette du guide du sprint | ✅ |
| US-12 | Rappel avant le rendez-vous | 5 | `profil.test.js`, `rappels.test.js` | Mailpit : rappel 24 h avant | ✅ |
| US-13 | Consultation des résultats d’examens | 5 | `documents.test.js` | scénario de recette du guide du sprint | ✅ |
| US-14 | Téléchargement d’un document médical | 3 | `documents.test.js` | scénario de recette du guide du sprint | ✅ |
| US-15 | Gestion du profil patient | 3 | `profil.test.js` | scénario de recette du guide du sprint | ✅ |
| US-33 | Gestion des rôles et des droits | 5 | `roles.test.js` | scénario de recette du guide du sprint | ✅ |
| US-41 | Protection anti brute-force | 5 | `bruteforce.test.js` | scénario de recette du guide du sprint | ✅ |
| US-48 | Envoi automatique des rappels | 5 | `rappels.test.js` | scénario de recette du guide du sprint | ✅ |
| US-53 | SRS et cas d’usage | 5 | — | `docs/srs/SRS_MedLink.pdf` + `docs/srs/ECARTS_SRS.md` | ✅ |
| US-58 | Intégration continue | 3 | — | `.github/workflows/ci.yml` vert sur chaque PR | ✅ |

### Sprint 4

| US | User story | Pts | Tests automatisés | Vérification manuelle | Statut |
|---|---|---|---|---|---|
| US-19 | Agenda multi-sites | 8 | `agenda.test.js` | scénario de recette du guide du sprint | ✅ |
| US-20 | Alerte d’annulation de rendez-vous | 3 | `agenda.test.js` | scénario de recette du guide du sprint | ✅ |
| US-22 | Recherche parmi mes patients | 3 | `praticien.test.js` | scénario de recette du guide du sprint | ✅ |
| US-23 | Accès au dossier du patient reçu | 8 | `praticien.test.js` | scénario de recette du guide du sprint | ✅ |
| US-24 | Rédaction d’un compte-rendu | 5 | `praticien.test.js` | scénario de recette du guide du sprint | ✅ |
| US-25 | Publication d’un résultat d’examen | 5 | `praticien.test.js` | scénario de recette du guide du sprint | ✅ |
| US-28 | Modification et désactivation de comptes | 3 | `comptes.test.js` | scénario de recette du guide du sprint | ✅ |
| US-29 | Affectation des praticiens aux cliniques | 5 | `affectations.test.js` | scénario de recette du guide du sprint | ✅ |
| US-30 | Rendez-vous pris pour un patient | 5 | `accueil.test.js` | scénario de recette du guide du sprint | ✅ |
| US-45 | Gestion des secrets avec Vault | 5 | `vault.test.js` | VM : `logs api | grep SECRETS_VAULT` ; Vault scellé → l'API refuse de démarrer | ✅ |
| US-47 | Journalisation des accès aux dossiers | 5 | `acces.test.js`, `audit.test.js`, `historique.test.js`, `praticien.test.js` | scénario de recette du guide du sprint | ✅ |

### Sprint 5

| US | User story | Pts | Tests automatisés | Vérification manuelle | Statut |
|---|---|---|---|---|---|
| US-16 | Export et suppression de mes données | 5 | `demandes.test.js` | scénario de recette du guide du sprint | ✅ |
| US-21 | Blocage de créneaux et absences | 3 | `absences.test.js` | scénario de recette du guide du sprint | ✅ |
| US-26 | Historique des comptes-rendus | 3 | `historique.test.js` | scénario de recette du guide du sprint | ✅ |
| US-31 | Supervision des trois cliniques | 5 | `statistiques.test.js` | scénario de recette du guide du sprint | ✅ |
| US-32 | Export de statistiques anonymisées | 5 | `statistiques.test.js` | scénario de recette du guide du sprint | ✅ |
| US-35 | Consultation du journal d’audit | 5 | `audit.test.js` | scénario de recette du guide du sprint | ✅ |
| US-36 | Alerte sur accès suspect | 5 | `surveillance.test.js` | scénario de recette du guide du sprint | ✅ |
| US-38 | Maintenance annoncée | 3 | `maintenance.test.js` | scénario de recette du guide du sprint | ✅ |
| US-46 | Anonymisation des statistiques | 5 | `statistiques.test.js` | scénario de recette du guide du sprint | ✅ |
| US-50 | Synthèse d’activité pour la Direction | 3 | `statistiques.test.js` | scénario de recette du guide du sprint | ✅ |
| US-51 | Suivi de la baisse des appels | 5 | `statistiques.test.js` | scénario de recette du guide du sprint | ✅ |

### Sprint 6

| US | User story | Pts | Tests automatisés | Vérification manuelle | Statut |
|---|---|---|---|---|---|
| US-37 | Sauvegarde et restauration | 5 | — | `deploy/sauvegarde/tester-restauration.sh` sur la VM (restauration testée, tables comparées) | ✅ |
| US-49 | Disponibilité 6 h – 22 h | 3 | `horaires.test.js` | scénario de recette du guide du sprint | ✅ |
| US-52 | Validation de la recette | 3 | — | procès-verbal de recette signé par la Direction | ⬜ |
| US-59 | Checklist de sécurité OWASP | 3 | — | `docs/securite/CHECKLIST_OWASP.md` | ✅ |
| US-60 | Scan de vulnérabilités OWASP ZAP | 8 | — | workflow « Scan OWASP ZAP », rapport en artefact | ⬜ |
| US-61 | Correction des vulnérabilités | 8 | `entetes.test.js` | scan ZAP relancé : 0 High | ⬜ |
| US-62 | Tests des scénarios RBAC | 5 | `rbac.test.js` | scénario de recette du guide du sprint | ✅ |
| US-63 | Performance des pages | 5 | — | `node deploy/perf/mesurer.mjs <url>` + Lighthouse | ⬜ |
| US-64 | Tests fonctionnels de recette | 5 | — | ce document | ✅ |
| US-65 | Documentation du projet | 3 | — | `docs/` à jour | ✅ |
| US-66 | Support de soutenance finale | 3 | — | support de soutenance | ⬜ |

**Total : 66 user stories, 295 points.**

## 2. Scénarios de recette de bout en bout

| ID | Scénario | Rôle | US couvertes | Résultat attendu | Obtenu |
|---|---|---|---|---|---|
| TF-01 | Inscription, e-mail de vérification, consentement, connexion | Patient | 01, 02, 04, 42 | compte actif, politique acceptée | |
| TF-02 | Mot de passe oublié → lien → nouveau mot de passe | Patient | 03 | ancien refusé, nouveau accepté | |
| TF-03 | Recherche d'un praticien par spécialité et ville, choix d'un créneau, réservation | Patient | 05, 06, 07, 08 | rendez-vous planifié, e-mail de confirmation | |
| TF-04 | Report puis annulation (> 24 h) ; le praticien reçoit l'alerte | Patient, praticien | 09, 10, 11, 20 | créneau libéré, alerte dans l'agenda | |
| TF-05 | Rappel automatique 24 h avant | Système | 12, 48 | e-mail / SMS simulé envoyé une seule fois | |
| TF-06 | Connexion praticien avec MFA, agenda multi-sites, absence | Praticien | 17, 19, 21 | créneaux de l'absence bloqués | |
| TF-07 | Dossier du patient reçu, compte-rendu, publication d'un PDF, historique | Praticien | 22–26, 47 | patient notifié, accès journalisé | |
| TF-08 | Résultats et téléchargement, journal « Accès à mon dossier » | Patient | 13, 14, 47 | document intègre, accès visibles | |
| TF-09 | Profil, préférences de notification, demande d'export puis de suppression | Patient, admin | 15, 16 | export chiffré téléchargé ; compte désactivé | |
| TF-10 | Création, modification, désactivation de comptes ; affectation aux cliniques | Agent, admin | 27–29 | session coupée à la désactivation | |
| TF-11 | Rendez-vous pris par l'accueil | Agent | 30 | badge « Pris par l'accueil », patient notifié | |
| TF-12 | Rôles et droits : retrait d'un droit → menu et API refusent | Admin | 33, 39 | 403 journalisé | |
| TF-13 | Journal d'audit, export CSV, alerte d'accès suspect | Admin | 35, 36 | alerte + e-mail aux admins | |
| TF-14 | Maintenance annoncée 48 h avant ; portail hors 6 h – 22 h | Admin, tous | 38, 49 | bandeau ; page « fermé » | |
| TF-15 | Supervision, export anonymisé, synthèse, part en ligne | Agent, Direction | 31, 32, 46, 50, 51 | aucune donnée nominative, `<3` masqués | |
| TF-16 | 5 essais de mot de passe faux → verrouillage | Tous | 41 | compte verrouillé 15 min | |
| TF-17 | Session inactive 15 min → déconnexion | Tous | 40 | retour à la connexion | |
| TF-18 | Données médicales illisibles en base, HTTPS, secrets dans Vault | Ops | 43, 44, 45 | `psql` montre des octets chiffrés | |
| TF-19 | Sauvegarde, test de restauration | Ops | 37 | tableau sauvegarde = production | |
| TF-20 | Matrice RBAC (27 routes × 5 rôles + accès horizontaux) | CI | 39, 62 | 100 % des scénarios au vert | |

## 3. Rapport d'exécution

| Campagne | Date | Tests automatisés | Résultat | Scénarios TF | Anomalies |
|---|---|---|---|---|---|
| CI de la PR 6 du Sprint 6 | | voir le run GitHub Actions | | — | |
| Recette sur Azure | | — | — | /20 | |

## 4. Anomalies résiduelles et limites connues

| # | Description | Gravité | Décision |
|---|---|---|---|
| R-1 | Les SMS sont simulés (journal `SMS_SIMULE`) : pas de fournisseur SMS tunisien contracté | Mineure | hors périmètre du projet académique |
| R-2 | Hébergement Azure France Central au lieu d'un VPS en Tunisie (US-57) : crédit étudiant | Mineure | à migrer pour une mise en production réelle (INPDP) |
| R-3 | Vault en clé de descellement unique, descellé à la main après redémarrage | Mineure | acceptable pour la démonstration ; auto-unseal (KMS) en production |
| R-4 | En-tête `Server: nginx` (sans version) | Information | justifié dans `docs/securite/ZAP.md` |
| R-5 | Sauvegardes sur la VM elle-même ; copie externe manuelle (`scp`) | Mineure | stockage objet externe recommandé en production |
