import { NextResponse } from "next/server";
import { loadPortfolio, savePortfolio } from "@/lib/portfolio-store";
import type { Holding } from "@/lib/allocate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface InvestRequest {
  ticker?: unknown;
  shares?: unknown;
  price?: unknown;
}

/**
 * Apply an allocation recommendation: add `shares` of `ticker` at `price` to
 * the portfolio. If the holding already exists, recompute the cost basis as a
 * weighted average of old + new lots; otherwise create the position.
 */
export async function POST(req: Request) {
  let body: InvestRequest;
  try {
    body = (await req.json()) as InvestRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const ticker = String(body.ticker ?? "")
    .toUpperCase()
    .trim();
  const shares = Number(body.shares);
  const price = Number(body.price);

  if (!ticker) {
    return NextResponse.json({ error: "ticker required" }, { status: 400 });
  }
  if (!isFinite(shares) || shares <= 0) {
    return NextResponse.json(
      { error: "shares must be a positive number" },
      { status: 400 }
    );
  }
  if (!isFinite(price) || price <= 0) {
    return NextResponse.json(
      { error: "price must be a positive number" },
      { status: 400 }
    );
  }

  const portfolio = await loadPortfolio();
  const idx = portfolio.holdings.findIndex(
    (h) => h.ticker.toUpperCase() === ticker
  );

  const dollars = shares * price;
  const buyTxn = {
    date: new Date().toISOString().slice(0, 10),
    type: "BUY" as const,
    shares,
    price,
  };
  let updatedHolding: Holding;

  if (idx >= 0) {
    const existing = portfolio.holdings[idx];
    const newShares = existing.shares + shares;
    const newAvgCost =
      newShares > 0
        ? (existing.shares * existing.avgCost + shares * price) / newShares
        : price;
    updatedHolding = {
      ticker: existing.ticker.toUpperCase(),
      shares: newShares,
      avgCost: newAvgCost,
      transactions: [...(existing.transactions ?? []), buyTxn],
    };
    portfolio.holdings[idx] = updatedHolding;
  } else {
    updatedHolding = {
      ticker,
      shares,
      avgCost: price,
      transactions: [buyTxn],
    };
    portfolio.holdings.push(updatedHolding);
  }

  await savePortfolio(portfolio);

  return NextResponse.json({
    ok: true,
    ticker,
    sharesAdded: shares,
    dollarsInvested: dollars,
    pricePerShare: price,
    holding: updatedHolding,
    holdingsCount: portfolio.holdings.length,
  });
}
