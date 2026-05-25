"use client";

import { Stat } from "./Stat";
import { fmtUSD, fmtSignedPct, tone } from "@/lib/utils";
import type { PortfolioValuation } from "@/lib/allocate";

export function PortfolioSummary({ p }: { p: PortfolioValuation }) {
  return (
    <div className="grid grid-cols-2 gap-x-8 gap-y-6 md:grid-cols-4">
      <Stat
        label="Portfolio Value"
        value={fmtUSD(p.totalMarketValue)}
        sub={`${p.holdings.length} positions`}
      />
      <Stat
        label="Total P/L"
        value={fmtUSD(p.totalPL)}
        sub={fmtSignedPct(p.totalPLPct)}
        tone={tone(p.totalPL) as "pos" | "neg" | "neutral"}
      />
      <Stat
        label="Weighted Fair Value"
        value={fmtUSD(p.weightedFairValue)}
        sub="Σ(DCF × shares)"
        tone="accent"
      />
      <Stat
        label="Portfolio MoS"
        value={fmtSignedPct(p.portfolioMarginOfSafety)}
        sub="vs. fair value"
        tone={tone(p.portfolioMarginOfSafety) as "pos" | "neg" | "neutral"}
      />
    </div>
  );
}
