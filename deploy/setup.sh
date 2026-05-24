#!/bin/bash
# Run ONCE on a fresh Hetzner Ubuntu 24.04 server (as root)
# Usage: bash setup.sh
set -e

APP_DIR=/opt/structuralcalc
APP_USER=structcalc

echo "==> Updating packages..."
apt-get update -y && apt-get upgrade -y

echo "==> Installing Python, Nginx, Git, Certbot..."
apt-get install -y python3.11 python3.11-venv python3-pip \
    nginx certbot python3-certbot-nginx git curl ufw

echo "==> Installing Node 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

echo "==> Creating app user and directories..."
useradd --system --create-home --shell /bin/bash $APP_USER 2>/dev/null || true
mkdir -p $APP_DIR/data
chown -R $APP_USER:$APP_USER $APP_DIR

echo "==> Configuring firewall..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo ""
echo "========================================================"
echo " Setup complete! Continue with the steps in DEPLOY.md"
echo "========================================================"
