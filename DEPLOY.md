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

## Backups And Recovery

Three layers protect user data. The first two need no operator action.

**Version history** — every save snapshots the previous state of the project
into the `project_versions` table (one automatic snapshot per 15 minutes per
project, 40 kept). Explicit snapshots — issued documents, pre-restore,
pre-delete — are never pruned. Users reach these from 🕘 in the editor toolbar.

**Trash** — deleting a project sets `deleted_at` instead of removing the row.
Users restore from the Papirkurv tab. Purged automatically after 30 days.

**Database backups** — a daemon thread writes one copy per day to
`backups/projects-YYYY-MM-DD.db` next to the database, keeping 7. It uses
SQLite's online backup API, so it is safe to run while the server is up.

```bash
ls -lh /var/data/backups/
```

Restore from a backup (stop the app first — never swap the file underneath a
running server):

```bash
systemctl stop structuralcalc
cp /var/data/projects.db /var/data/projects.db.before-restore
cp /var/data/backups/projects-2026-08-10.db /var/data/projects.db
systemctl start structuralcalc
```

Environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `BACKUP_KEEP_DAYS` | `7` | Daily copies retained. |
| `DB_MAINTENANCE` | on | Set to `off` to disable the backup/trash-expiry thread. |

Projects embed images as base64, so the database grows faster than the project
count suggests. The backup is skipped (with a log line) if the volume does not
have room for another copy plus headroom — a missed backup is recoverable, a
full disk takes the app down. If you see that message, raise the disk size or
lower `BACKUP_KEEP_DAYS`.

## Clerk Production Checklist

Before going live:
- Switch Clerk to Production mode.
- Copy the production publishable key into `frontend/.env.local`.
- Confirm `CLERK_ISSUER` matches the production Clerk issuer.
- Re-run `deploy.sh` after changing frontend environment variables.

## Automatisk deploy (GitHub Actions)

Alt der lander på `master` bliver deployet af `.github/workflows/deploy.yml`.
Workflowet SSH'er ind, kører `deploy/deploy.sh` og spørger bagefter
`/api/health`, om serveren rent faktisk kører den commit — deploy-scriptets
sidste linje beviser kun, at scriptet nåede til ende.

Det gør det ligegyldigt, hvor ændringen kom fra: laptop, cloud-session eller
telefon. Arbejd på en gren; et push til `master` er beslutningen om at gå live.

### Opsætning (én gang)

1. **Læg deploy-nøglen på serveren.** Den offentlige del af nøgleparret i
   `~/.ssh/omkreds_deploy`:

   ```bash
   mkdir -p ~/.ssh && chmod 700 ~/.ssh
   echo '<indhold af ~/.ssh/omkreds_deploy.pub>' >> ~/.ssh/authorized_keys
   chmod 600 ~/.ssh/authorized_keys
   ```

2. **Læg den private del i GitHub Secrets** som `DEPLOY_SSH_KEY`
   (Settings → Secrets and variables → Actions → New repository secret).
   Hele filen `~/.ssh/omkreds_deploy`, inklusive BEGIN- og END-linjerne.

Værtsnøglen ligger i `deploy/known_hosts` og er committet med vilje — den er
offentlig, og den er der, så runneren ikke accepterer hvad som helst, der
svarer på adressen.

### Manuelt deploy

`bash deploy/push.sh` gør det samme fra en maskine med SSH-adgang, og
`bash deploy/push.sh status` svarer på "hvad kører serveren lige nu".
