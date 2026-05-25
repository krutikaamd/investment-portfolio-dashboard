# DCF Portfolio Dashboard

A live investment dashboard built around dynamic DCF valuation. Pulls each
company's financials from Yahoo Finance, computes a fully bespoke WACC,
projects 10 years of free cash flow under Bull / Base / Bear scenarios,
discounts to fair value, then tells you how to deploy your next dollar across
your portfolio — overweight what's undervalued, underweight what's
overvalued, leave the rest alone.

![dashboard](docs/screenshot.png)

## What makes this different

Every input that drives valuation is **computed live, per company** — no
hardcoded inputs like the original Excel template:

| Input             | Source / Formula                                            |
| ----------------- | ----------------------------------------------------------- |
| Risk-free rate    | Live 10-year US Treasury yield (`^TNX`) from Yahoo          |
| Equity risk prem. | Damodaran US ERP (4.9%, single global input)                |
| Beta              | Yahoo `summaryDetail.beta` (5-yr monthly)                   |
| Cost of equity    | CAPM: Rf + β × ERP                                          |
| Pre-tax cost of debt | Interest expense / average total debt (from filings)     |
| Effective tax rate | Income tax / pre-tax income (3-yr average, capped 10–35%) |
| Capital weights   | Mkt Cap / (Mkt Cap + Total Debt), inverse for debt          |
| **WACC**          | Wₑ·Kₑ + W_d·K_d·(1 − T) — computed per company              |
| Historical FCF    | OCF − CapEx (4–5 years from `fundamentalsTimeSeries`)       |
| Y1 revenue growth | Yahoo analyst current-year estimate (`earningsTrend`)       |
| Y2–Y10 growth     | Linear fade from Y1 → long-run growth                       |
| Terminal growth   | min(long-run GDP 2.5%, analyst LT/2), capped at WACC − 2%   |
| FCF margin        | Latest reported margin, faded ±5–10% by scenario            |
| Net debt          | Latest balance sheet: Total Debt − (Cash + ST Investments)  |
| Shares out        | Yahoo `defaultKeyStatistics.sharesOutstanding`              |

Fair value is the **probability-weighted** equity-per-share across the three
scenarios (Bull 30% / Base 50% / Bear 20%).

## Allocation engine

Enter "how much do I want to invest today?" and the engine:

1. Computes each stock's **margin of safety** = (DCF fair value − price) / price.
2. Builds **target weights** via an asymmetric soft-max: positive-MoS names
   tilt heavier, deeply negative MoS (< −25%) get zero new capital.
3. Distributes your cash proportionally to the *required* dollar lift for
   each name. SELL/TRIM names are surfaced but never bought.

## Stack

- **Next.js 14** (App Router, TypeScript, React Server Components)
- **Tailwind CSS** for the dark fintech theme
- **Recharts** for the 10-year FCF projection chart
- **yahoo-finance2 v3** for `quote`, `quoteSummary`, `fundamentalsTimeSeries`
- All DCF math in `lib/dcf.ts`, `lib/wacc.ts`, `lib/allocate.ts`
- Portfolio stored as plain JSON in `data/portfolio.json` (editable in-UI)

## Run it

```bash
cd dashboard
npm install
npm run dev     # http://localhost:3000
```

### Behind a corporate proxy / TLS interception

The default `dev` script uses `--use-system-ca`, which tells Node 22+ to trust
the Windows / macOS certificate store. This makes the live Yahoo Finance calls
work behind most corporate proxies (Zscaler, Cisco Umbrella, etc.) that inject
their own TLS root.

If that still fails, use the (insecure) fallback:

```bash
npm run dev:insecure-tls
```

Only do this for local development — it disables TLS verification entirely.

## Editing your portfolio

Click the **Holdings** button in the header, or edit `data/portfolio.json`:

```json
{
  "baseCurrency": "USD",
  "holdings": [
    { "ticker": "AAPL", "shares": 25, "avgCost": 175.20 },
    { "ticker": "MSFT", "shares": 18, "avgCost": 312.55 }
  ]
}
```

Tickers must be Yahoo Finance symbols (e.g. `BRK-B`, not `BRK.B`).

## API endpoints

| Endpoint                              | Returns                                              |
| ------------------------------------- | ---------------------------------------------------- |
| `GET /api/portfolio`                  | Current holdings JSON                                |
| `PUT /api/portfolio`                  | Replace holdings list                                |
| `GET /api/valuation?ticker=JNJ`       | Full per-stock DCF + WACC + sensitivity grid         |
| `GET /api/allocate?cash=5000`         | Portfolio valuation + recommendations for $5k input  |

Yahoo data is cached server-side for 15 minutes per ticker.

## File layout

```
dashboard/
├── app/
│   ├── page.tsx                 ← main dashboard
│   ├── layout.tsx
│   ├── globals.css
│   └── api/
│       ├── portfolio/route.ts   ← GET/PUT portfolio JSON
│       ├── valuation/route.ts   ← per-stock DCF endpoint
│       └── allocate/route.ts    ← portfolio + allocation endpoint
├── components/
│   ├── PortfolioSummary.tsx     ← top KPI strip
│   ├── HoldingsTable.tsx        ← live holdings grid
│   ├── AllocationPanel.tsx      ← "how much to invest today" panel
│   ├── StockDetail.tsx          ← per-stock DCF breakdown
│   ├── PortfolioEditor.tsx      ← add/remove holdings modal
│   ├── Stat.tsx, VerdictBadge.tsx
├── lib/
│   ├── yahoo.ts                 ← Yahoo Finance data layer
│   ├── wacc.ts                  ← dynamic WACC engine
│   ├── dcf.ts                   ← 3-scenario DCF + sensitivity grid
│   ├── allocate.ts              ← allocation engine
│   ├── portfolio-store.ts       ← JSON file I/O
│   └── utils.ts                 ← formatting helpers
└── data/portfolio.json          ← your holdings (editable)
```

## Disclaimer

This is a model. Like every DCF, it depends on the assumptions you make. The
default scenario fades are intentionally conservative on the bear side and
generous on the bull. Do not take any of this as investment advice. If a
company's beta is missing from Yahoo (uncommon), a sector-level fallback is
used and surfaced in the per-stock notes.
