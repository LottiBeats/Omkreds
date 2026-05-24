# Deploying to Hetzner

## What you need before starting
- A Hetzner account (hetzner.com)
- A domain name (e.g. `calc.yourcompany.com`) — you can buy one on Namecheap (~$10/year)
- Your code pushed to a GitHub repository (private is fine)

---

## Step 1 — Create the server on Hetzner

1. Go to [console.hetzner.cloud](https://console.hetzner.cloud)
2. Click **New Project** → give it a name
3. Click **Add Server**:
   - **Location**: EU-Central (Frankfurt) or whichever is closest to you
   - **Image**: Ubuntu 24.04
   - **Type**: CX22 (2 vCPU, 4 GB RAM) — costs ~€4/month, plenty for this app
   - **SSH Key**: add your SSH public key (so you can log in without a password)
4. Click **Create & Buy**

You'll get an IP address like `1.2.3.4`. Save it.

---

## Step 2 — Point your domain to the server

Go to your domain registrar (Namecheap, GoDaddy, etc.) and add a DNS record:

| Type | Name | Value |
|------|------|-------|
| A    | calc | 1.2.3.4 (your server IP) |

This makes `calc.yourcompany.com` point to your server.
DNS changes take 5–30 minutes to propagate.

---

## Step 3 — SSH into the server and run setup

```bash
ssh root@1.2.3.4
```

Then download and run the setup script:
```bash
curl -o setup.sh https://raw.githubusercontent.com/YOUR_USER/YOUR_REPO/main/deploy/setup.sh
bash setup.sh
```

Or if you clone the repo first:
```bash
git clone https://github.com/YOUR_USER/YOUR_REPO.git /opt/structuralcalc/app
bash /opt/structuralcalc/app/deploy/setup.sh
```

---

## Step 4 — Configure environment variables

**Backend** (`/opt/structuralcalc/app/backend/.env`):
```
nano /opt/structuralcalc/app/backend/.env
```
Set these values:
```
CLERK_ISSUER=https://proven-sawfly-11.clerk.accounts.dev
DATABASE_PATH=/opt/structuralcalc/data/calc.db
ALLOWED_ORIGINS=https://calc.yourcompany.com
```

**Frontend** (`/opt/structuralcalc/app/frontend/.env.local`):
```
nano /opt/structuralcalc/app/frontend/.env.local
```
Set:
```
VITE_CLERK_PUBLISHABLE_KEY=pk_live_xxxxxxxxxxxx
```
> ⚠️ Use the **production** key from Clerk dashboard (not the test key starting with `pk_test_`).
> Go to clerk.com → your app → API Keys → switch to Production.

---

## Step 5 — Edit nginx.conf with your domain

```bash
nano /opt/structuralcalc/app/deploy/nginx.conf
```
Replace `YOUR_DOMAIN` with your actual domain (e.g. `calc.yourcompany.com`).

---

## Step 6 — First deploy

```bash
bash /opt/structuralcalc/app/deploy/first_deploy.sh
```

This installs Python packages, builds the React app, starts Nginx and the backend service.

---

## Step 7 — Get an SSL certificate (HTTPS)

```bash
certbot --nginx -d calc.yourcompany.com
```

Follow the prompts. Certbot automatically:
- Gets a free Let's Encrypt certificate
- Configures Nginx to redirect HTTP → HTTPS
- Sets up auto-renewal

---

## Step 8 — Open the website

Go to `https://calc.yourcompany.com` — you should see the login screen.

---

## Updating the app later

Every time you push changes to GitHub, SSH into the server and run:

```bash
ssh root@1.2.3.4
bash /opt/structuralcalc/app/deploy/deploy.sh
```

That's it — it pulls the latest code, rebuilds the frontend, and restarts the backend.

---

## Useful commands on the server

```bash
# Check if backend is running
systemctl status structuralcalc

# See backend logs (errors, requests)
journalctl -u structuralcalc -f

# Restart backend manually
systemctl restart structuralcalc

# Check Nginx
systemctl status nginx
nginx -t   # test config syntax
```

---

## Clerk: switch to Production mode

Before going live, switch Clerk from development to production:
1. Go to [clerk.com](https://clerk.com) → your app
2. Click **Production** in the top bar
3. Copy the **Production Publishable Key** (`pk_live_...`)
4. Put it in `/opt/structuralcalc/app/frontend/.env.local`
5. Re-run `deploy.sh` to rebuild the frontend

Production mode means real login emails, real sessions, and no test accounts.
