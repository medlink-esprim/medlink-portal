#!/usr/bin/env bash
# US-37 : restauration d'une sauvegarde.
#   restaurer.sh <medlink-….dump.enc> [base]
#     base = medlink_restauration (défaut) : copie à côté de la production, pour vérifier ;
#     base = medlink : REMPLACE la production (l'API doit être arrêtée ; confirmation demandée).
#   restaurer.sh --documents <documents-….tar.gz.enc> : remet les fichiers dans le volume de l'API.
source "$(dirname "$0")/commun.sh"

if [ "${1:-}" = --documents ]; then
  F="${2:?fichier documents-….tar.gz.enc}"
  (cd "$(dirname "$F")" && sha256sum -c --quiet "$(basename "$F").sha256") || echec "empreinte invalide : $F"
  openssl enc -d "${CHIFFRE[@]}" -in "$F" | dans api tar -C /app/stockage -xzf - || echec "restauration des documents"
  journal "OK documents restaurés depuis $(basename "$F")"; exit 0
fi

F="${1:?usage : restaurer.sh <medlink-….dump.enc> [base]}"
CIBLE="${2:-medlink_restauration}"
[[ "$CIBLE" =~ ^[a-z_]+$ ]] || echec "nom de base invalide : $CIBLE"
(cd "$(dirname "$F")" && sha256sum -c --quiet "$(basename "$F").sha256") || echec "empreinte invalide : $F"

if [ "$CIBLE" = medlink ]; then
  if [ "${CONFIRMER:-}" != oui ]; then
    read -rp "Remplacer la base de PRODUCTION par $(basename "$F") ? Tapez RESTAURER : " R
    [ "$R" = RESTAURER ] || { echo "Annulé."; exit 1; }
  fi
  dans db psql -U medlink -d postgres -v ON_ERROR_STOP=1 -qc "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'medlink' AND pid <> pg_backend_pid()" >/dev/null
  openssl enc -d "${CHIFFRE[@]}" -in "$F" | dans db pg_restore -U medlink -d medlink --clean --if-exists --no-owner --single-transaction \
    || echec "pg_restore vers medlink"
else
  dans db psql -U medlink -d postgres -v ON_ERROR_STOP=1 -q -c 'SET client_min_messages = warning' -c "DROP DATABASE IF EXISTS $CIBLE" -c "CREATE DATABASE $CIBLE" >/dev/null
  openssl enc -d "${CHIFFRE[@]}" -in "$F" | dans db pg_restore -U medlink -d "$CIBLE" --no-owner --single-transaction \
    || echec "pg_restore vers $CIBLE"
fi
journal "OK $(basename "$F") restaurée dans la base $CIBLE"
