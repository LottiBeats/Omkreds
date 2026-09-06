#!/bin/bash
# Run every time you want to push an update to the server
# Usage (as root): bash /opt/structuralcalc/app/deploy/deploy.sh
set -euo pipefail

APP_DIR=/opt/structuralcalc
APP_USER=structcalc

echo "==> Pulling latest code..."
cd "$APP_DIR/app"
git pull

echo "==> Updating Python dependencies..."
sudo -u "$APP_USER" "$APP_DIR/venv/bin/pip" install -r backend/requirements.txt

echo "==> Rebuilding React frontend..."
cd "$APP_DIR/app/frontend"
npm ci

# Rollup fejler af og til her med "handleInvalidResolvedId" paa et modul, den
# bygger fint et oejeblik senere. Aarsagen er ikke fundet -- den kan ikke
# fremprovokeres, og et npm ci + npm run build i haanden lige efter lykkes
# hver gang. Indtil den er forstaaet, er et enkelt gentagelsesforsoeg bedre
# end et roedt deploy paa noget, der ikke fejler.
#
# Andet forsoeg rydder node_modules helt, saa de to forsoeg ikke er ens.
if ! npm run build; then
    echo "==> Byg fejlede. Rydder node_modules og proever en gang til." >&2
    rm -rf node_modules
    npm ci
    npm run build          # fejler den her igen, stopper deployet (set -e)
    echo "==> Andet forsoeg lykkedes. Sig det hoejt: fejlen er stadig ikke forstaaet." >&2
fi

chown -R "$APP_USER:$APP_USER" dist

echo "==> Restarting backend..."
systemctl restart structuralcalc
systemctl status structuralcalc --no-pager

# Nginx is deliberately NOT touched here.
#
# This used to copy deploy/nginx.conf over the live config on every deploy. That
# file is a template: it carries "server_name YOUR_DOMAIN" and listens on port
# 80 only. Certbot writes the real domain and the TLS block into the live file —
# so every deploy overwrote them, and the site was one `nginx -t` away from
# going dark. The live config was found sitting at YOUR_DOMAIN.
#
# Server configuration is set up once (see DEPLOY.md) and edited by certbot; a
# code deploy has no business rewriting it. Nginx serves the built files
# straight from disk, so a frontend rebuild needs no reload at all.
#
# If deploy/nginx.conf changes, apply it by hand and keep the domain and the
# certbot block:
#     diff /etc/nginx/sites-available/structuralcalc deploy/nginx.conf
#     nginx -t && systemctl reload nginx
echo "==> Nginx left untouched (server config is not deployed — see DEPLOY.md)"

echo ""
echo "==> Deployed successfully!"
