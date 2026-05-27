#!/bin/bash
# Run ONCE after setup.sh to install the app for the first time
# Usage (as root): bash /opt/structuralcalc/app/deploy/first_deploy.sh
set -euo pipefail

APP_DIR=/opt/structuralcalc
APP_USER=structcalc

echo "==> Creating Python virtual environment..."
python3.11 -m venv "$APP_DIR/venv"
chown -R "$APP_USER:$APP_USER" "$APP_DIR/venv"

echo "==> Installing Python dependencies..."
sudo -u "$APP_USER" "$APP_DIR/venv/bin/pip" install --upgrade pip
sudo -u "$APP_USER" "$APP_DIR/venv/bin/pip" install -r "$APP_DIR/app/backend/requirements.txt"

echo "==> Building React frontend..."
cd "$APP_DIR/app/frontend"
npm ci
npm run build
chown -R "$APP_USER:$APP_USER" "$APP_DIR/app/frontend/dist"

echo "==> Installing Nginx config..."
cp "$APP_DIR/app/deploy/nginx.conf" /etc/nginx/sites-available/structuralcalc
ln -sf /etc/nginx/sites-available/structuralcalc /etc/nginx/sites-enabled/structuralcalc
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "==> Installing and starting backend service..."
cp "$APP_DIR/app/deploy/backend.service" /etc/systemd/system/structuralcalc.service
systemctl daemon-reload
systemctl enable structuralcalc
systemctl start structuralcalc

echo ""
echo "==> Done! Check status with: systemctl status structuralcalc"
echo "==> Then get SSL cert: certbot --nginx -d YOUR_DOMAIN"
