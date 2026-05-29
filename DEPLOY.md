# Deploying To Hetzner

This guide assumes:
- The app is pushed to GitHub.
- You have a Hetzner Ubuntu server.
- You have a domain pointed at the server.

## 1. Create The Server

Create a Hetzner Cloud server:
- Image: Ubuntu 24.04
- Type: CX22 is enough for this app
- SSH key: add your public key

Save the server IP address.

## 2. Point DNS At The Server

Create an `A` record at your DNS provider:

| Type | Name | Value |
| ---- | ---- | ----- |
| A | calc | your server IP |

Example: `calc.yourcompany.com -> 1.2.3.4`

DNS usually takes 5-30 minutes to propagate.

## 3. SSH Into The Server

```bash
ssh root@1.2.3.4
```

Replace `1.2.3.4` with your actual server IP.

## 4. Install Server Dependencies

From the server, run the setup script. This installs Git, Node, Python, Nginx, Certbot, and creates `/opt/structuralcalc`.

Recommended:

```bash
curl -o setup.sh https://raw.githubusercontent.com/YOUR_USER/YOUR_REPO/main/deploy/setup.sh
bash setup.sh
```

Then clone the app:

```bash
git clone https://github.com/YOUR_USER/YOUR_REPO.git /opt/structuralcalc/app
```

If the repo is already cloned, you can run:

```bash
bash /opt/structuralcalc/app/deploy/setup.sh
```

## 5. Configure Environment Variables

Backend env file:

```bash
nano /opt/structuralcalc/app/backend/.env
```

Use:

```bash
CLERK_ISSUER=https://proven-sawfly-11.clerk.accounts.dev
DATABASE_PATH=/opt/structuralcalc/data/calc.db
ALLOWED_ORIGINS=https://calc.yourcompany.com

# User allowlist — only these emails can access the API (comma-separated).
# Any Clerk account NOT in this list gets HTTP 403.
# Remove this line to allow all valid Clerk accounts (not recommended).
ALLOWED_EMAILS=you@yourfirm.com

# Python Script block — who can run exec() on the server.
# Defaults to ALLOWED_EMAILS above if not set separately.
ADMIN_EMAIL=you@yourfirm.com
```

Frontend env file:

```bash
nano /opt/structuralcalc/app/frontend/.env.local
```

Use your production Clerk publishable key:

```bash
VITE_CLERK_PUBLISHABLE_KEY=pk_live_xxxxxxxxxxxx
```

Use Clerk production keys for production. Do not deploy a `pk_test_...` key.

## 6. Configure Nginx

Edit the Nginx config:

```bash
nano /opt/structuralcalc/app/deploy/nginx.conf
```

Replace `YOUR_DOMAIN` with your real domain, for example:

```text
calc.yourcompany.com
```

## 7. First Deploy

Run this once after setup:

```bash
bash /opt/structuralcalc/app/deploy/first_deploy.sh
```

This creates the Python virtual environment, installs backend packages, builds the frontend, installs Nginx config, and starts the backend service.

## 8. Add HTTPS

```bash
certbot --nginx -d calc.yourcompany.com
```

Certbot will create a Let's Encrypt certificate and configure HTTPS.

## 9. Update The App Later

After pushing changes to GitHub, deploy them with:

```bash
ssh root@1.2.3.4
bash /opt/structuralcalc/app/deploy/deploy.sh
```

The deploy script pulls the latest code, installs backend dependencies, rebuilds the frontend from `package-lock.json`, and restarts the backend.

## Useful Server Commands

Check backend status:

```bash
systemctl status structuralcalc
```

Watch backend logs:

```bash
journalctl -u structuralcalc -f
```

Restart backend:

```bash
systemctl restart structuralcalc
```

Check Nginx:

```bash
systemctl status nginx
nginx -t
```

## Clerk Production Checklist

Before going live:
- Switch Clerk to Production mode.
- Copy the production publishable key into `frontend/.env.local`.
- Confirm `CLERK_ISSUER` matches the production Clerk issuer.
- Re-run `deploy.sh` after changing frontend environment variables.
