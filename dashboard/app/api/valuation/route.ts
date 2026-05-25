import { NextResponse } from "next/server";
import { getCompanyData, getRiskFreeRate } from "@/lib/yahoo";
import { valuateCompany, sensitivityGrid } from "@/lib/dcf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ticker = searchParams.get("ticker");
  if (!ticker) {
    return NextResponse.json({ error: "ticker required" }, { status: 400 });
  }
  try {
    const [data, rf] = await Promise.all([
      getCompanyData(ticker),
      getRiskFreeRate(),
    ]);
    const dcf = valuateCompany(data, rf);
    const sensitivity = sensitivityGrid(
      dcf.base,
      dcf.base.netDebt,
      dcf.base.sharesOutstanding
    );
    return NextResponse.json({ dcf, sensitivity, riskFreeRate: rf });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `Valuation failed: ${msg}` },
      { status: 500 }
    );
  }
}
