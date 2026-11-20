#!/usr/bin/env bash
# US-45 : première mise en place de Vault (à lancer une seule fois sur la VM, depuis la racine du dépôt).
#   1. initialise et descelle Vault (1 clé de descellement : à garder hors de la VM) ;
#   2. active KV v2 (secret/) et AppRole, crée la politique medlink-api ;
#   3. copie les secrets de .env dans secret/medlink ;
#   4. crée le rôle de l'API : VAULT_ROLE_ID ajouté au .env, secret_id dans deploy/vault/secret_id (600).
set -euo pipefail
cd "$(dirname "$0")/../.."
COMPOSE="docker compose -f docker-compose.prod.yml -f docker-compose.vault.yml --env-file .env"
v() { $COMPOSE exec -T -e VAULT_TOKEN="${VAULT_TOKEN:-}" vault vault "$@"; }

[ -f .env ] || { echo ".env introuvable"; exit 1; }
$COMPOSE up -d vault
sleep 3

ETAT=$(v status -format=json 2>/dev/null || true)     # code 2 quand Vault est scellé
if echo "$ETAT" | grep -q '"initialized": false'; then
  INIT=$(v operator init -key-shares=1 -key-threshold=1 -format=json)
  CLE=$(echo "$INIT" | python3 -c 'import json,sys; print(json.load(sys.stdin)["unseal_keys_b64"][0])')
  VAULT_TOKEN=$(echo "$INIT" | python3 -c 'import json,sys; print(json.load(sys.stdin)["root_token"])')
  umask 077
  printf 'Clé de descellement : %s\nJeton racine : %s\n' "$CLE" "$VAULT_TOKEN" > deploy/vault/A-METTRE-EN-LIEU-SUR.txt
  echo "→ Clé de descellement et jeton racine écrits dans deploy/vault/A-METTRE-EN-LIEU-SUR.txt"
  echo "  Copiez-les dans un gestionnaire de mots de passe puis SUPPRIMEZ ce fichier de la VM."
  v operator unseal "$CLE" >/dev/null
else
  if echo "$ETAT" | grep -q '"sealed": true'; then
    read -rsp "Vault scellé. Clé de descellement : " CLE; echo
    v operator unseal "$CLE" >/dev/null
  fi
  read -rsp "Vault déjà initialisé. Jeton racine : " VAULT_TOKEN; echo
fi
export VAULT_TOKEN

v secrets enable -path=secret kv-v2 2>/dev/null || true
v auth enable approle 2>/dev/null || true
v policy write medlink-api /vault/policies/medlink-api.hcl
v write auth/approle/role/medlink-api token_policies=medlink-api token_ttl=5m token_max_ttl=10m secret_id_ttl=0 >/dev/null

# secrets de l'API (lus dans .env, jamais affichés)
ARGS=()
for K in DATABASE_URL JWT_SECRET CHIFFREMENT_CLES CHIFFREMENT_CLE_ACTIVE SMTP_URL; do
  VAL=$(grep -E "^$K=" .env | head -1 | cut -d= -f2- || true)
  [ -n "$VAL" ] && ARGS+=("$K=$VAL")
done
v kv put secret/medlink "${ARGS[@]}" >/dev/null
echo "→ ${#ARGS[@]} secrets copiés dans secret/medlink"

ROLE_ID=$(v read -field=role_id auth/approle/role/medlink-api/role-id)
umask 077
v write -f -field=secret_id auth/approle/role/medlink-api/secret-id > deploy/vault/secret_id
grep -q '^VAULT_ROLE_ID=' .env && sed -i "s/^VAULT_ROLE_ID=.*/VAULT_ROLE_ID=$ROLE_ID/" .env || echo "VAULT_ROLE_ID=$ROLE_ID" >> .env
echo "→ Rôle AppRole medlink-api prêt (VAULT_ROLE_ID dans .env, secret_id dans deploy/vault/secret_id)"
echo
echo "Étape suivante : retirer JWT_SECRET et CHIFFREMENT_CLES du .env (ils sont dans Vault), puis :"
echo "  $COMPOSE up -d --build api"
echo "  $COMPOSE logs api | grep SECRETS_VAULT"
