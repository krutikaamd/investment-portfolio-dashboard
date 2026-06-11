"use client";

import { useEffect, useState } from "react";
import {
  Area,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn, fmtSignedPct, fmtUSD } from "@/lib/utils";
import type { PortfolioValuation } from "@/lib/allocate";

/* Cool, on-theme palette (purples → blues → teals) for composition slices. */
const PALETTE = [
  "#7c5cff",
  "#22d3ee",
  "#a78bfa",
  "#38bdf8",
  "#818cf8",
  "#2dd4bf",
  "#c084fc",
  "#60a5fa",
  "#5eead4",
  "#f0abfc",
  "#34d399",
  "#93c5fd",
];

const ACCENT = "#7c5cff";
const BENCH = "#22d3ee";

export function PortfolioCharts({ p }: { p: PortfolioValuation }) {
  if (p.holdings.length === 0) return null;

  return (
    <section className="space-y-6">
      <div className="flex items-center gap-2.5">
        <span className="h-4 w-1 rounded-full bg-gradient-to-b from-accent to-cyan" />
        <h2 className="text-sm font-semibold tracking-wide">
          Portfolio Analytics
        </h2>
        <span className="text-[11px] text-ink-fade">
          live, computed from your holdings
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="card p-6 lg:col-span-2">
          <AllocationDonut p={p} />
        </div>
        <div className="card p-6 lg:col-span-3">
          <PerformanceChart />
        </div>
      </div>
    </section>
  );
}

/* ───────────────────── Portfolio vs S&P 500 performance ───────────────────── */

interface PerfPoint {
  date: string;
  portfolio: number;
  benchmark: number;
  portfolioValue: number;
}
interface PerfResponse {
  points: PerfPoint[];
  startDate: string | null;
  endDate: string | null;
  portfolioReturnPct: number | null;
  benchmarkReturnPct: number | null;
  benchmarkLabel: string;
  error?: string;
}

const RANGES: { label: string; months: number }[] = [
  { label: "3M", months: 3 },
  { label: "6M", months: 6 },
  { label: "1Y", months: 12 },
];

