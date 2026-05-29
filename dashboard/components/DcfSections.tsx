"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn, fmtNum, fmtPct, fmtUSD } from "@/lib/utils";
import type { DcfResult, ScenarioOutput } from "@/lib/dcf";

export interface SensitivityPayload {
  waccs: number[];
  gs: number[];
  values: (number | null)[][];
}

/* ───────────────────────── ConsensusFlag ───────────────────────── */

export function ConsensusFlag({ dcf }: { dcf: DcfResult }) {
  const isAlert = dcf.consensusFlag === "ALERT";
  const toneClasses = isAlert
    ? "bg-neg/10 border-neg/40 text-neg"
    : "bg-warn/10 border-warn/40 text-warn";
  const label = isAlert
    ? "⚠ ALERT — DCF vs Consensus"
    : "⚠ Watch — DCF vs Consensus";
  return (
    <div className={cn("rounded-lg border p-4 space-y-2", toneClasses)}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold tracking-wide uppercase">
          {label}
        </span>
        <span className="num text-xs font-semibold">
          DCF {fmtUSD(dcf.fairValue)}{" "}
          {dcf.consensusGap !== null
            ? `(${dcf.consensusGap > 0 ? "+" : ""}${(dcf.consensusGap * 100).toFixed(0)}% vs analyst ${fmtUSD(dcf.snapshot.analystTargetMean)})`
            : ""}
        </span>
      </div>
      {dcf.consensusDiagnosis && (
        <p className="text-[12px] leading-relaxed text-ink-dim">
          {dcf.consensusDiagnosis}
        </p>
      )}
    </div>
  );
}

/* ───────────────────────── WaccBreakdown ───────────────────────── */

export function WaccBreakdown({ dcf }: { dcf: DcfResult }) {
  const w = dcf.wacc;
  return (
    <div className="card-elev p-5 space-y-4">
      <div className="flex items-center justify-between">
        <span className="label-eyebrow">
          WACC Construction (live, per-company)
        </span>
        <span className="text-2xl font-semibold text-accent-glow num">
          {fmtPct(w.wacc, 2)}
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <Row label="Risk-Free Rate (10y UST)" value={fmtPct(w.riskFreeRate, 2)} />
        <Row
          label={
            w.rawBeta !== null && w.beta !== w.rawBeta
              ? `Beta (Yahoo ${fmtNum(w.rawBeta, 2)} → floor ${fmtNum(w.sectorBetaFloor!, 2)})`
              : "Beta"
          }
          value={fmtNum(w.beta, 2)}
        />
        <Row label="Equity Risk Premium" value={fmtPct(w.equityRiskPremium, 2)} />
        <Row label="Country Risk Premium" value={fmtPct(w.countryRiskPremium, 2)} />
        <Row
          label="Cost of Equity (CAPM + CRP)"
          value={fmtPct(w.costOfEquity, 2)}
          accent
        />
        <Row label="Pre-Tax K_d" value={fmtPct(w.preTaxCostOfDebt, 2)} />
        <Row label="Effective Tax Rate" value={fmtPct(w.taxRate, 2)} />
        <Row
          label="After-Tax K_d"
          value={fmtPct(w.afterTaxCostOfDebt, 2)}
          accent
        />
        <Row
          label="Equity / Debt Weights"
          value={`${fmtPct(w.equityWeight)} / ${fmtPct(w.debtWeight)}`}
        />
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-ink-fade">
        {label}
      </span>
      <span
        className={cn(
          "num font-medium",
          accent ? "text-accent-glow" : "text-ink"
        )}
      >
        {value}
      </span>
    </div>
  );
}

/* ───────────────────────── ScenarioChart ───────────────────────── */

export function ScenarioChart({ dcf }: { dcf: DcfResult }) {
  const data = dcf.base.projections.map((p, i) => ({
    year: 2026 + i,
    bull: dcf.bull.projections[i].ufcf / 1e9,
    base: p.ufcf / 1e9,
    bear: dcf.bear.projections[i].ufcf / 1e9,
  }));
  return (
    <div className="card-elev p-5 space-y-4">
      <div className="flex items-center justify-between">
        <span className="label-eyebrow">
          10-Year Unlevered FCF Projection ($B)
        </span>
        <div className="flex items-center gap-3 text-[11px]">
          <Legend color="#22c55e" label="Bull" />
          <Legend color="#7c5cff" label="Base" />
          <Legend color="#f59e0b" label="Bear" />
        </div>
      </div>
      <div className="h-56 -ml-4">
        <ResponsiveContainer>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="g-base" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7c5cff" stopOpacity={0.45} />
                <stop offset="100%" stopColor="#7c5cff" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#23232f" strokeDasharray="3 3" />
            <XAxis
              dataKey="year"
              stroke="#5f5f70"
              tick={{ fill: "#9292a3", fontSize: 11 }}
            />
            <YAxis
              stroke="#5f5f70"
              tick={{ fill: "#9292a3", fontSize: 11 }}
              tickFormatter={(v) => `$${v}B`}
            />
            <Tooltip content={<ChartTooltip />} />
            <Area
              type="monotone"
              dataKey="base"
              stroke="#7c5cff"
              strokeWidth={2.5}
              fill="url(#g-base)"
            />
            <Line
              type="monotone"
              dataKey="bull"
              stroke="#22c55e"
              strokeWidth={1.5}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="bear"
              stroke="#f59e0b"
              strokeWidth={1.5}
              dot={false}
              strokeDasharray="4 4"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-ink-dim">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string }[];
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-bg-elev/95 p-2.5 shadow-card backdrop-blur-sm">
      <div className="text-[11px] text-ink-fade mb-1">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-4 text-xs">
          <span className="flex items-center gap-1.5 capitalize text-ink-dim">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: p.color }}
            />
            {p.name}
          </span>
          <span className="num font-medium">${p.value?.toFixed(1)}B</span>
        </div>
      ))}
    </div>
  );
}

