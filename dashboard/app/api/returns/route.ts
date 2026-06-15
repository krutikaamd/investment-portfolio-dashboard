import { NextResponse } from "next/server";
import { loadPortfolio } from "@/lib/portfolio-store";
import { getUserId } from "@/lib/user";
import { getHistoricalCloses } from "@/lib/yahoo";
import { computeReturns } from "@/lib/returns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BENCHMARK = "^GSPC"; // S&P 500

export async function GET() {
  try {
    const portfolio = await loadPortfolio(getUserId());
    const tickers = portfolio.holdings.map((h) => h.ticker.toUpperCase());
    if (tickers.length === 0) {
      return NextResponse.json({
        asOf: new Date().toISOString().slice(0, 10),
        benchmarkTicker: BENCHMARK,
        benchmarkLabel: "S&P 500",
        totalCurrentValue: 0,
        periods: [],
      });
    }

    // Pull ~14 months of daily closes — enough to cover the longest active
    // window (6M / YTD) with a comfortable weekend / new-year buffer. Cached
    // for 1h server-side.
    const from = new Date();
    from.setUTCMonth(from.getUTCMonth() - 14);

    const [tickerHistories, benchmarkHistory] = await Promise.all([
      Promise.all(
        tickers.map(async (t) => [t, await getHistoricalCloses(t, from)] as const)
      ),
      getHistoricalCloses(BENCHMARK, from),
    ]);

    const histories = new Map(tickerHistories);

    const result = computeReturns(
      portfolio.holdings,
      histories,
      benchmarkHistory,
      "S&P 500"
    );

    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `Returns computation failed: ${msg}` },
      { status: 500 }
    );
  }
}
