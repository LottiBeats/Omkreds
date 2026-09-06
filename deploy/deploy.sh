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

# node_modules ryddes her og ikke af npm.
#
# "npm ci" rydder selv traeet foerst, og det fejler paa denne maskine:
#     npm error ENOTEMPTY: directory not empty, rmdir
#       '.../node_modules/@tanstack/query-core/build/legacy'
# Nogle gange stopper npm der. Andre gange efterlader det et halvt ryddet
# traae, og saa er det rollup der falder over det bagefter med en
# "handleInvalidResolvedId" paa et vilkaarligt modul -- en fejlmeddelelse der
# ikke peger paa noget som helst. Det tog to deploys og en fejlsoegning at
# finde ud af, at de to ting var den samme.
#
# rm -rf gor det, npm ikke kan, og saa har npm ci ingenting at rydde.
install_deps() {
    rm -rf node_modules
    npm ci
}

install_deps

# npm paa denne maskine fejler paa mindst tre maader: ENOTEMPTY naar den selv
# skal rydde node_modules, en enkelt gang ENOENT, og en gang et traea hvor
# npm ci returnerede 0 men vite manglede -- saa faldt byggeriet med
# "vite: not found". Ingen af dem kan fremprovokeres, og alle er vaek ved
# naeste forsoeg.
#
# rm -rf fjerner den foerste. De to andre kan kun opdages bagefter, saa der
# tjekkes at vaerktoejet faktisk er der, og der proeves én gang til. Fejler
# det ogsaa anden gang, stopper deployet.
if [ ! -x node_modules/.bin/vite ]; then
    echo "==> npm ci gav et ufuldstaendigt traea (vite mangler). Proever igen." >&2
    install_deps
fi
[ -x node_modules/.bin/vite ] || {
    echo "vite mangler stadig efter to forsoeg -- stopper." >&2
    exit 1
}

if ! npm run build; then
    echo "==> Byg fejlede. Rydder node_modules og proever en gang til." >&2
    install_deps
    npm run build
    echo "==> Andet forsoeg lykkedes. Det er npm der driller, ikke koden." >&2
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
