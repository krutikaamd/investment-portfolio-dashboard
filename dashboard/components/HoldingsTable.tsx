"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { cn, fmtNum, fmtPct, fmtSignedPct, fmtUSD, tone } from "@/lib/utils";
import type { ValuedHolding } from "@/lib/allocate";
import { VerdictBadge } from "./VerdictBadge";

interface Props {
  holdings: ValuedHolding[];
  onSelect: (ticker: string) => void;
  selectedTicker?: string | null;
}

export function HoldingsTable({ holdings, onSelect, selectedTicker }: Props) {
  const sortedHoldings = [...holdings].sort(
    (a, b) => b.marketValue - a.marketValue
  );
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-line">
        <h2 className="text-sm font-semibold tracking-wide">Holdings</h2>
        <span className="label-eyebrow">Live • Yahoo Finance</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-ink-fade label-eyebrow border-b border-line">
              <th className="px-5 py-3 font-medium">Ticker</th>
              <th className="px-3 py-3 font-medium">Price</th>
              <th className="px-3 py-3 font-medium text-right">P/E</th>
              <th className="px-3 py-3 font-medium text-right">Div Y</th>
              <th className="px-3 py-3 font-medium text-right">Beta</th>
              <th className="px-3 py-3 font-medium text-right">Shares</th>
              <th className="px-3 py-3 font-medium text-right">Mkt Value</th>
              <th className="px-3 py-3 font-medium text-right">P/L</th>
              <th className="px-3 py-3 font-medium text-right">DCF Fair</th>
              <th className="px-3 py-3 font-medium text-right">Analyst</th>
              <th className="px-3 py-3 font-medium text-right">MoS</th>
              <th className="px-3 py-3 font-medium text-right">WACC</th>
              <th className="px-3 py-3 font-medium text-right">Weight</th>
              <th className="px-5 py-3 font-medium">Verdict</th>
              <th className="px-3 py-3 font-medium text-right">Model</th>
            </tr>
          </thead>
          <tbody>
            {sortedHoldings.map((h) => {
              const mosTone = tone(h.dcf.marginOfSafety);
              const plTone = tone(h.unrealisedPL);
              const isSel = selectedTicker === h.dcf.ticker;
              return (
                <tr
                  key={h.dcf.ticker}
                  onClick={() => onSelect(h.dcf.ticker)}
                  className={cn(
                    "border-b border-line/60 hover:bg-bg-hover transition-colors cursor-pointer",
                    isSel && "bg-bg-hover"
                  )}
                >
                  <td className="px-5 py-3.5">
                    <div className="flex flex-col gap-0.5">
                      <Link
                        href={`/stock/${encodeURIComponent(h.dcf.ticker)}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 font-semibold text-accent-glow hover:underline w-fit"
                        title={`Open full DCF model for ${h.dcf.ticker}`}
                      >
                        {h.dcf.ticker}
                        <ExternalLink className="h-3 w-3 opacity-70" />
                      </Link>
                      <span className="text-[11px] text-ink-dim truncate max-w-[160px]">
                        {h.dcf.snapshot.longName}
                      </span>
                      {h.dcf.snapshot.sector && (
                        <span className="inline-flex w-fit text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-bg-elev text-ink-dim border border-line/60">
                          {h.dcf.snapshot.sector}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3.5 num">
                    {fmtUSD(h.dcf.snapshot.price)}
                  </td>
                  <td className="px-3 py-3.5 text-right num text-ink-dim">
                    {h.dcf.snapshot.trailingPE
                      ? fmtNum(h.dcf.snapshot.trailingPE, 1)
                      : "—"}
                  </td>
                  <td className="px-3 py-3.5 text-right num text-ink-dim">
                    {h.dcf.snapshot.dividendYield !== null &&
                    h.dcf.snapshot.dividendYield !== undefined
                      ? fmtPct(h.dcf.snapshot.dividendYield, 2)
                      : "—"}
                  </td>
                  <td className="px-3 py-3.5 text-right num text-ink-dim">
                    {h.dcf.snapshot.beta !== null &&
                    h.dcf.snapshot.beta !== undefined
                      ? fmtNum(h.dcf.snapshot.beta, 2)
                      : "—"}
                  </td>
                  <td className="px-3 py-3.5 text-right num text-ink-dim">
                    {fmtNum(h.holding.shares, 0)}
                  </td>
                  <td className="px-3 py-3.5 text-right num font-medium">
                    {fmtUSD(h.marketValue)}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-3.5 text-right num",
                      plTone === "pos" && "text-pos",
                      plTone === "neg" && "text-neg"
                    )}
                  >
                    <div>{fmtUSD(h.unrealisedPL)}</div>
                    <div className="text-[11px] opacity-80">
                      {fmtSignedPct(h.unrealisedPLPct)}
                    </div>
                  </td>
                  <td className="px-3 py-3.5 text-right num text-accent-glow">
                    <div className="flex items-center justify-end gap-1.5">
                      {h.dcf.consensusFlag === "ALERT" && (
                        <span
                          title={
                            h.dcf.consensusDiagnosis ??
                            "DCF deviates >50% from analyst consensus"
                          }
                          className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-neg/20 text-neg leading-none"
                        >
                          ⚠ ALERT
                        </span>
                      )}
                      {h.dcf.consensusFlag === "WARN" && (
                        <span
                          title={
                            h.dcf.consensusDiagnosis ??
                            "DCF deviates 25-50% from analyst consensus"
                          }
                          className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-warn/20 text-warn leading-none"
                        >
                          WARN
                        </span>
                      )}
                      <span>{fmtUSD(h.dcf.fairValue)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3.5 text-right num text-ink-dim">
                    {h.dcf.snapshot.analystTargetMean
                      ? fmtUSD(h.dcf.snapshot.analystTargetMean)
                      : "—"}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-3.5 text-right num font-semibold",
                      mosTone === "pos" && "text-pos",
                      mosTone === "neg" && "text-neg"
                    )}
                  >
                    {fmtSignedPct(h.dcf.marginOfSafety)}
                  </td>
                  <td className="px-3 py-3.5 text-right num text-ink-dim">
                    {fmtPct(h.dcf.wacc.wacc, 2)}
                  </td>
                  <td className="px-3 py-3.5 text-right num">
                    <WeightCell
                      current={h.currentWeight}
                      target={h.fairWeight}
                    />
                  </td>
                  <td className="px-5 py-3.5">
                    <VerdictBadge verdict={h.dcf.verdict} />
                  </td>
                  <td className="px-3 py-3.5 text-right">
                    <Link
                      href={`/stock/${encodeURIComponent(h.dcf.ticker)}`}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1 text-[11px] font-semibold text-accent-glow hover:bg-accent/20 transition"
                      title={`Open full DCF model for ${h.dcf.ticker}`}
                    >
                      Open
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WeightCell({ current, target }: { current: number; target: number }) {
  const delta = target - current;
  return (
    <div className="flex flex-col items-end leading-tight">
      <span>{fmtPct(current)}</span>
      <span
        className={cn(
          "text-[11px]",
          delta > 0.005 ? "text-pos" : delta < -0.005 ? "text-warn" : "text-ink-fade"
        )}
      >
        → {fmtPct(target)}
      </span>
    </div>
  );
}
