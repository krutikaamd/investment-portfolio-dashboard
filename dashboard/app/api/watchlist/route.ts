import { NextResponse } from "next/server";
import {
  loadPortfolio,
  savePortfolio,
  type WatchlistItem,
} from "@/lib/portfolio-store";
import { getCompanyData, getRiskFreeRate } from "@/lib/yahoo";
import { valuateCompany, type DcfResult } from "@/lib/dcf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface ValuedWatchlistItem extends WatchlistItem {
  dcf: DcfResult;
  performanceSinceAdded: number;
  daysHeld: number;
}

async function valueWatchlist(
  items: WatchlistItem[]
): Promise<ValuedWatchlistItem[]> {
  if (items.length === 0) return [];
  const rf = await getRiskFreeRate();
  const valued = await Promise.all(
    items.map(async (item) => {
      const data = await getCompanyData(item.ticker);
      const dcf = valuateCompany(data, rf);
      const price = dcf.snapshot.price;
      const perf =
        item.addedAtPrice > 0 ? (price - item.addedAtPrice) / item.addedAtPrice : 0;
      const days = Math.max(
        0,
        Math.floor(
          (Date.now() - new Date(item.addedAt).getTime()) / 86_400_000
        )
      );
      return {
        ...item,
        dcf,
        performanceSinceAdded: perf,
        daysHeld: days,
      };
    })
  );
  return valued;
}

export async function GET() {
  try {
    const portfolio = await loadPortfolio();
    const valued = await valueWatchlist(portfolio.watchlist);
    return NextResponse.json(
      { items: valued },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `Watchlist fetch failed: ${msg}` },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { ticker?: string; note?: string };
    const tickerRaw = (body.ticker ?? "").trim().toUpperCase();
    if (!tickerRaw) {
      return NextResponse.json(
        { error: "ticker is required" },
        { status: 400 }
      );
    }
    const portfolio = await loadPortfolio();
    if (portfolio.watchlist.some((w) => w.ticker.toUpperCase() === tickerRaw)) {
      return NextResponse.json(
        { error: `${tickerRaw} is already on the watchlist` },
        { status: 409 }
      );
    }

    let data;
    try {
      data = await getCompanyData(tickerRaw);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json(
        { error: `Couldn't resolve ${tickerRaw} on Yahoo Finance: ${msg}` },
        { status: 404 }
      );
    }

    const price = data.snapshot.price;
    if (!price || !isFinite(price)) {
      return NextResponse.json(
        { error: `No live price returned for ${tickerRaw}` },
        { status: 422 }
      );
    }

    const item: WatchlistItem = {
      ticker: tickerRaw,
      addedAt: new Date().toISOString(),
      addedAtPrice: price,
      ...(body.note ? { note: body.note } : {}),
    };
    portfolio.watchlist.push(item);
    await savePortfolio(portfolio);
    return NextResponse.json({ added: item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `Add failed: ${msg}` },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const ticker = (searchParams.get("ticker") ?? "").trim().toUpperCase();
    if (!ticker) {
      return NextResponse.json(
        { error: "ticker query param is required" },
        { status: 400 }
      );
    }
    const portfolio = await loadPortfolio();
    const before = portfolio.watchlist.length;
    portfolio.watchlist = portfolio.watchlist.filter(
      (w) => w.ticker.toUpperCase() !== ticker
    );
    if (portfolio.watchlist.length === before) {
      return NextResponse.json(
        { error: `${ticker} is not on the watchlist` },
        { status: 404 }
      );
    }
    await savePortfolio(portfolio);
    return NextResponse.json({ removed: ticker });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `Remove failed: ${msg}` },
      { status: 500 }
    );
  }
}
