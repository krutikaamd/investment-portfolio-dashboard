# DCF Portfolio Dashboard

A live, fintech-style dashboard that runs a fully dynamic Discounted Cash Flow (DCF) valuation on every holding in your portfolio — plus a watchlist for stocks you want to track — using real-time Yahoo Finance fundamentals. Nothing is hardcoded: WACC, terminal growth, beta, FCF margins, and analyst growth are all pulled and computed per-company at request time.

![Stack](https://img.shields.io/badge/Next.js-14-black) ![TS](https://img.shields.io/badge/TypeScript-5-blue) ![Tailwind](https://img.shields.io/badge/Tailwind-3-cyan)

## What it does

- **Live DCF per holding** — bull / base / bear scenarios projected from EBITDA margins, capex intensity, NWC drag, and analyst growth (current year + next year + long-term blended with historical CAGR).
- **Dynamic WACC** — computed from live beta (with sector floor + 1.5 ceiling), country risk premium, cost of debt from interest expense, and live 10Y Treasury yield.
- **Impairment-aware** — detects margin shocks (e.g. UNH 2025) and applies left-skewed scenario weighting + recovery curves rather than naive margin expansion.
- **Soft-anchored to analyst consensus** — DCF outputs more than ±25% from sell-side targets are blended toward consensus and flagged WARN / ALERT with a plain-English diagnostic.
- **Allocation engine** — recommends how to deploy new cash, overweighting only positive margin-of-safety names by MoS-weighted shares.
- **Watchlist** — track stocks you don't own with the same DCF pipeline plus a "since added" performance counter.
- **News feed** — top 10 headlines across portfolio + watchlist, ranked by publisher tier, recency, and multi-ticker relevance.

## Quick start

```bash
cd dashboard
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

Behind a corporate proxy with TLS interception (the common cause of `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` errors against Yahoo)? The `dev` script already passes `NODE_OPTIONS=--use-system-ca`. If you still see TLS errors, run from PowerShell with:

```powershell
$env:NODE_OPTIONS='--use-system-ca'; npm run dev
```

## Project layout

```
DCF/
├── dashboard/                  # Next.js 14 app (App Router)
│   ├── app/
│   │   ├── api/
│   │   │   ├── allocate/       # GET portfolio + DCF + allocation
│   │   │   ├── valuation/      # GET single-ticker deep dive
│   │   │   ├── portfolio/      # GET / PUT holdings
│   │   │   ├── watchlist/      # GET / POST / DELETE watchlist items
│   │   │   └── news/           # GET top 10 ranked headlines
│   │   └── page.tsx            # Dashboard root
│   ├── components/             # HoldingsTable, WatchlistTable, NewsFeed, etc.
│   ├── lib/
│   │   ├── yahoo.ts            # Yahoo Finance data layer (quotes, financials, news)
│   │   ├── wacc.ts             # Dynamic WACC w/ sector floors + beta ceiling
│   │   ├── dcf.ts              # EBITDA-margin-based DCF + impairment + anchoring
│   │   ├── allocate.ts         # Portfolio valuation + MoS-weighted allocation
│   │   └── portfolio-store.ts  # JSON-file persistence
│   └── data/
│       └── portfolio.json      # Holdings + watchlist (the source of truth)
├── build_jnj_dcf.py            # Reference Python script for the JNJ template
└── JNJ DCF Valuation Model.xlsx# Excel template that the valuation logic mirrors
```

## How the DCF works (1-min version)

1. **Pull live financials** from Yahoo (`quoteSummary`, `fundamentalsTimeSeries`) — last 4 years of income / balance / cash flow.
2. **Compute WACC dynamically**: CAPM with live beta (sector-floored, capped at 1.5) + country risk premium; cost of debt from `interestExpense / avg(totalDebt)`; tax rate from effective rate.
3. **Project Unlevered FCF** from EBITDA margins (not EBIT) over a 10-year horizon, with scenario-specific margin caps based on maturity / hypergrowth / impairment status.
4. **Terminal value** via Gordon growth with terminal growth = blend of long-term GDP + analyst LT estimate, capped below WACC − 100bp.
5. **Bull / Base / Bear** weights default 25/50/25, shifted to 15/50/35 for impaired names.
6. **Anchor to consensus**: if raw DCF deviates >40% from sell-side target, hard-anchor at 25/75; 15–40% → soft 50/50; flag accordingly.
7. **Verdict** from margin of safety: `BUY > +25% > ACCUMULATE > +10% > HOLD > -10% > TRIM > -25% > SELL`.

## Configuration

Your holdings + watchlist live in `dashboard/data/portfolio.json`:

```json
{
  "baseCurrency": "USD",
  "holdings": [
    { "ticker": "JNJ",  "shares": 40, "avgCost": 168.9 },
    { "ticker": "AAPL", "shares": 25, "avgCost": 175.2 }
  ],
  "watchlist": [
    { "ticker": "TSLA", "addedAt": "2026-05-25T10:00:00.000Z", "addedAtPrice": 220.5 }
  ]
}
```

Edits via the in-app **Holdings** editor and **Add to watchlist** input are persisted back to this file. Note: on serverless deployments (Vercel, Netlify) the filesystem is read-only — see the Deployment section.

## API endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/allocate?cash=N` | GET | Full portfolio valuation + allocation recommendations |
| `/api/valuation?ticker=X` | GET | Single-ticker DCF deep dive |
| `/api/portfolio` | GET / PUT | Read or replace the holdings list |
| `/api/watchlist` | GET / POST / DELETE | Manage watchlist entries |
| `/api/news?perTicker=8&topN=10` | GET | Top-N ranked headlines for portfolio tickers |

## Deployment

The recommended path is **Vercel** (free, native Next.js support):

1. Push this repo to GitHub.
2. Import on [vercel.com/new](https://vercel.com/new) with **Root Directory = `dashboard/`**.
3. Vercel auto-detects the framework, builds, and gives you a URL.

**Caveat**: Vercel's serverless filesystem is read-only, so the holdings editor and watchlist add/remove won't persist between cold starts. Three options:
- **A. Bake into repo** — edit `portfolio.json` locally and redeploy.
- **B. Vercel KV (Redis)** — swap `portfolio-store.ts` for KV read/write. ~20 min.
- **C. Postgres / Supabase free tier** — overkill but future-proof.

For private-only access, enable **Vercel Password Protection** in project settings, or add a basic-auth `middleware.ts`.

## Local dev gotchas (Windows)

- **`ERR_CONNECTION_REFUSED` (-102)** — dev server is dead. `npm run dev`.
- **`ERR_CONNECTION_RESET` (-101)** — zombie socket. `Get-Process node | Stop-Process -Force`, then restart.
- **Yahoo Finance TLS errors** — corporate proxy intercepting TLS. The `dev` script handles this via `NODE_OPTIONS=--use-system-ca`. If still broken, check that the proxy's root CA is in your Windows trusted store.

## License

Personal project. Not investment advice. The DCF outputs are model approximations; always cross-check with primary sources before making allocation decisions.
