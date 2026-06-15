import { NextResponse } from "next/server";
import { loadPortfolio } from "@/lib/portfolio-store";
import { getUserId } from "@/lib/user";
import { getCompanyData, getRiskFreeRate } from "@/lib/yahoo";
import { valuateCompany } from "@/lib/dcf";
import { allocate, valuePortfolio, type Holding } from "@/lib/allocate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const cash = Number(searchParams.get("cash") ?? 0);

  try {
    const portfolio = await loadPortfolio(getUserId());
    const rf = await getRiskFreeRate();

    // Build the set of real holding tickers + the watchlist set.
    const holdingTickers = new Set(
      portfolio.holdings.map((h) => h.ticker.toUpperCase())
    );
    const watchlistTickers = new Set(
      portfolio.watchlist.map((w) => w.ticker.toUpperCase())
    );

    // "Phantom" holdings for watchlist-only tickers — same DCF + MoS pipeline,
    // but shares=0 so they show as INITIATE candidates if undervalued.
    const watchlistOnly = [...watchlistTickers].filter(
      (t) => !holdingTickers.has(t)
    );
    const phantomHoldings: Holding[] = watchlistOnly.map((t) => ({
      ticker: t,
      shares: 0,
      avgCost: 0,
    }));

    const combinedHoldings = [...portfolio.holdings, ...phantomHoldings];

    // DCFs for everything in the combined pool (one Yahoo round-trip each,
    // cached at the data layer).
    const dcfs = await Promise.all(
      combinedHoldings.map(async (h) => {
        const data = await getCompanyData(h.ticker);
        return valuateCompany(data, rf);
      })
    );

    // Allocation works on the combined valuation so watchlist tickers can
    // receive recommendations.
    const valuedCombined = valuePortfolio(combinedHoldings, dcfs);
    const allocation = allocate(valuedCombined, cash, watchlistTickers);

    // Portfolio response only shows REAL holdings to the dashboard so the
    // Holdings table isn't polluted with 0-share watchlist phantoms.
    const realDcfs = dcfs.filter((d) =>
      holdingTickers.has(d.ticker.toUpperCase())
    );
    const valuedReal = valuePortfolio(portfolio.holdings, realDcfs);

    return NextResponse.json({
      riskFreeRate: rf,
      portfolio: valuedReal,
      allocation,
      dcfs: realDcfs,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `Allocation failed: ${msg}` },
      { status: 500 }
    );
  }
}
