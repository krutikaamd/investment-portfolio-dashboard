# Deploying to Vercel — Step-by-step

Get your DCF dashboard live on the internet with full read/write functionality (holdings editor, watchlist add/remove, news feed) in roughly **10–15 minutes**.

## What you'll end up with

- A public URL like `https://<your-project>.vercel.app`
- Holdings + watchlist edits persisted in **Upstash Redis** (free tier — instant, durable)
- Yahoo Finance valuations and news still work (no API keys required)
- Optional **HTTP Basic auth** so only you (and people you share the password with) can use it
- Auto-redeploy on every `git push` to `main`

## Architecture summary

| Layer | Local dev | Vercel production |
|---|---|---|
| Frontend | Next.js dev server | Next.js production build |
| API routes | Next.js dev server | Vercel serverless functions |
| Portfolio storage | `data/portfolio.json` on disk | **Upstash Redis** (key `portfolio:state:v1`) |
| Yahoo Finance | direct fetch | direct fetch |
| News | direct Yahoo search | direct Yahoo search |
| Auth | none | optional HTTP Basic (env-var gated) |

The store auto-detects which backend to use: if `KV_REST_API_URL` (or `UPSTASH_REDIS_REST_URL`) is set, Redis. Otherwise, filesystem.

---

## Prerequisites

1. A free **Vercel account** — [vercel.com/signup](https://vercel.com/signup) (sign in with GitHub)
2. Your repo already on GitHub: [github.com/krutikaamd/investment-portfolio-dashboard](https://github.com/krutikaamd/investment-portfolio-dashboard) ✓

---

## Step 1: Import the project into Vercel

1. Go to [vercel.com/new](https://vercel.com/new).
2. Click **Import** next to `krutikaamd/investment-portfolio-dashboard`.
3. On the configuration screen:
   - **Framework Preset**: Next.js (auto-detected)
   - **Root Directory**: click `Edit` → select **`dashboard/`** ← **this is critical**
   - **Build / Output / Install commands**: leave as defaults
   - **Environment Variables**: skip for now, we'll add them after the database is set up
4. Click **Deploy**.

The first build will take ~2 minutes. When it finishes, you'll get a URL (e.g. `dcf-portfolio-abc.vercel.app`). At this point the dashboard works in **read-only mode** — Yahoo data + DCF + news all work, but holdings/watchlist edits won't persist between cold starts because Redis isn't connected yet.

---

## Step 2: Provision the Upstash Redis store

1. From your Vercel project page → **Storage** tab → **Create Database**.
2. Choose **Marketplace Database Providers** → **Upstash** → **Redis**.
3. Pick a name (e.g. `dcf-portfolio-kv`) and the closest region.
4. Plan: **Free** (10K commands/day, 256 MB — plenty for one JSON blob).
5. After creation, Vercel will offer to **"Connect to Project"**. Click **Connect**, select your dashboard project, leave the prefix as default (`KV_`).

Vercel automatically injects these env vars into your project's runtime:

```
KV_REST_API_URL=...
KV_REST_API_TOKEN=...
KV_REST_API_READ_ONLY_TOKEN=...
KV_URL=...
```

The portfolio store picks up `KV_REST_API_URL` + `KV_REST_API_TOKEN` automatically.

6. **Redeploy** so the new env vars take effect: Deployments tab → click the latest → **⋯** → **Redeploy**.

On this redeploy's cold-start, the API will seed Redis from your bundled `portfolio.json` — your existing holdings will appear, watchlist will start empty.

---

## Step 3 (optional but recommended): Add basic auth

If you don't want random visitors to be able to see your holdings or edit your watchlist:

1. Vercel project → **Settings → Environment Variables**.
2. Add a new variable:
   - **Key**: `DASHBOARD_PASSWORD`
   - **Value**: a strong password (e.g. generated via `1Password` or `openssl rand -base64 16`)
   - **Environments**: Production, Preview, Development
3. (Optional) Add `DASHBOARD_USER` to override the default username `admin`.
4. **Redeploy**.

After redeploy, the dashboard URL prompts for credentials. To revoke auth later, just delete the env var.

> Note: The `middleware.ts` file already in the repo applies this. If `DASHBOARD_PASSWORD` is unset, the middleware is a no-op.

---

## Step 4: Test the live dashboard

1. Open your Vercel URL.
2. (If you set the password) — sign in.
3. Verify:
   - Holdings table loads with valuations
   - "Invest Today" cash input works and shows allocation recommendations
   - Add a stock to the watchlist → refresh → still there (this proves Redis is connected)
   - News feed shows top 10 headlines
4. Hit the watchlist DELETE on the new entry to clean up.

If the watchlist add doesn't persist across a refresh, Redis isn't connected. Check env vars in **Settings → Environment Variables** and confirm a redeploy happened after you added them.

---

## Step 5 (optional): Custom domain

1. Vercel project → **Settings → Domains**.
2. Add your domain (e.g. `dcf.yourdomain.com`).
3. Vercel walks you through the DNS records to set up at your domain registrar.

Vercel issues + renews TLS certs automatically.

---

## Going forward

Every `git push` to `main` triggers an automatic Vercel deploy. Workflow:

```powershell
# make changes locally...
cd c:\Users\KDWIVEDI\.cursor\DCF
git add .
git commit -m "feat: ..."
git push
# Vercel builds + deploys automatically in ~60s
```

Watchlist + holdings edits made through the **live** dashboard go to Redis and don't show up in your local `portfolio.json` — that's expected. To sync local with production, you can read the Redis state from the Vercel dashboard's Storage → Redis → Data Browser, or hit the live `/api/portfolio` endpoint and overwrite your local file.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Build fails with `Module not found: '@upstash/redis'` | Vercel didn't pick up new dependency | Trigger a manual deploy from the dashboard |
| Watchlist add returns 500 with `Server error` | Redis env vars not visible in this environment | Settings → Env Vars → verify `KV_REST_API_*` are set for Production |
| Yahoo Finance returns errors | Rate-limit (rare) | The 10-min in-memory cache will smooth this. If persistent, add `getCompanyData` retry logic |
| `401 Unauthorized` on every page | Password set + browser cached wrong creds | Open in incognito, or clear basic-auth cache for the domain |
| Cold starts are slow (~3s first request) | Vercel serverless wakeup | Normal on free tier; consider Vercel Pro for "always-warm" |

---

## Cost estimate

| Service | Free tier | Likely usage |
|---|---|---|
| Vercel Hobby | 100 GB bandwidth / month, 100K function invocations | Well under for personal use |
| Upstash Redis Free | 10K commands / day, 256 MB | Single JSON blob; ~10–50 ops/day |
| Yahoo Finance | Free, no auth | Cached 10 min per ticker |

**Total cost: $0/month** for personal use.
