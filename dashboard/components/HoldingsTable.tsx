"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { ChevronDown, ExternalLink } from "lucide-react";
import { cn, fmtNum, fmtPct, fmtSignedPct, fmtUSD, tone } from "@/lib/utils";
import type { Transaction, ValuedHolding } from "@/lib/allocate";
import { VerdictBadge } from "./VerdictBadge";
import { MiniPriceChart } from "./MiniPriceChart";

const COL_SPAN = 14;

interface Props {
  holdings: ValuedHolding[];
  onSelect: (ticker: string) => void;
  selectedTicker?: string | null;
}

export function HoldingsTable({ holdings, onSelect, selectedTicker }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
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
              <th className="px-3 py-3 font-medium text-right hidden lg:table-cell">P/E</th>
              <th className="px-3 py-3 font-medium text-right hidden lg:table-cell">Beta</th>
              <th className="px-3 py-3 font-medium text-right hidden md:table-cell">Shares</th>
              <th className="px-3 py-3 font-medium text-right hidden sm:table-cell">Mkt Value</th>
              <th className="px-3 py-3 font-medium text-right">P/L</th>
              <th className="px-3 py-3 font-medium text-right">DCF Fair</th>
              <th className="px-3 py-3 font-medium text-right hidden lg:table-cell">Analyst</th>
              <th className="px-3 py-3 font-medium text-right">MoS</th>
              <th className="px-3 py-3 font-medium text-right hidden md:table-cell">Weight</th>
              <th className="px-5 py-3 font-medium hidden sm:table-cell">Verdict</th>
              <th className="px-3 py-3 font-medium text-right hidden sm:table-cell">Model</th>
              <th className="px-3 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {sortedHoldings.map((h) => {
              const mosTone = tone(h.dcf.marginOfSafety);
              const plTone = tone(h.unrealisedPL);
              const isSel = selectedTicker === h.dcf.ticker;
              const isOpen = expanded === h.dcf.ticker;
              return (
                <Fragment key={h.dcf.ticker}>
                <tr
                  onClick={() => onSelect(h.dcf.ticker)}
                  className={cn(
                    "border-b border-line/60 hover:bg-bg-hover transition-colors cursor-pointer",
                    (isSel || isOpen) && "bg-bg-hover"
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
                  <td className="px-3 py-3.5 text-right num text-ink-dim hidden lg:table-cell">
                    {h.dcf.snapshot.trailingPE
                      ? fmtNum(h.dcf.snapshot.trailingPE, 1)
                      : "—"}
                  </td>
                  <td className="px-3 py-3.5 text-right num text-ink-dim hidden lg:table-cell">
                    {h.dcf.snapshot.beta !== null &&
                    h.dcf.snapshot.beta !== undefined
                      ? fmtNum(h.dcf.snapshot.beta, 2)
                      : "—"}
                  </td>
                  <td className="px-3 py-3.5 text-right num text-ink-dim hidden md:table-cell">
                    {fmtNum(h.holding.shares, 0)}
                  </td>
                  <td className="px-3 py-3.5 text-right num font-medium hidden sm:table-cell">
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
                  <td className="px-3 py-3.5 text-right num text-ink-dim hidden lg:table-cell">
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
                  <td className="px-3 py-3.5 text-right num hidden md:table-cell">
                    <WeightCell
                      current={h.currentWeight}
                      target={h.fairWeight}
                    />
                  </td>
                  <td className="px-5 py-3.5 hidden sm:table-cell">
                    <VerdictBadge verdict={h.dcf.verdict} />
                  </td>
                  <td className="px-3 py-3.5 text-right hidden sm:table-cell">
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
                  <td className="px-3 py-3.5 text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpanded(isOpen ? null : h.dcf.ticker);
                      }}
                      title={isOpen ? "Hide details" : "Show 6-month chart & transactions"}
                      aria-expanded={isOpen}
                      className="inline-flex items-center justify-center h-6 w-6 rounded text-ink-fade hover:text-ink hover:bg-bg-elev transition"
                    >
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 transition-transform",
                          isOpen && "rotate-180"
                        )}
                      />
                    </button>
                  </td>
                </tr>
                {isOpen && (
                  <tr className="border-b border-line/60 bg-bg-elev/30">
                    <td colSpan={COL_SPAN} className="px-5 py-5">
                      <HoldingDetail h={h} />
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HoldingDetail({ h }: { h: ValuedHolding }) {
  const txns = h.holding.transactions ?? [];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
      <div className="card-elev p-4">
        <MiniPriceChart ticker={h.dcf.ticker} months={6} />
      </div>
      <TransactionLedger txns={txns} avgCost={h.holding.avgCost} shares={h.holding.shares} />
    </div>
  );
}

function TransactionLedger({
  txns,
  avgCost,
  shares,
}: {
  txns: Transaction[];
  avgCost: number;
  shares: number;
}) {
  const sorted = [...txns].sort((a, b) => a.date.localeCompare(b.date));
  return (
    <div className="card-elev overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-line/60">
        <span className="label-eyebrow">Transaction History</span>
        <span className="text-[11px] text-ink-dim num">
          {fmtNum(shares, 2)} sh · avg cost {fmtUSD(avgCost)}
        </span>
      </div>
      {sorted.length === 0 ? (
        <div className="px-4 py-6 text-[12px] text-ink-fade">
          No recorded transactions for this position yet. Buys made via the
          INVEST button are logged here automatically.
        </div>
      ) : (
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-ink-fade border-b border-line/60">
              <th className="px-4 py-2 font-medium">Date</th>
              <th className="px-4 py-2 font-medium">Action</th>
              <th className="px-4 py-2 font-medium text-right">Shares</th>
              <th className="px-4 py-2 font-medium text-right">Price</th>
              <th className="px-4 py-2 font-medium text-right">Value</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((t, i) => {
              const isBuy = t.type === "BUY";
              return (
                <tr key={i} className="border-b border-line/40 last:border-0">
                  <td className="px-4 py-2.5 num text-ink-dim">
                    {new Date(t.date).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={cn(
                        "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide",
                        isBuy ? "bg-pos/15 text-pos" : "bg-warn/15 text-warn"
                      )}
                    >
                      {t.type}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right num">
                    {fmtNum(t.shares, 2)}
                  </td>
                  <td className="px-4 py-2.5 text-right num">
                    {fmtUSD(t.price)}
                  </td>
                  <td className="px-4 py-2.5 text-right num text-ink-dim">
                    {fmtUSD(t.shares * t.price)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
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
