"use client";

import { useEffect, useState } from "react";
import { LineChart, RefreshCw } from "lucide-react";
import { cn, fmtSignedPct, fmtUSD } from "@/lib/utils";

interface PeriodReturn {
  key: string;
  label: string;
  startDate: string | null;
  endDate: string | null;
  startValue: number;
  endValue: number;
  returnPct: number | null;
  dollarChange: number | null;
  benchmarkReturnPct: number | null;
  benchmarkLabel: string;
  coverage: number;
}

interface ReturnsResponse {
  asOf: string;
  benchmarkLabel: string;
  totalCurrentValue: number;
  periods: PeriodReturn[];
  error?: string;
}

export function ReturnsRibbon() {
  const [data, setData] = useState<ReturnsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/returns?t=${Date.now()}`, {
        cache: "no-store",
      });
      const j = (await r.json()) as ReturnsResponse;
      if (!r.ok) throw new Error(j.error ?? `Returns failed (${r.status})`);
      setData(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-line">
        <div className="flex items-center gap-2.5">
          <LineChart className="h-4 w-4 text-cyan" />
          <h2 className="text-sm font-semibold tracking-wide">
            Look-Through Returns
          </h2>
          <span className="label-eyebrow">
            current basket · vs S&amp;P 500
          </span>
        </div>
        <div className="flex items-center gap-3">
          {data && (
            <span className="text-[11px] text-ink-dim hidden md:inline">
              as of {data.asOf}
            </span>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-bg-elev px-2.5 py-1.5 text-[11px] font-medium text-ink-dim hover:text-ink hover:border-line-strong disabled:opacity-50 transition"
          >
            <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="px-5 py-6 text-sm text-neg">{error}</div>
      )}
      {!error && !data && loading && (
        <div className="px-5 py-6 text-sm text-ink-dim">
          Pulling 5y of daily closes for each holding…
        </div>
      )}
      {data && data.periods.length === 0 && (
        <div className="px-5 py-6 text-sm text-ink-dim">
          Add holdings to see returns.
        </div>
      )}
      {data && data.periods.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-line divide-y divide-x lg:divide-y-0">
          {data.periods.map((p) => (
            <ReturnCell key={p.key} p={p} />
          ))}
        </div>
      )}

      {data && data.periods.length > 0 && (
        <div className="px-5 py-2.5 border-t border-line text-[11px] text-ink-dim leading-relaxed">
          <strong className="text-ink">Look-through</strong> = assumes your{" "}
          current holdings were held for the whole window. Not a true
          time-weighted return (would need transaction history) but a useful
          quick read on how today&apos;s basket has performed historically.
        </div>
      )}
    </section>
  );
}

function ReturnCell({ p }: { p: PeriodReturn }) {
  const noData = p.returnPct === null;
  const positive = (p.returnPct ?? 0) > 0;
  const negative = (p.returnPct ?? 0) < 0;
  const vsBench =
    p.returnPct !== null && p.benchmarkReturnPct !== null
      ? p.returnPct - p.benchmarkReturnPct
      : null;
  const beatBench = vsBench !== null && vsBench > 0;

  return (
    <div
      className={cn(
        "p-4 flex flex-col gap-1.5",
        positive && "bg-pos/[0.04]",
        negative && "bg-neg/[0.04]"
      )}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-ink-dim">
          {p.key}
        </span>
        {p.coverage < 0.99 && p.coverage > 0 && (
          <span
            className="text-[9px] text-warn"
            title={`Only ${(p.coverage * 100).toFixed(0)}% of portfolio market value has full data for this window (newer positions excluded).`}
          >
            {(p.coverage * 100).toFixed(0)}% cov.
          </span>
        )}
      </div>
      <div
        className={cn(
          "text-xl font-semibold num leading-none",
          noData
            ? "text-ink-fade"
            : positive
              ? "text-pos"
              : negative
                ? "text-neg"
                : "text-ink"
        )}
      >
        {noData ? "—" : fmtSignedPct(p.returnPct!, 1)}
      </div>
      {p.dollarChange !== null && (
        <div className="text-[11px] text-ink-dim num">
          {p.dollarChange >= 0 ? "+" : "−"}
          {fmtUSD(Math.abs(p.dollarChange))}
        </div>
      )}
      {p.benchmarkReturnPct !== null && (
        <div
          className={cn(
            "text-[10px] num leading-tight",
            beatBench ? "text-pos" : "text-warn"
          )}
          title={`Portfolio ${fmtSignedPct(p.returnPct!, 1)} vs ${p.benchmarkLabel} ${fmtSignedPct(p.benchmarkReturnPct, 1)}`}
        >
          vs SPX {fmtSignedPct(p.benchmarkReturnPct, 1)}{" "}
          {vsBench !== null && (
            <span className="font-semibold">
              ({vsBench >= 0 ? "+" : ""}
              {(vsBench * 100).toFixed(1)}pp)
            </span>
          )}
        </div>
      )}
    </div>
  );
}
