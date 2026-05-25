"use client";

import { useState, useMemo } from "react";
import { cn, fmtNum, fmtSignedPct, fmtUSD } from "@/lib/utils";
import type { AllocationRecommendation } from "@/lib/allocate";
import { VerdictBadge } from "./VerdictBadge";
import { ArrowUpRight, ArrowDownRight, Minus, Sparkles } from "lucide-react";

interface Props {
  cash: number;
  setCash: (n: number) => void;
  recommendations: AllocationRecommendation[];
  cashDeployed: number;
  cashRemaining: number;
  loading?: boolean;
}

const QUICK_AMOUNTS = [1000, 2500, 5000, 10000, 25000];

export function AllocationPanel({
  cash,
  setCash,
  recommendations,
  cashDeployed,
  cashRemaining,
  loading = false,
}: Props) {
  const [draft, setDraft] = useState(String(cash));

  const sorted = useMemo(
    () =>
      [...recommendations].sort((a, b) => b.dollarsToAdd - a.dollarsToAdd),
    [recommendations]
  );

  function commit(val: number) {
    setCash(val);
    setDraft(String(val));
  }

  return (
    <div className="card overflow-hidden">
      <div className="relative overflow-hidden border-b border-line bg-gradient-to-br from-accent/20 via-bg-card to-bg-card">
        <div className="absolute -top-12 -right-12 h-40 w-40 rounded-full bg-accent/30 blur-3xl pointer-events-none" />
        <div className="relative p-6 space-y-5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent-glow" />
            <span className="label-eyebrow text-accent-glow">
              How much do you want to invest today?
            </span>
          </div>
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="relative flex-1">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl text-ink-fade">
                $
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={draft}
                onChange={(e) => setDraft(e.target.value.replace(/[^\d.]/g, ""))}
                onBlur={() => {
                  const n = parseFloat(draft);
                  commit(isFinite(n) && n >= 0 ? n : 0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const n = parseFloat(draft);
                    commit(isFinite(n) && n >= 0 ? n : 0);
                  }
                }}
                className="w-full rounded-xl border border-line bg-bg-elev pl-10 pr-4 py-4 text-3xl font-semibold tracking-tight text-ink num focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 transition"
                placeholder="5,000"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {QUICK_AMOUNTS.map((amt) => (
                <button
                  key={amt}
                  onClick={() => commit(amt)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-xs font-medium transition",
                    cash === amt
                      ? "border-accent/60 bg-accent/15 text-accent-glow"
                      : "border-line bg-bg-elev hover:border-line-strong hover:bg-bg-hover text-ink-dim"
                  )}
                >
                  ${(amt / 1000).toFixed(amt >= 10000 ? 0 : 1)}k
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-6 text-xs text-ink-dim">
            <div>
              <span className="label-eyebrow">Deployed</span>
              <div className="text-lg font-semibold text-ink num mt-1">
                {fmtUSD(cashDeployed)}
              </div>
            </div>
            <div>
              <span className="label-eyebrow">Remaining</span>
              <div className="text-lg font-semibold text-ink num mt-1">
                {fmtUSD(cashRemaining)}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="divide-y divide-line/60">
        {loading && (
          <div className="px-6 py-10 text-center text-ink-fade text-sm">
            Computing live DCF across portfolio…
          </div>
        )}
        {!loading && sorted.map((r) => (
          <RecommendationRow key={r.ticker} r={r} />
        ))}
        {!loading && sorted.length === 0 && (
          <div className="px-6 py-10 text-center text-ink-fade text-sm">
            Enter an amount to see recommendations.
          </div>
        )}
      </div>
    </div>
  );
}

function RecommendationRow({ r }: { r: AllocationRecommendation }) {
  const isBuy = r.action === "OVERWEIGHT" || r.action === "INITIATE";
  const isTrim = r.action === "TRIM" || r.action === "UNDERWEIGHT";
  return (
    <div className="px-6 py-4 flex items-center gap-4 hover:bg-bg-hover transition">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-bg-elev">
        {isBuy && <ArrowUpRight className="h-4 w-4 text-pos" />}
        {isTrim && <ArrowDownRight className="h-4 w-4 text-warn" />}
        {!isBuy && !isTrim && <Minus className="h-4 w-4 text-ink-fade" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{r.ticker}</span>
          <VerdictBadge verdict={r.action} />
          <span
            className={cn(
              "text-xs num",
              r.marginOfSafety > 0 ? "text-pos" : "text-neg"
            )}
          >
            MoS {fmtSignedPct(r.marginOfSafety)}
          </span>
        </div>
        <div className="text-[12px] text-ink-fade mt-0.5 truncate">{r.reason}</div>
      </div>
      <div className="text-right">
        <div className="num font-semibold">
          {r.dollarsToAdd > 0 ? `+${fmtUSD(r.dollarsToAdd)}` : "—"}
        </div>
        <div className="text-[11px] text-ink-fade num">
          {r.sharesToAdd > 0
            ? `${fmtNum(r.sharesToAdd, r.sharesToAdd < 1 ? 4 : 2)} shares`
            : ""}
        </div>
      </div>
    </div>
  );
}
