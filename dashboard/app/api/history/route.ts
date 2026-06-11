import { NextResponse } from "next/server";
import { getHistoricalCloses } from "@/lib/yahoo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Daily closes for a single ticker over the trailing `months` window. Used by
 * the per-stock dropdown to render a compact price sparkline.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const ticker = (searchParams.get("ticker") ?? "").trim().toUpperCase();
    if (!ticker) {
      return NextResponse.json({ error: "ticker required" }, { status: 400 });
    }
    const months = Math.min(
      Math.max(Number(searchParams.get("months") ?? 6), 1),
      60
    );

    const from = new Date();
    from.setUTCMonth(from.getUTCMonth() - months);

    const bars = await getHistoricalCloses(ticker, from);
    const first = bars[0]?.close ?? null;
    const last = bars[bars.length - 1]?.close ?? null;

    return NextResponse.json(
      {
        ticker,
        months,
        bars,
        changePct: first && last ? last / first - 1 : null,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `History fetch failed: ${msg}` },
      { status: 500 }
    );
  }
}
