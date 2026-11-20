# Journal d'audit de MedLink (US-35, US-47, US-65)

MedLink tient **deux journaux complémentaires**.

## 1. Journal des accès aux dossiers médicaux (base de données)

Table `journal_acces_dossiers` — une ligne écrite **avant** l'envoi de toute donnée médicale.
Un déclencheur interdit toute modification ou suppression (« ajout seul ») ; pas de clé étrangère,
pour qu'une ligne survive à la suppression d'un compte.

| Colonne | Contenu |
|---|---|
| `date_acces` | horodatage |
| `id_utilisateur`, `role` | qui |
| `id_patient`, `id_document` | quel dossier, quel document |
| `action` | `consultation_dossier`, `consultation_document`, `telechargement_document`, `redaction_compte_rendu`, `publication_document`… |
| `adresse_ip` | d'où |

Consultation : patient → « Mon profil > Accès à mon dossier » ; administrateur → « Journal d'audit »
(filtres, pages de 100, export CSV), lui-même journalisé (`AUDIT_CONSULTE`, `AUDIT_EXPORTE`).

## 2. Journal des événements de sécurité (sortie de l'API)

Une ligne JSON par événement (`docker compose logs api`) : date, événement, utilisateur, rôle, IP, détails.
Jamais de mot de passe, de jeton, de code MFA ni de donnée médicale.

| Événement | Quand | US |
|---|---|---|
| `CONNEXION_ECHEC`, `CONNEXION_REFUSEE` | identifiants faux, compte inactif ou non vérifié | 02, 41 |
| `COMPTE_VERROUILLE` | 5 échecs consécutifs | 41 |
| `ACCES_REFUSE` | toute réponse 403 (permission, relation de soins, autre patient) | 39 |
| `ACCES_DOSSIER` | accès à un dossier ou un document (copie de la ligne du journal en base) | 47 |
| `ACCES_SUSPECT`, `ALERTE_TRAITEE` | seuil de dossiers distincts par heure dépassé ; alerte close | 36 |
| `DOCUMENT_TELECHARGE`, `DOCUMENT_ALTERE` | téléchargement ; empreinte invalide | 14 |
| `DROITS_MODIFIES` | matrice rôles / permissions changée | 33 |
| `COMPTE_MODIFIE`, `COMPTE_DESACTIVE`, `COMPTE_REACTIVE`, `AFFECTATIONS_MODIFIEES` | back-office des comptes | 28, 29 |
| `RDV_PRIS_ACCUEIL` | rendez-vous pris par un agent | 30 |
| `DEMANDE_DONNEES`, `DEMANDE_TRAITEE`, `EXPORT_TELECHARGE` | droits INPDP | 16 |
| `AUDIT_CONSULTE`, `AUDIT_EXPORTE` | consultation du journal | 35 |
| `MAINTENANCE_ANNONCEE`, `MAINTENANCE_ANNULEE` | maintenance | 38 |
| `STATS_EXPORTEES` | export anonymisé | 32 |
| `RAPPELS`, `SMS_SIMULE` | rappels automatiques | 12, 48 |
| `SECRETS_VAULT` | secrets chargés au démarrage (noms des clés seulement) | 45 |

Recherche sur la VM :

```bash
docker compose -f docker-compose.prod.yml logs api | grep -E 'ACCES_REFUSE|ACCES_SUSPECT|COMPTE_VERROUILLE'
```

Sauvegardes : `/var/backups/medlink/sauvegardes.log` (`OK` / `ECHEC`, US-37).
