"use client";

import { useState, useMemo } from "react";
import { cn, fmtNum, fmtSignedPct, fmtUSD } from "@/lib/utils";
import type { AllocationRecommendation } from "@/lib/allocate";
import { VerdictBadge } from "./VerdictBadge";
import {
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Sparkles,
  Check,
  Loader2,
  Eye,
} from "lucide-react";

interface Props {
  cash: number;
  setCash: (n: number) => void;
  recommendations: AllocationRecommendation[];
  cashDeployed: number;
  cashRemaining: number;
  loading?: boolean;
  onInvested?: () => void;
}

const QUICK_AMOUNTS = [1000, 2500, 5000, 10000, 25000];

export function AllocationPanel({
  cash,
  setCash,
  recommendations,
  cashDeployed,
  cashRemaining,
  loading = false,
  onInvested,
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
        <div className="relative p-4 sm:p-6 space-y-5">
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
                className="w-full rounded-xl border border-line bg-bg-elev pl-10 pr-4 py-3.5 sm:py-4 text-2xl sm:text-3xl font-semibold tracking-tight text-ink num focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 transition"
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
          <RecommendationRow key={r.ticker} r={r} onInvested={onInvested} />
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

type InvestState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "done"; sharesAdded: number; dollars: number }
  | { kind: "error"; msg: string };

function RecommendationRow({
  r,
  onInvested,
}: {
  r: AllocationRecommendation;
  onInvested?: () => void;
}) {
  const isBuy = r.action === "OVERWEIGHT" || r.action === "INITIATE";
  const isTrim = r.action === "TRIM" || r.action === "UNDERWEIGHT";
  const [state, setState] = useState<InvestState>({ kind: "idle" });

  const canInvest = isBuy && r.dollarsToAdd > 0 && r.sharesToAdd > 0;
  const pricePerShare =
    r.sharesToAdd > 0 ? r.dollarsToAdd / r.sharesToAdd : 0;

  async function invest() {
    if (!canInvest || state.kind === "loading") return;
    const sharesPretty = fmtNum(r.sharesToAdd, r.sharesToAdd < 1 ? 4 : 2);
    const ok = window.confirm(
      `Add ${sharesPretty} shares of ${r.ticker} at ${fmtUSD(pricePerShare)} ` +
        `(≈ ${fmtUSD(r.dollarsToAdd)}) to your portfolio?\n\n` +
        `This will update your holdings and recompute allocation.`
    );
    if (!ok) return;
    setState({ kind: "loading" });
    try {
      const resp = await fetch("/api/portfolio/invest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: r.ticker,
          shares: r.sharesToAdd,
          price: pricePerShare,
        }),
      });
      const j = (await resp.json().catch(() => ({}))) as {
        error?: string;
        sharesAdded?: number;
        dollarsInvested?: number;
      };
      if (!resp.ok) {
        throw new Error(j.error ?? `Invest failed (${resp.status})`);
      }
      setState({
        kind: "done",
        sharesAdded: j.sharesAdded ?? r.sharesToAdd,
        dollars: j.dollarsInvested ?? r.dollarsToAdd,
      });
      // Refresh allocations after a short pause so the user sees the
      // success state on the button before it re-renders.
      setTimeout(() => onInvested?.(), 600);
    } catch (e) {
      setState({
        kind: "error",
        msg: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return (
    <div className="px-4 sm:px-6 py-4 flex flex-wrap items-start gap-x-3 gap-y-3 sm:items-center sm:gap-4 hover:bg-bg-hover transition">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-bg-elev">
        {isBuy && <ArrowUpRight className="h-4 w-4 text-pos" />}
        {isTrim && <ArrowDownRight className="h-4 w-4 text-warn" />}
        {!isBuy && !isTrim && <Minus className="h-4 w-4 text-ink-fade" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold">{r.ticker}</span>
          <VerdictBadge verdict={r.action} />
          {r.fromWatchlist && (
            <span
              className="inline-flex items-center gap-1 rounded-md bg-cyan/15 text-cyan ring-1 ring-cyan/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
              title="From your watchlist (not currently held)"
            >
              <Eye className="h-2.5 w-2.5" />
              Watchlist
            </span>
          )}
          <span
            className={cn(
              "rounded-md px-1.5 py-0.5 text-sm font-semibold num text-ink ring-1",
              r.marginOfSafety > 0
                ? "bg-pos/20 ring-pos/50"
                : "bg-neg/20 ring-neg/50"
            )}
          >
            MoS {fmtSignedPct(r.marginOfSafety)}
          </span>
        </div>
        <div className="text-[12px] text-ink-dim mt-1 line-clamp-2 sm:truncate">
          {r.reason}
        </div>
        {state.kind === "error" && (
          <div className="text-[11px] text-neg mt-1">⚠ {state.msg}</div>
        )}
      </div>
      {/* Amounts + Invest button: full-width second line on mobile, inline on
          desktop. Indented to align under the text column on mobile. */}
      <div className="flex w-full items-center justify-between gap-3 pl-12 sm:w-auto sm:justify-end sm:pl-0">
        <div className="text-left sm:text-right">
          <div className="num font-semibold">
            {r.dollarsToAdd > 0 ? `+${fmtUSD(r.dollarsToAdd)}` : "—"}
          </div>
          <div className="text-[11px] text-ink-dim num">
            {r.sharesToAdd > 0
              ? `${fmtNum(r.sharesToAdd, r.sharesToAdd < 1 ? 4 : 2)} shares @ ${fmtUSD(pricePerShare)}`
              : ""}
          </div>
        </div>
        {canInvest && (
          <button
            onClick={invest}
            disabled={state.kind === "loading" || state.kind === "done"}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-wider ring-1 transition shrink-0",
              state.kind === "done"
                ? "bg-pos/20 text-pos ring-pos/50 cursor-default"
                : state.kind === "loading"
                  ? "bg-accent/15 text-accent-glow ring-accent/40 cursor-wait"
                  : "bg-accent text-white ring-accent/60 hover:bg-accent/90 shadow-glow"
            )}
            title={
              state.kind === "done"
                ? "Already invested"
                : `Invest ${fmtUSD(r.dollarsToAdd)} into ${r.ticker}`
            }
          >
            {state.kind === "loading" && (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            )}
            {state.kind === "done" && <Check className="h-3.5 w-3.5" />}
            {state.kind === "done"
              ? "Invested"
              : state.kind === "loading"
                ? "Investing…"
                : "Invest"}
          </button>
        )}
      </div>
    </div>
  );
}
