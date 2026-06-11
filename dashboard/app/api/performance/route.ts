import { NextResponse } from "next/server";
import { loadPortfolio } from "@/lib/portfolio-store";
import { getHistoricalCloses } from "@/lib/yahoo";
import { computePerformanceSeries } from "@/lib/performance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BENCHMARKS: Record<string, { symbol: string; label: string }> = {
  "^GSPC": { symbol: "^GSPC", label: "S&P 500" },
  QQQ: { symbol: "QQQ", label: "Nasdaq 100" },
  "^DJI": { symbol: "^DJI", label: "Dow Jones" },
  XLK: { symbol: "XLK", label: "Tech (XLK)" },
  SOXX: { symbol: "SOXX", label: "Semis (SOXX)" },
  IWM: { symbol: "IWM", label: "Russell 2000" },
};
const DEFAULT_BENCHMARK = "^GSPC";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const months = Math.min(
      Math.max(Number(searchParams.get("months") ?? 6), 1),
      60
    );
    const benchKey = (searchParams.get("benchmark") ?? DEFAULT_BENCHMARK).toUpperCase();
    const bench = BENCHMARKS[benchKey] ?? BENCHMARKS[DEFAULT_BENCHMARK];

    const portfolio = await loadPortfolio();
    const tickers = portfolio.holdings.map((h) => h.ticker.toUpperCase());
    if (tickers.length === 0) {
      return NextResponse.json({
        points: [],
        startDate: null,
        endDate: null,
        startValue: 0,
        endValue: 0,
        portfolioReturnPct: null,
        benchmarkReturnPct: null,
        benchmarkLabel: bench.label,
        coverage: 0,
      });
    }

    // Pull a little extra history so closeOnOrBefore has a value at the window
    // start even if it lands on a non-trading day.
    const from = new Date();
    from.setUTCMonth(from.getUTCMonth() - months);
    const fetchFrom = new Date(from);
    fetchFrom.setUTCDate(fetchFrom.getUTCDate() - 10);
    const fromIso = from.toISOString().slice(0, 10);

    const [tickerHistories, benchmarkHistory] = await Promise.all([
      Promise.all(
        tickers.map(
          async (t) => [t, await getHistoricalCloses(t, fetchFrom)] as const
        )
      ),
      getHistoricalCloses(bench.symbol, fetchFrom),
    ]);

    const histories = new Map(tickerHistories);
    const result = computePerformanceSeries(
      portfolio.holdings,
      histories,
      benchmarkHistory,
      fromIso,
      bench.label
    );

    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `Performance computation failed: ${msg}` },
      { status: 500 }
    );
  }
}
