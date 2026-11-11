# Rotation de la clé de chiffrement (US-43)

Les champs médicaux (motif des rendez-vous) et les secrets MFA sont chiffrés en AES-256-GCM.
Chaque valeur commence par le **numéro de version** de la clé qui l'a chiffrée : plusieurs clés
peuvent coexister, ce qui permet de changer de clé sans interruption.

Au Sprint 2, les clés sont lues dans le fichier `.env` (jamais commité, `chmod 600`) ;
au Sprint 4 elles seront déplacées dans HashiCorp Vault.

## Quand changer de clé
- une fois par an ;
- immédiatement si la clé a pu être exposée (fuite du `.env`, départ d'un administrateur, poste compromis).

## Procédure
1. Générer la nouvelle clé : `openssl rand -base64 32`
2. Dans `.env`, **ajouter** la clé sans retirer l'ancienne, puis l'activer :
   ```
   CHIFFREMENT_CLES=1:<ancienne clé>,2:<nouvelle clé>
   CHIFFREMENT_CLE_ACTIVE=2
   ```
3. Redémarrer l'API : les nouvelles valeurs sont chiffrées avec la clé 2, les anciennes restent lisibles.
   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env up -d api
   ```
4. Rechiffrer les anciennes valeurs avec la clé 2 :
   ```bash
   docker compose -f docker-compose.prod.yml exec api node scripts/rotation-cles.js
   ```
5. Vérifier qu'il ne reste aucune valeur en version 1 (résultat attendu : 0 et 0) :
   ```bash
   docker compose -f docker-compose.prod.yml exec db psql -U medlink -d medlink -c \
     "SELECT (SELECT count(*) FROM rendez_vous WHERE get_byte(motif_chiffre,0)=1),
             (SELECT count(*) FROM utilisateurs WHERE get_byte(mfa_secret_chiffre,0)=1);"
   ```
6. Retirer l'ancienne clé de `.env` (`CHIFFREMENT_CLES=2:<nouvelle clé>`), redémarrer l'API,
   puis détruire toute copie de l'ancienne clé.

Les fichiers des documents médicaux (volume « documents », US-13) ne sont pas rechiffrés par le
script : ils restent lisibles tant que l'ancienne clé est présente dans `CHIFFREMENT_CLES`. Ne retirez
donc l'ancienne clé (étape 6) qu'après avoir republié ces documents, ou gardez-la.

Les sauvegardes faites avant la rotation restent chiffrées avec l'ancienne clé : la conserver
hors ligne tant que ces sauvegardes existent.
