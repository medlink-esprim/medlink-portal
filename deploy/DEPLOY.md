# Déploiement MedLink sur le VPS (US-57)

## 1. Première installation (une seule fois)
```bash
sudo mkdir -p /opt/medlink && sudo chown deploy:deploy /opt/medlink
git clone https://github.com/medlink-esprim/medlink-portal.git /opt/medlink
cd /opt/medlink
cp .env.example .env && nano .env      # nouveaux secrets, APP_URL=https://<domaine>
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
```

## 2. Créer le premier agent administratif
```bash
docker compose -f docker-compose.prod.yml exec api node scripts/create-agent.js \
  --email agent@medlink.tn --nom Jaziri --prenom Nour --ville Sousse
```
Ouvrir le lien d'activation affiché et choisir le mot de passe.

## 3. Mettre à jour après une fusion sur main
```bash
cd /opt/medlink && git pull
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
```

## 4. Vérifications
```bash
sudo ss -tlnp            # seuls 22, 80, 443 ouverts publiquement ; 8080/8025 sur 127.0.0.1
curl -I https://<domaine>/api/health
```

## 5. Voir les e-mails de démonstration (Mailpit)
Depuis son PC : `ssh -L 8025:localhost:8025 deploy@<IP_VPS>` puis http://localhost:8025

## 6. Appliquer une nouvelle migration SQL (ex. Sprint 2)
Les fichiers de `db/migrations` ne sont exécutés automatiquement que sur une base **vide**.
Sur une base existante, appliquer le nouveau fichier une seule fois, après le `git pull` :
```bash
cd /opt/medlink && git pull
docker compose -f docker-compose.prod.yml exec -T db \
  psql -U medlink -d medlink -v ON_ERROR_STOP=1 < db/migrations/003_sprint2.sql
docker compose -f docker-compose.prod.yml exec db psql -U medlink -d medlink -c "\dt"   # 12 tables
```
Sur un PC de développement, on peut aussi repartir d'une base vide : `docker compose down -v` puis `docker compose up --build`.

## 7. HTTPS : TLS 1.2 minimum, TLS 1.3 privilégié, HSTS (US-44)
Installer la configuration (VM : `nginx-medlink-vm.conf` ; VPS avec domaine : `nginx-medlink.conf`) :
```bash
cd /opt/medlink && git pull
sudo cp deploy/nginx-medlink-vm.conf /etc/nginx/sites-available/medlink
sudo nginx -t && sudo systemctl reload nginx
docker compose -f docker-compose.prod.yml --env-file .env up -d --build web   # en-têtes de sécurité des pages
```
Vérifier (TA-2.5), depuis la VM :
```bash
curl -sI -H 'Host: medlink.local' http://127.0.0.1 | head -3                     # 301 vers https://
curl -skI --resolve medlink.local:443:127.0.0.1 https://medlink.local | grep -i strict-transport
for v in tls1 tls1_1 tls1_2 tls1_3; do
  printf '%-7s : ' $v
  echo | openssl s_client -connect 127.0.0.1:443 -servername medlink.local -$v -cipher 'DEFAULT:@SECLEVEL=0' 2>/dev/null \
    | grep -m1 'Cipher is'
done
# attendu : tls1 et tls1_1 -> « New, (NONE), Cipher is (NONE) » (refusés)
#           tls1_2 -> « New, TLSv1.2, Cipher is ECDHE-… »   tls1_3 -> « New, TLSv1.3, Cipher is TLS_AES_… »
```
