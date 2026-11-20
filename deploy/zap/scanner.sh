#!/usr/bin/env bash
# US-60 : même scan depuis un PC (Docker Desktop) ; rapports dans ./rapports-zap/
#   deploy/zap/scanner.sh https://medlink-esprit.francecentral.cloudapp.azure.com          # passif (~3 min)
#   deploy/zap/scanner.sh https://medlink-esprit.francecentral.cloudapp.azure.com complet  # actif (~20 min)
set -euo pipefail
CIBLE="${1:?URL du portail}"; MODE="${2:-passif}"
cd "$(dirname "$0")/../.."; mkdir -p rapports-zap; chmod 777 rapports-zap
SCRIPT=zap-baseline.py; [ "$MODE" = complet ] && SCRIPT=zap-full-scan.py
docker run --rm -v "$PWD/rapports-zap:/zap/wrk:rw" -v "$PWD/.zap/rules.tsv:/zap/wrk/rules.tsv:ro" \
  ghcr.io/zaproxy/zaproxy:stable "$SCRIPT" -t "$CIBLE" -c rules.tsv -a -j \
  -r "zap-$MODE.html" -J "zap-$MODE.json" -w "zap-$MODE.md" || true     # code ≠ 0 dès qu'il y a des alertes
echo "Rapports : rapports-zap/zap-$MODE.html (.json, .md)"
command -v jq >/dev/null && jq -r '.site[].alerts[] | "\(.riskdesc)\t\(.alert)"' "rapports-zap/zap-$MODE.json" | sort | uniq -c
