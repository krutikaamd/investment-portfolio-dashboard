import { NextResponse } from "next/server";
import { loadPortfolio, savePortfolio } from "@/lib/portfolio-store";
import { getUserId } from "@/lib/user";
import type { Holding } from "@/lib/allocate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const p = await loadPortfolio(getUserId());
  return NextResponse.json(p);
}

interface HoldingInput {
  ticker?: unknown;
  shares?: unknown;
  avgCost?: unknown;
}

export async function PUT(req: Request) {
  const body = (await req.json()) as {
    holdings?: HoldingInput[];
  };
  if (!body.holdings || !Array.isArray(body.holdings)) {
    return NextResponse.json(
      { error: "holdings array required" },
      { status: 400 }
    );
  }
  const cleaned: Holding[] = body.holdings
    .filter((h): h is HoldingInput => typeof h === "object" && h !== null)
    .map((h) => ({
      ticker: String(h.ticker ?? "").toUpperCase().trim(),
      shares: Number(h.shares ?? 0),
      avgCost: Number(h.avgCost ?? 0),
    }))
    .filter((h) => h.ticker && h.shares > 0);

  const userId = getUserId();
  const existing = await loadPortfolio(userId);
  await savePortfolio(userId, {
    baseCurrency: "USD",
    holdings: cleaned,
    watchlist: existing.watchlist,
  });
  return NextResponse.json({ ok: true, holdings: cleaned });
}
