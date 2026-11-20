# Sauvegardes et restauration (US-37)

| Quoi | Comment | Quand |
|---|---|---|
| Base PostgreSQL | `pg_dump -Fc`, chiffré AES-256 (OpenSSL, PBKDF2 200 000 itérations) | chaque jour à 02:30, et au démarrage de la VM si la dernière copie a plus de 24 h |
| Documents médicaux | archive du volume `documents` (fichiers déjà chiffrés par l'API), chiffrée à nouveau | avec la base |
| Contrôle | empreinte SHA-256 de chaque copie, vérifiée avant toute restauration | à chaque restauration |
| Test de restauration | la dernière copie est restaurée dans une base temporaire, tables comptées et comparées à la production | chaque dimanche à 04:00 |
| Rétention | 14 jours (`SAUVEGARDE_JOURS`) | à chaque sauvegarde |

Copies : `/var/backups/medlink` (700). Clé : `/etc/medlink/sauvegarde.key` (600).
Journal : `/var/backups/medlink/sauvegardes.log` (lignes `OK …` / `ECHEC …`).

> **La clé doit être copiée hors de la VM** (gestionnaire de mots de passe de l'équipe).
> Sans elle, aucune sauvegarde ne peut être relue ; avec elle seule, sans les copies, rien n'est exposé.

## Installation (une fois, sur la VM)

```bash
cd /opt/medlink && git pull
sudo deploy/sauvegarde/installer.sh deploy      # clé, dossiers, /etc/cron.d/medlink-sauvegarde
sudo cat /etc/medlink/sauvegarde.key             # à copier dans le gestionnaire de mots de passe
deploy/sauvegarde/sauvegarder.sh                 # première sauvegarde
deploy/sauvegarde/tester-restauration.sh         # premier test : tableau sauvegarde / production
```

Avec Vault (US-45), ajouter le fichier compose : `export COMPOSE="docker compose -f docker-compose.prod.yml -f docker-compose.vault.yml"`.

## Restaurer

```bash
# vérifier une copie à côté de la production (base medlink_restauration)
deploy/sauvegarde/restaurer.sh /var/backups/medlink/medlink-20261201-0230.dump.enc

# incident : remplacer la production (demande de taper RESTAURER)
docker compose -f docker-compose.prod.yml stop api
deploy/sauvegarde/restaurer.sh /var/backups/medlink/medlink-20261201-0230.dump.enc medlink
deploy/sauvegarde/restaurer.sh --documents /var/backups/medlink/documents-20261201-0230.tar.gz.enc
docker compose -f docker-compose.prod.yml start api
```

## Copie hors de la VM

Depuis un PC de l'équipe (les copies restent chiffrées) :

```bash
scp 'deploy@medlink-esprit.francecentral.cloudapp.azure.com:/var/backups/medlink/*' ./sauvegardes-medlink/
```

## Objectifs

- RPO (données perdues au pire) : 24 h. RTO (remise en service) : moins de 30 minutes (restauration mesurée : quelques secondes pour la base de démonstration).
