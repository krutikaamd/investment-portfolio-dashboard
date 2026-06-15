import { NextResponse } from "next/server";
import { loadPortfolio } from "@/lib/portfolio-store";
import { getUserId } from "@/lib/user";
import { getEarningsInfo } from "@/lib/yahoo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const portfolio = await loadPortfolio(getUserId());
    const holdingTickers = portfolio.holdings.map((h) => h.ticker.toUpperCase());
    const watchTickers = portfolio.watchlist.map((w) => w.ticker.toUpperCase());
    const holdingSet = new Set(holdingTickers);
    const tickers = Array.from(new Set([...holdingTickers, ...watchTickers]));

    const infos = await Promise.all(
      tickers.map((t) => getEarningsInfo(t).catch(() => null))
    );

    const items = infos
      .filter((e): e is NonNullable<typeof e> => e !== null && !!e.earningsDate)
      .map((e) => ({ ...e, inPortfolio: holdingSet.has(e.ticker) }))
      .sort((a, b) =>
        (a.earningsDate ?? "").localeCompare(b.earningsDate ?? "")
      );

    return NextResponse.json(
      { asOf: new Date().toISOString().slice(0, 10), items },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `Earnings lookup failed: ${msg}` },
      { status: 500 }
    );
  }
}