/* ───────────────────────── ScenarioTable ───────────────────────── */

export function ScenarioTable({ dcf }: { dcf: DcfResult }) {
  const rows = [
    ["WACC", "wacc"],
    ["Terminal g", "terminalGrowth"],
    ["Y1 Growth", "yearOneGrowth"],
    ["EBITDA Margin (start → end)", "marginRange"],
    ["PV of Explicit UFCF", "pvExplicitUfcf"],
    ["PV of Terminal Value", "pvTerminalValue"],
    ["Enterprise Value", "enterpriseValue"],
    ["(−) Net Debt", "netDebt"],
    ["Equity Value", "equityValue"],
    ["Equity / Share", "pricePerShare"],
  ] as const;
  const scenarios: {
    name: string;
    s: ScenarioOutput;
    key: "bull" | "base" | "bear";
  }[] = [
    { name: "Bull", s: dcf.bull, key: "bull" },
    { name: "Base", s: dcf.base, key: "base" },
    { name: "Bear", s: dcf.bear, key: "bear" },
  ];
  const accent: Record<string, string> = {
    bull: "text-pos",
    base: "text-accent-glow",
    bear: "text-warn",
  };
  return (
    <div className="card-elev overflow-hidden">
      <div className="px-5 py-3 border-b border-line/60 label-eyebrow">
        Three-Scenario DCF
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-ink-fade border-b border-line/60">
            <th className="px-5 py-2 font-medium label-eyebrow">Metric</th>
            {scenarios.map((sc) => (
              <th
                key={sc.key}
                className={cn(
                  "px-5 py-2 text-right font-semibold uppercase text-[10px] tracking-wider",
                  accent[sc.key]
                )}
              >
                {sc.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, k]) => (
            <tr key={k} className="border-b border-line/40">
              <td className="px-5 py-2.5 text-ink-dim">{label}</td>
              {scenarios.map((sc) => (
                <td
                  key={sc.key}
                  className={cn(
                    "px-5 py-2.5 text-right num",
                    k === "pricePerShare" && "font-semibold",
                    k === "pricePerShare" && accent[sc.key]
                  )}
                >
                  {renderScenarioCell(k, sc.s)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderScenarioCell(k: string, s: ScenarioOutput): string {
  switch (k) {
    case "wacc":
    case "terminalGrowth":
    case "yearOneGrowth":
      return fmtPct((s as unknown as Record<string, number>)[k], 2);
    case "marginRange":
      return `${fmtPct(s.ebitdaMarginStart)} → ${fmtPct(s.ebitdaMarginEnd)}`;
    case "pvExplicitUfcf":
    case "pvTerminalValue":
    case "enterpriseValue":
    case "equityValue":
      return fmtUSD((s as unknown as Record<string, number>)[k]);
    case "netDebt":
      return `(${fmtUSD(s.netDebt)})`;
    case "pricePerShare":
      return fmtUSD(s.pricePerShare);
    default:
      return "—";
  }
}

/* ───────────────────────── SensitivityHeatmap ───────────────────────── */

export function SensitivityHeatmap({
  sensitivity,
  currentPrice,
}: {
  sensitivity: SensitivityPayload;
  currentPrice: number;
}) {
  const flat = sensitivity.values.flat().filter((v): v is number => v !== null);
  const min = Math.min(...flat);
  const max = Math.max(...flat);
  const range = max - min || 1;

  function bg(v: number | null): string {
    if (v === null) return "bg-bg-elev text-ink-fade";
    const t = (v - min) / range;
    if (t < 0.33) return "bg-neg/20 text-neg";
    if (t < 0.66) return "bg-warn/15 text-warn";
    return "bg-pos/20 text-pos";
  }

  return (
    <div className="card-elev overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-line/60">
        <span className="label-eyebrow">
          Equity Value per Share — WACC × Terminal-g Sensitivity
        </span>
        <span className="text-[11px] text-ink-fade">
          current price {fmtUSD(currentPrice)}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className="px-3 py-2 text-left text-ink-fade font-medium">
                WACC \ g
              </th>
              {sensitivity.gs.map((g, i) => (
                <th
                  key={i}
                  className="px-3 py-2 text-right text-ink-fade font-medium num"
                >
                  {fmtPct(g, 2)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sensitivity.waccs.map((w, i) => (
              <tr key={i}>
                <td className="px-3 py-2 text-ink-dim font-medium num">
                  {fmtPct(w, 2)}
                </td>
                {sensitivity.values[i].map((v, j) => (
                  <td
                    key={j}
                    className={cn(
                      "px-3 py-2 text-right num font-medium",
                      bg(v)
                    )}
                  >
                    {v === null ? "—" : fmtUSD(v, 0)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
