#!/usr/bin/env bash
# US-37 : réglages communs des scripts de sauvegarde (lancés depuis la racine du dépôt sur la VM).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
COMPOSE="${COMPOSE:-docker compose -f docker-compose.prod.yml}"
DEST="${SAUVEGARDE_DIR:-/var/backups/medlink}"            # dossier des copies chiffrées
CLE="${SAUVEGARDE_CLE:-/etc/medlink/sauvegarde.key}"       # clé de chiffrement (600), copiée HORS de la VM
GARDER_JOURS="${SAUVEGARDE_JOURS:-14}"                     # rétention
JOURNAL="${SAUVEGARDE_JOURNAL:-$DEST/sauvegardes.log}"
CHIFFRE=(-aes-256-cbc -pbkdf2 -iter 200000 -salt -pass "file:$CLE")

journal() { local m; m="$(date '+%Y-%m-%d %H:%M:%S') $*"; echo "$m"; mkdir -p "$DEST"; echo "$m" >> "$JOURNAL"; }
echec()   { journal "ECHEC $*"; exit 1; }
dans()    { local service="$1"; shift; $COMPOSE exec -T "$service" "$@"; }   # commande dans un conteneur
[ -r "$CLE" ] || { echo "Clé de sauvegarde introuvable : $CLE (lancer deploy/sauvegarde/installer.sh)" >&2; exit 1; }
