#!/usr/bin/env bash
# US-37 : installation sur la VM (une fois, avec sudo) : clé, dossier, tâches planifiées.
#   sudo deploy/sauvegarde/installer.sh deploy
set -euo pipefail
UTILISATEUR="${1:-deploy}"
RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
install -d -m 700 -o "$UTILISATEUR" /etc/medlink /var/backups/medlink
if [ ! -f /etc/medlink/sauvegarde.key ]; then
  (umask 077; openssl rand -base64 48 > /etc/medlink/sauvegarde.key)
  chown "$UTILISATEUR" /etc/medlink/sauvegarde.key
  echo "Clé créée : /etc/medlink/sauvegarde.key — COPIEZ-LA hors de la VM (sans elle, aucune restauration possible)."
fi
chmod +x "$RACINE"/deploy/sauvegarde/*.sh
cat > /etc/cron.d/medlink-sauvegarde <<CRON
# US-37 (heure de la VM) : sauvegarde chaque jour à 02:30, test de restauration le dimanche à 04:00
SHELL=/bin/bash
30 2 * * * $UTILISATEUR cd $RACINE && deploy/sauvegarde/sauvegarder.sh >/dev/null 2>&1
0 4 * * 0 $UTILISATEUR cd $RACINE && deploy/sauvegarde/tester-restauration.sh >/dev/null 2>&1
# VM arrêtée la nuit : une sauvegarde au démarrage si la dernière a plus de 24 h
@reboot $UTILISATEUR sleep 120 && cd $RACINE && [ -z "\$(find /var/backups/medlink -name 'medlink-*.dump.enc' -mtime -1)" ] && deploy/sauvegarde/sauvegarder.sh >/dev/null 2>&1
CRON
chmod 644 /etc/cron.d/medlink-sauvegarde
echo "Tâches installées : /etc/cron.d/medlink-sauvegarde"
