#!/usr/bin/env bash
# US-37 : test de restauration (hebdomadaire) : la dernière sauvegarde est restaurée dans une base
# temporaire, ses tables sont comptées et comparées à la production, puis la base temporaire est supprimée.
source "$(dirname "$0")/commun.sh"
F="$(ls -1t "$DEST"/medlink-*.dump.enc 2>/dev/null | head -1)"
[ -n "$F" ] || echec "aucune sauvegarde dans $DEST"
"$(dirname "$0")/restaurer.sh" "$F" medlink_restauration >/dev/null

compter() {   # $1 = base -> lignes "table nombre"
  dans db psql -U medlink -d "$1" -tAF' ' -v ON_ERROR_STOP=1 -c \
    "SELECT t, (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM %I', t), false, true, '')))[1]::text::int
       FROM unnest(ARRAY['utilisateurs','patients','praticiens','cliniques','rendez_vous','documents_medicaux','comptes_rendus','journal_acces_dossiers']) t"
}
RESTAUREE="$(compter medlink_restauration)"
PROD="$(compter medlink)"
dans db psql -U medlink -d postgres -qc "DROP DATABASE medlink_restauration" >/dev/null
echo "table                     sauvegarde  production"
paste -d' ' <(echo "$RESTAUREE") <(echo "$PROD" | cut -d' ' -f2) | awk '{ printf "%-25s %10s %11s\n", $1, $2, $3 }'
echo "$RESTAUREE" | awk '$1=="cliniques" && $2>0 {ok=1} END {exit !ok}' || echec "test de restauration : base restaurée vide ($(basename "$F"))"
journal "OK test de restauration de $(basename "$F") : $(echo "$RESTAUREE" | tr '\n' ' ')"
