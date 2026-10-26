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