function PerformanceChart() {
  const [months, setMonths] = useState(6);
  const [data, setData] = useState<PerfResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/performance?months=${months}&t=${Date.now()}`, {
      cache: "no-store",
    })
      .then(async (r) => {
        const j = (await r.json()) as PerfResponse;
        if (!r.ok) throw new Error(j.error ?? `Failed (${r.status})`);
        return j;
      })
      .then((j) => {
        if (!cancelled) setData(j);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [months]);

  const pReturn = data?.portfolioReturnPct ?? null;
  const bReturn = data?.benchmarkReturnPct ?? null;
  const beat = pReturn !== null && bReturn !== null && pReturn >= bReturn;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <span className="label-eyebrow">Performance vs S&amp;P 500</span>
          <p className="text-[11px] text-ink-fade mt-0.5">
            Look-through basket, rebased to 100 at window start
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {RANGES.map((r) => (
            <button
              key={r.label}
              onClick={() => setMonths(r.months)}
              className={cn(
                "rounded-md px-2.5 py-1 text-[11px] font-semibold transition border",
                months === r.months
                  ? "bg-accent/15 text-accent-glow border-accent/40"
                  : "bg-bg-elev text-ink-dim border-line hover:text-ink hover:border-line-strong"
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {(pReturn !== null || bReturn !== null) && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
          <LegendStat
            color={ACCENT}
            label="Your portfolio"
            value={pReturn !== null ? fmtSignedPct(pReturn) : "—"}
          />
          <LegendStat
            color={BENCH}
            label="S&P 500"
            value={bReturn !== null ? fmtSignedPct(bReturn) : "—"}
          />
          {pReturn !== null && bReturn !== null && (
            <span
              className={cn(
                "text-[11px] font-semibold num",
                beat ? "text-pos" : "text-warn"
              )}
            >
              {beat ? "Beating" : "Trailing"} by{" "}
              {Math.abs((pReturn - bReturn) * 100).toFixed(1)}pp
            </span>
          )}
        </div>
      )}

      <div className="h-[260px] -ml-3">
        {error ? (
          <div className="flex h-full items-center justify-center text-sm text-neg">
            {error}
          </div>
        ) : !data && loading ? (
          <div className="flex h-full items-center justify-center text-sm text-ink-fade">
            Loading daily closes…
          </div>
        ) : data && data.points.length > 0 ? (
          <ResponsiveContainer>
            <ComposedChart
              data={data.points}
              margin={{ top: 6, right: 10, left: 4, bottom: 0 }}
            >
              <defs>
                <linearGradient id="perf-port" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ACCENT} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgb(var(--c-line))" strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                stroke="rgb(var(--c-line-strong))"
                tick={{ fill: "rgb(var(--c-ink-fade))", fontSize: 11 }}
                minTickGap={48}
                tickFormatter={(d: string) =>
                  new Date(d).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })
                }
              />
              <YAxis
                stroke="rgb(var(--c-line-strong))"
                tick={{ fill: "rgb(var(--c-ink-fade))", fontSize: 11 }}
                domain={["auto", "auto"]}
                tickFormatter={(v: number) => v.toFixed(0)}
                width={36}
              />
              <Tooltip content={<PerfTooltip />} />
              <Area
                type="monotone"
                dataKey="portfolio"
                stroke={ACCENT}
                strokeWidth={2.5}
                fill="url(#perf-port)"
                dot={false}
                name="Portfolio"
              />
              <Line
                type="monotone"
                dataKey="benchmark"
                stroke={BENCH}
                strokeWidth={2}
                strokeDasharray="5 3"
                dot={false}
                name="S&P 500"
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-ink-fade">
            Not enough history to plot.
          </div>
        )}
      </div>
    </div>
  );
}

function LegendStat({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: string;
}) {
  return (
    <span className="inline-flex items-center gap-2 text-[12px]">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      <span className="text-ink-dim">{label}</span>
      <span className="num font-semibold text-ink">{value}</span>
    </span>
  );
}

function PerfTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-bg-elev/95 px-3 py-2 shadow-card backdrop-blur-sm">
      <div className="text-[11px] text-ink-fade mb-1">
        {label ? new Date(label).toLocaleDateString() : ""}
      </div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-4 text-xs">
          <span className="flex items-center gap-1.5 text-ink-dim">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: p.color }}
            />
            {p.name}
          </span>
          <span className="num font-medium text-ink">{p.value?.toFixed(1)}</span>
        </div>
      ))}
    </div>
  );
}

/* ───────────────────────── Allocation donut ───────────────────────── */

function AllocationDonut({ p }: { p: PortfolioValuation }) {
  const data = [...p.holdings]
    .sort((a, b) => b.marketValue - a.marketValue)
    .map((h) => ({
      name: h.dcf.ticker,
      value: h.marketValue,
      weight: h.currentWeight,
    }));

  return (
    <div className="space-y-4">
      <div>
        <span className="label-eyebrow">Allocation</span>
        <p className="text-[11px] text-ink-fade mt-0.5">
          Current weight by market value
        </p>
      </div>

      <div className="relative h-[260px]">
        <ResponsiveContainer>
          <PieChart>
            <defs>
              {PALETTE.map((c, i) => (
                <linearGradient
                  key={i}
                  id={`slice-${i}`}
                  x1="0"
                  y1="0"
                  x2="1"
                  y2="1"
                >
                  <stop offset="0%" stopColor={c} stopOpacity={0.95} />
                  <stop offset="100%" stopColor={c} stopOpacity={0.6} />
                </linearGradient>
              ))}
            </defs>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="62%"
              outerRadius="92%"
              paddingAngle={2}
              stroke="rgb(var(--c-bg-card))"
              strokeWidth={2}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={`url(#slice-${i % PALETTE.length})`} />
              ))}
            </Pie>
            <Tooltip content={<DonutTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-[10px] uppercase tracking-wider text-ink-fade">
            Total
          </span>
          <span className="text-xl font-semibold num text-ink">
            {fmtUSD(p.totalMarketValue, 0)}
          </span>
          <span className="text-[11px] text-ink-fade">
            {p.holdings.length} positions
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {data.map((d, i) => (
          <span
            key={d.name}
            className="inline-flex items-center gap-1.5 text-[11px] text-ink-dim"
          >
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ background: PALETTE[i % PALETTE.length] }}
            />
            <span className="font-medium text-ink">{d.name}</span>
            <span className="num text-ink-fade">
              {(d.weight * 100).toFixed(1)}%
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function DonutTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload?: { name: string; value: number; weight: number } }[];
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  if (!d) return null;
  return (
    <div className="rounded-lg border border-line bg-bg-elev/95 px-3 py-2 shadow-card backdrop-blur-sm">
      <div className="text-xs font-semibold text-ink">{d.name}</div>
      <div className="num text-[11px] text-ink-dim mt-0.5">
        {fmtUSD(d.value, 0)} · {(d.weight * 100).toFixed(1)}%
      </div>
    </div>
  );
}
