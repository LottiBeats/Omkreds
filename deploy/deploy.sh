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
npm run build
chown -R "$APP_USER:$APP_USER" dist

echo "==> Restarting backend..."
systemctl restart structuralcalc
systemctl status structuralcalc --no-pager

echo "==> Reloading Nginx config..."
cp "$APP_DIR/app/deploy/nginx.conf" /etc/nginx/sites-available/structuralcalc
nginx -t && systemctl reload nginx

echo ""
echo "==> Deployed successfully!"
