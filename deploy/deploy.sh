#!/bin/bash
# Run every time you want to push an update to the server
# Usage (as root): bash /opt/structuralcalc/app/deploy/deploy.sh
set -e

APP_DIR=/opt/structuralcalc
APP_USER=structcalc

echo "==> Pulling latest code..."
cd $APP_DIR/app
git pull

echo "==> Updating Python dependencies..."
sudo -u $APP_USER $APP_DIR/venv/bin/pip install -r backend/requirements.txt

echo "==> Rebuilding React frontend..."
cd $APP_DIR/app/frontend
npm install
npm run build
chown -R $APP_USER:$APP_USER dist

echo "==> Restarting backend..."
systemctl restart structuralcalc
systemctl status structuralcalc --no-pager

echo ""
echo "==> Deployed successfully!"
