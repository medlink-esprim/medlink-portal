#!/usr/bin/env bash
# US-37 : sauvegarde quotidienne chiffrée de la base et des documents médicaux.
#   medlink-<date>.dump.enc        pg_dump (format custom) chiffré AES-256 (clé = fichier $CLE)
#   documents-<date>.tar.gz.enc    volume des documents (déjà chiffrés par l'API), chiffré à nouveau
#   <fichier>.sha256               empreinte de contrôle de chaque copie
# Les copies de plus de $GARDER_JOURS jours sont supprimées. Code de sortie ≠ 0 en cas d'échec.
source "$(dirname "$0")/commun.sh"
umask 077
mkdir -p "$DEST"
DATE="$(date +%Y%m%d-%H%M)"
BASE="$DEST/medlink-$DATE.dump.enc"
DOCS="$DEST/documents-$DATE.tar.gz.enc"

dans db pg_dump -U medlink -d medlink -Fc | openssl enc "${CHIFFRE[@]}" -out "$BASE.tmp" || echec "pg_dump"
[ -s "$BASE.tmp" ] || echec "sauvegarde de la base vide"
mv "$BASE.tmp" "$BASE"
if [ "${SAUVEGARDE_DOCUMENTS:-oui}" = oui ]; then
  dans api tar -C /app/stockage -czf - . | openssl enc "${CHIFFRE[@]}" -out "$DOCS.tmp" || echec "documents"
  mv "$DOCS.tmp" "$DOCS"
fi
for f in "$BASE" "$DOCS"; do [ -f "$f" ] && (cd "$DEST" && sha256sum "$(basename "$f")" > "$(basename "$f").sha256"); done

find "$DEST" -maxdepth 1 -name '*.enc*' -mtime +"$GARDER_JOURS" -delete
journal "OK sauvegarde $(basename "$BASE") ($(du -h "$BASE" | cut -f1))$( [ -f "$DOCS" ] && echo " + $(basename "$DOCS")")"
