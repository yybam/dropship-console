# Deploy Dropship Pro to dropshipconsole.com

Full cloud deployment: **Render.com** (free hosting) + **Turso** (free cloud SQLite) + **Cloudflare** (free DNS + SSL).

---

## Step 1 — Create free Turso database (cloud SQLite)

1. Sign up at https://turso.tech (free tier: 500 DBs, 8GB storage)
2. Install the Turso CLI:
   ```
   winget install ChiselStrike.Turso
   ```
3. Log in and create your database:
   ```
   turso auth login
   turso db create dropship-console
   ```
4. Get your database URL and auth token:
   ```
   turso db show dropship-console --url
   turso db tokens create dropship-console
   ```
5. Save both — you'll need them in Step 3.

---

## Step 2 — Deploy to Render.com (free)

1. Sign up at https://render.com
2. Connect your GitHub account
3. Push this project to a GitHub repo:
   ```
   git init
   git add .
   git commit -m "Initial dropship console"
   git remote add origin https://github.com/YOUR_USERNAME/dropship-console.git
   git push -u origin main
   ```
4. In Render dashboard → **New** → **Web Service**
5. Connect your GitHub repo
6. Render auto-detects `render.yaml` — click **Deploy**

---

## Step 3 — Set environment variables in Render

In your Render service → **Environment** tab, add:

| Key | Value |
|-----|-------|
| `LIBSQL_URL` | `libsql://dropship-console-[username].turso.io` |
| `LIBSQL_AUTH_TOKEN` | `your-turso-token` |
| `RESEND_API_KEY` | *(optional)* your Resend key for email alerts |
| `ALERT_EMAIL` | *(optional)* yybambi23@gmail.com |

Click **Save Changes** → Render will redeploy automatically.

---

## Step 4 — Register dropshipconsole.com

**Cheapest option: Cloudflare Registrar** (~$9.15/year at cost, no markup)

1. Go to https://cloudflare.com → **Register a Domain**
2. Search for `dropshipconsole.com`
3. Purchase ($9.15/year)

---

## Step 5 — Point the domain to Render

1. In Render → your service → **Settings** → **Custom Domains** → Add `dropshipconsole.com` and `www.dropshipconsole.com`
2. Render gives you a CNAME target like `dropship-console.onrender.com`
3. In Cloudflare DNS → add records:

   | Type | Name | Content | Proxy |
   |------|------|---------|-------|
   | CNAME | `@` | `dropship-console.onrender.com` | ✅ Proxied |
   | CNAME | `www` | `dropship-console.onrender.com` | ✅ Proxied |

4. SSL is automatic via Cloudflare (free)

---

## Step 6 — Keep the server awake (free)

Render free tier **spins down after 15 min of inactivity** (cron syncs won't run while asleep).

Fix: Use **UptimeRobot** (free) to ping every 14 minutes:
1. Sign up at https://uptimerobot.com
2. Add monitor: HTTP(s) → `https://dropshipconsole.com/api/stats`
3. Set interval: **14 minutes**

This keeps the server warm so auto-sync runs on schedule.

---

## Local development

```bash
# Still works exactly as before — uses local SQLite
node server.js

# To test with Turso locally:
set LIBSQL_URL=libsql://dropship-console-[username].turso.io
set LIBSQL_AUTH_TOKEN=your-token
node server.js
```

---

## Cost summary

| Service | Cost |
|---------|------|
| Render.com web service | **FREE** |
| Turso database | **FREE** (8GB) |
| Cloudflare DNS + SSL | **FREE** |
| UptimeRobot monitor | **FREE** |
| Domain: dropshipconsole.com | **~$9.15/year** |
| **Total** | **~$9.15/year** |
