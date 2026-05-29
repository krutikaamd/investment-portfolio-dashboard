import { NextResponse } from "next/server";
import { loadPortfolio } from "@/lib/portfolio-store";
import { getCompanyNews, getPortfolioNews } from "@/lib/yahoo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ticker = searchParams.get("ticker");
  const perTicker = Math.min(
    Math.max(Number(searchParams.get("perTicker") ?? 8), 1),
    15
  );
  const topN = Math.min(Math.max(Number(searchParams.get("topN") ?? 10), 1), 50);

  try {
    if (ticker) {
      // Single-ticker mode — used by the per-stock deep-dive page.
      const items = await getCompanyNews(ticker.toUpperCase(), topN);
      return NextResponse.json(
        {
          asOf: new Date().toISOString(),
          tickers: [ticker.toUpperCase()],
          items,
        },
        { headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    }
    const portfolio = await loadPortfolio();
    const tickers = portfolio.holdings.map((h) => h.ticker.toUpperCase());
    const news = await getPortfolioNews(tickers, perTicker, topN);
    return NextResponse.json(
      {
        asOf: new Date().toISOString(),
        tickers,
        items: news,
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `News fetch failed: ${msg}` },
      { status: 500 }
    );
  }
}
