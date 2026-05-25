import { NextResponse } from "next/server";
import { loadPortfolio } from "@/lib/portfolio-store";
import { getCompanyData, getRiskFreeRate } from "@/lib/yahoo";
import { valuateCompany } from "@/lib/dcf";
import { allocate, valuePortfolio } from "@/lib/allocate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const cash = Number(searchParams.get("cash") ?? 0);

  try {
    const portfolio = await loadPortfolio();
    const rf = await getRiskFreeRate();

    const dcfs = await Promise.all(
      portfolio.holdings.map(async (h) => {
        const data = await getCompanyData(h.ticker);
        return valuateCompany(data, rf);
      })
    );

    const valued = valuePortfolio(portfolio.holdings, dcfs);
    const allocation = allocate(valued, cash);

    return NextResponse.json({
      riskFreeRate: rf,
      portfolio: valued,
      allocation,
      dcfs,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `Allocation failed: ${msg}` },
      { status: 500 }
    );
  }
}
