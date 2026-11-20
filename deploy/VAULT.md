# Secrets dans HashiCorp Vault (US-45)

En production, les secrets de l'API (`JWT_SECRET`, `CHIFFREMENT_CLES`, `CHIFFREMENT_CLE_ACTIVE`,
`DATABASE_URL`, `SMTP_URL`) ne sont plus dans le fichier `.env` : l'API les lit dans Vault au démarrage.

## Fonctionnement

1. Au démarrage, `backend/src/security/vault.js` se connecte à Vault avec **AppRole**
   (`VAULT_ROLE_ID` + `secret_id` monté en secret Docker, fichier `deploy/vault/secret_id`, droits 600).
2. Il lit `secret/data/medlink` (KV v2). La politique `medlink-api` n'autorise **que** cette lecture.
3. Seules les clés autorisées sont copiées dans l'environnement, **avant** le chargement de `config.js`.
4. Le jeton Vault (durée de vie 5 min) est révoqué aussitôt : l'API ne garde aucun accès à Vault.
5. Le journal n'affiche que le **nom** des clés chargées (`SECRETS_VAULT`), jamais leur valeur.
6. Si Vault est injoignable, scellé ou si un secret manque, l'API **refuse de démarrer**.

Sans `VAULT_ADDR` (développement, tests, CI), rien ne change : les variables du `.env` sont utilisées.

## Première mise en place (VM)

```bash
cd /opt/medlink && git pull
./deploy/vault/initialiser.sh
```

Le script initialise Vault, copie les secrets du `.env`, crée le rôle de l'API et écrit
`deploy/vault/A-METTRE-EN-LIEU-SUR.txt` (clé de descellement + jeton racine) :
**copiez ces deux valeurs dans un gestionnaire de mots de passe puis supprimez le fichier**.

Retirez ensuite `JWT_SECRET` et `CHIFFREMENT_CLES` du `.env`, puis :

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.vault.yml --env-file .env up -d --build
docker compose -f docker-compose.prod.yml -f docker-compose.vault.yml logs api | grep SECRETS_VAULT
```

## Après un redémarrage de la VM

Vault redémarre **scellé** : l'API attend qu'il soit descellé.

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.vault.yml exec vault vault operator unseal
# coller la clé de descellement
docker compose -f docker-compose.prod.yml -f docker-compose.vault.yml restart api
```

## Rotation d'un secret

```bash
export VAULT_TOKEN=<jeton racine>
docker compose ... exec -e VAULT_TOKEN vault vault kv patch secret/medlink JWT_SECRET=<nouvelle valeur>
docker compose ... restart api
```

Pour la clé de chiffrement, suivez `ROTATION_CLES.md` (ajouter `2:<clé>` à `CHIFFREMENT_CLES` dans Vault,
passer `CHIFFREMENT_CLE_ACTIVE` à 2, redémarrer l'API, puis relancer le rechiffrement).
