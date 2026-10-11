# Deploy Dropship Pro to dropshipconsole.com

Free hosting: **Render.com** + **Turso** (cloud SQLite) + **Cloudflare** (DNS + SSL).

---

## Step 1 — Create free Turso database (2 minutes, web UI only)

> No CLI needed — do this entirely in the browser.

1. Go to **https://app.turso.tech** and sign up (use GitHub for one click)
2. Click **"Create database"**
   - Name: `dropship-console`
   - Location: pick the closest region (e.g., `aws-us-east-1`)
3. Once created, click the database → **"Connect"** tab
4. Copy the **Database URL** — looks like: `libsql://dropship-console-[your-username].turso.io`
5. Click **"Generate Token"** (or "+ Create token") → copy the token

**Save both values** — you need them in Step 3.

---

## Step 2 — Deploy to Render.com (3 minutes, web UI only)

1. Go to **https://render.com** and sign up (use GitHub for one click)
2. Click **New +** → **Web Service**
3. Connect your GitHub account if prompted
4. Select the repo: **`yybam/dropship-console`**
5. Render auto-detects `render.yaml` — everything is pre-configured
6. Click **"Create Web Service"**

---

## Step 3 — Set environment variables in Render

Before (or after) first deploy, go to your Render service → **Environment** tab:

| Key | Value |
|-----|-------|
| `LIBSQL_URL` | `libsql://dropship-console-[username].turso.io` |
| `LIBSQL_AUTH_TOKEN` | `your-turso-token` |
| `RESEND_API_KEY` | *(optional)* Resend key for email alerts |
| `ALERT_EMAIL` | *(optional)* yybambi23@gmail.com |

Click **"Save Changes"** → Render redeploys automatically with the cloud DB.

---

## Step 4 — Register dropshipconsole.com

**Cheapest option: Cloudflare Registrar** (~$9.15/year, no markup)

1. Go to **https://dash.cloudflare.com** → **Domain Registration** → **Register Domains**
2. Search `dropshipconsole.com` → purchase (~$9.15/year)

*(Skip this step if you're fine using the free Render URL: `https://dropship-console.onrender.com`)*

---

## Step 5 — Point the domain to Render

1. In Render → your service → **Settings** → **Custom Domains** → Add:
   - `dropshipconsole.com`
   - `www.dropshipconsole.com`
2. Render gives you a CNAME: `dropship-console.onrender.com`
3. In Cloudflare DNS add these records:

   | Type | Name | Content | Proxy |
   |------|------|---------|-------|
   | CNAME | `@` | `dropship-console.onrender.com` | ✅ Proxied |
   | CNAME | `www` | `dropship-console.onrender.com` | ✅ Proxied |

SSL is automatic via Cloudflare.

---

## Step 6 — Keep the server awake (free, prevents Render spindown)

Render free tier **sleeps after 15 min of inactivity** — cron auto-sync stops while asleep.

Fix: **UptimeRobot** (free) pings every 14 minutes:
1. Go to **https://uptimerobot.com** → sign up free
2. **New Monitor** → HTTP(s)
3. URL: `https://dropshipconsole.com/api/stats` (or your Render URL)
4. Interval: **14 minutes**

---

## Local development

```bash
# Works exactly as before — uses local SQLite
node server.js

# Test with Turso locally:
$env:LIBSQL_URL="libsql://dropship-console-[username].turso.io"
$env:LIBSQL_AUTH_TOKEN="your-token"
node server.js
```

---

## Cost summary

| Service | Cost |
|---------|------|
| Render.com web service | **FREE** (750 hrs/month) |
| Turso cloud SQLite | **FREE** (8GB, 500 DBs) |
| Cloudflare DNS + SSL | **FREE** |
| UptimeRobot monitor | **FREE** |
| dropshipconsole.com domain | **~$9.15/year** |
| **Total** | **~$9.15/year** |

---

## Quick checklist

- [ ] Turso database created → URL + token copied
- [ ] Render account created → GitHub repo connected
- [ ] Env vars set in Render (LIBSQL_URL + LIBSQL_AUTH_TOKEN)
- [ ] First deploy succeeded (check Render logs)
- [ ] Domain purchased at Cloudflare (optional)
- [ ] DNS records pointed at Render (optional)
- [ ] UptimeRobot keep-alive set up
