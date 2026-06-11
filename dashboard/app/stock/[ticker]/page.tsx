"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Activity,
  RefreshCw,
  ExternalLink,
  Newspaper,
} from "lucide-react";
import {
  cn,
  fmtNum,
  fmtPct,
  fmtSignedPct,
  fmtUSD,
  tone,
} from "@/lib/utils";
import { Stat } from "@/components/Stat";
import { VerdictBadge } from "@/components/VerdictBadge";
import type { DcfResult, ScenarioOutput, YearProjection } from "@/lib/dcf";
import {
  ConsensusFlag,
  ScenarioTable,
  SensitivityHeatmap,
  WaccBreakdown,
  type SensitivityPayload,
} from "@/components/DcfSections";
import { ThemeToggle } from "@/components/ThemeToggle";

interface ApiResponse {
  dcf: DcfResult;
  sensitivity: SensitivityPayload;
  riskFreeRate: number;
}

interface NewsItem {
  uuid: string;
  ticker: string;
  title: string;
  publisher: string;
  link: string;
  publishedAt: string;
  type: string | null;
  thumbnail: string | null;
  relatedTickers: string[];
}

export default function StockDeepDivePage() {
  const params = useParams<{ ticker: string }>();
  const ticker = (params?.ticker ?? "").toUpperCase();
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!ticker) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/valuation?ticker=${encodeURIComponent(ticker)}`
      );
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
      const j: ApiResponse = await r.json();
      setData(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker]);

  return (
    <div className="min-h-screen relative z-10">
      <header className="border-b border-line/60 bg-bg-elev/40 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-[1440px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-bg-elev px-3 py-2 text-xs font-medium text-ink-dim hover:text-ink hover:border-line-strong transition"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Portfolio
            </Link>
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-accent to-cyan flex items-center justify-center shadow-glow">
                <Activity className="h-4 w-4 text-white" />
              </div>
              <div>
                <h1 className="text-base font-semibold leading-tight">
                  {ticker} — Full DCF Model
                </h1>
                <p className="text-[11px] text-ink-dim">
                  {data?.dcf.snapshot.longName ?? "Loading…"}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {data && (
              <div className="hidden md:flex flex-col text-right">
                <span className="text-[10px] uppercase tracking-wider text-ink-fade">
                  10-Y UST
                </span>
                <span className="text-sm font-semibold num text-cyan">
                  {(data.riskFreeRate * 100).toFixed(2)}%
                </span>
              </div>
            )}
            <button
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border border-line bg-bg-elev px-3 py-2 text-xs font-medium text-ink-dim hover:text-ink hover:border-line-strong disabled:opacity-50 transition"
            >
              <RefreshCw
                className={"h-3.5 w-3.5 " + (loading ? "animate-spin" : "")}
              />
              Refresh
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="max-w-[1440px] mx-auto px-6 pt-6 pb-20 space-y-8">
        {error && (
          <div className="rounded-xl border border-neg/40 bg-neg/10 p-4 text-sm text-neg">
            {error}
          </div>
        )}

        {!data && !error && (
          <div className="card p-10 text-center text-ink-fade text-sm">
            Loading live financials and computing DCF for {ticker}…
          </div>
        )}

        {data && <DeepDiveBody data={data} ticker={ticker} />}
      </main>
    </div>
  );
}

/* ───────────────────────── Body ───────────────────────── */

function DeepDiveBody({ data, ticker }: { data: ApiResponse; ticker: string }) {
  const { dcf, sensitivity, riskFreeRate } = data;
  const mosTone = tone(dcf.marginOfSafety);

  return (
    <>
      <HeroCard dcf={dcf} riskFreeRate={riskFreeRate} mosTone={mosTone} />

      {dcf.consensusFlag && dcf.consensusFlag !== "OK" && (
        <ConsensusFlag dcf={dcf} />
      )}

      <ModelDriversCard dcf={dcf} />

      <WaccBreakdown dcf={dcf} />

      <ScenarioTable dcf={dcf} />

      <YearByYearProjections dcf={dcf} />

      <EquityBridge dcf={dcf} />

      <SensitivityHeatmap
        sensitivity={sensitivity}
        currentPrice={dcf.snapshot.price}
      />

      <HistoricalFinancials dcf={dcf} />

      <TickerNews ticker={ticker} />

      {dcf.notes.length > 0 && (
        <div className="card-elev p-5">
          <div className="label-eyebrow mb-3">Model Notes & Assumptions</div>
          <div className="text-[12px] text-ink-dim space-y-1.5 leading-relaxed">
            {dcf.notes.map((n, i) => (
              <div key={i}>• {n}</div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/* ───────────────────────── HeroCard ───────────────────────── */

function HeroCard({
  dcf,
  riskFreeRate,
  mosTone,
}: {
  dcf: DcfResult;
  riskFreeRate: number;
  mosTone: "pos" | "neg" | "neutral";
}) {
  const s = dcf.snapshot;
  const fiftyTwoRange =
    s.fiftyTwoWeekLow !== null && s.fiftyTwoWeekHigh !== null
      ? `${fmtUSD(s.fiftyTwoWeekLow)} – ${fmtUSD(s.fiftyTwoWeekHigh)}`
      : "—";
  return (
    <section className="card p-7 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-semibold">{dcf.snapshot.longName}</h2>
            <span className="chip bg-bg-elev ring-1 ring-line text-ink-dim text-[11px]">
              {dcf.ticker}
            </span>
          </div>
          <div className="text-[12px] text-ink-dim">
            {s.sector ?? "—"}
            {s.industry ? ` • ${s.industry}` : ""}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <VerdictBadge verdict={dcf.verdict} size="md" />
          <span className="chip bg-bg-elev ring-1 ring-line text-ink-dim">
            Risk-free {fmtPct(riskFreeRate, 2)} (10y UST)
          </span>
          {s.analystRecommendation && (
            <span className="chip bg-bg-elev ring-1 ring-line text-ink-dim capitalize">
              Street: {s.analystRecommendation.replace(/_/g, " ")}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-5">
        <Stat label="Current Price" value={fmtUSD(s.price)} />
        <Stat
          label="DCF Fair Value"
          value={fmtUSD(dcf.fairValue)}
          sub="prob-weighted 30/50/20"
          tone="accent"
        />
        <Stat
          label="Margin of Safety"
          value={fmtSignedPct(dcf.marginOfSafety)}
          tone={mosTone}
        />
        <Stat
          label="Analyst Target"
          value={s.analystTargetMean ? fmtUSD(s.analystTargetMean) : "—"}
          sub={
            dcf.upsideToAnalyst !== null
              ? `${fmtSignedPct(dcf.upsideToAnalyst)} vs price`
              : undefined
          }
        />
        <Stat label="Market Cap" value={fmtUSD(s.marketCap ?? 0)} />
        <Stat
          label="Trailing P/E"
          value={s.trailingPE ? fmtNum(s.trailingPE, 1) : "—"}
        />
        <Stat
          label="Dividend Yield"
          value={
            s.dividendYield && s.dividendYield > 0
              ? fmtPct(s.dividendYield, 2)
              : "—"
          }
        />
        <Stat label="52-Week Range" value={fiftyTwoRange} />
      </div>
    </section>
  );
}

/* ───────────────────────── ModelDriversCard ───────────────────────── */

function ModelDriversCard({ dcf }: { dcf: DcfResult }) {
  const d = dcf.drivers;
  const flags: { label: string; on: boolean; tone: "neg" | "pos" | "warn" }[] =
    [
      { label: "Margin Impaired", on: d.isImpaired, tone: "neg" },
      { label: "Mature (>$50B Rev, <10% growth)", on: d.isMature, tone: "warn" },
      { label: "Hypergrowth (Y1 > 20%)", on: d.isHyperGrowth, tone: "pos" },
    ];
  return (
    <section className="card-elev overflow-hidden">
      <div className="px-5 py-3 border-b border-line/60 flex items-center justify-between">
        <span className="label-eyebrow">Model Decision Drivers</span>
        <span className="text-[10px] text-ink-fade uppercase tracking-wider">
          why this stock is modeled the way it is
        </span>
      </div>
      <div className="p-5 space-y-5">
        <div className="flex flex-wrap gap-2">
          {flags.map((f) => (
            <span
              key={f.label}
              className={cn(
                "chip text-[11px] font-medium",
                f.on
                  ? f.tone === "neg"
                    ? "bg-neg/15 text-neg ring-1 ring-neg/30"
                    : f.tone === "pos"
                      ? "bg-pos/15 text-pos ring-1 ring-pos/30"
                      : "bg-warn/15 text-warn ring-1 ring-warn/30"
                  : "bg-bg-elev text-ink-fade ring-1 ring-line line-through opacity-60"
              )}
            >
              {f.label}
            </span>
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4 text-sm">
          <Driver
            label="Historical Revenue CAGR (5y)"
            value={
              d.revGrowthHistCagr !== null
                ? fmtSignedPct(d.revGrowthHistCagr)
                : "—"
            }
          />
          <Driver
            label="Analyst Y1 Growth"
            value={
              d.analystY1Growth !== null
                ? fmtSignedPct(d.analystY1Growth)
                : "—"
            }
          />
          <Driver
            label="EBITDA Margin (latest)"
            value={fmtPct(d.ebitdaMarginLatest)}
          />
          <Driver
            label="EBITDA Margin (5y mean / max)"
            value={`${fmtPct(d.ebitdaMarginMean)} / ${fmtPct(d.ebitdaMarginMax)}`}
          />
          <Driver
            label="Starting D&A"
            value={fmtUSD(d.daStarting)}
            sub="grows at inflation"
          />
          <Driver
            label="Starting CapEx"
            value={fmtUSD(d.capexStarting)}
            sub="terminal = D&A"
          />
          <Driver
            label="NWC / Revenue"
            value={fmtPct(d.nwcPctRevenue, 2)}
            sub="5y average, capped 20%"
          />
          <Driver
            label="Inflation Assumed"
            value={fmtPct(d.inflation, 2)}
          />
        </div>

        <p className="text-[11px] text-ink-fade leading-relaxed">
          The model classifies each company into a margin-expansion bucket
          (impaired / mature / hypergrowth / middle) and a terminal-growth
          tier (premium compounder allowed up to 3.0%, hypergrowth up to 3.5%,
          everyone else 2.5% nominal GDP). EBITDA margin trajectory and growth
          fade path are bucket-dependent. See the model notes at the bottom of
          this page for company-specific adjustments.
        </p>
      </div>
    </section>
  );
}

function Driver({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-ink-fade">
        {label}
      </span>
      <span className="num font-medium">{value}</span>
      {sub && <span className="text-[10px] text-ink-fade">{sub}</span>}
    </div>
  );
}

/* ───────────────────────── YearByYearProjections ───────────────────────── */

function YearByYearProjections({ dcf }: { dcf: DcfResult }) {
  const [view, setView] = useState<"bull" | "base" | "bear">("base");
  const scenario: ScenarioOutput =
    view === "bull" ? dcf.bull : view === "bear" ? dcf.bear : dcf.base;
  const startYear = new Date().getFullYear() + 1;
  return (
    <section className="card-elev overflow-hidden">
      <div className="px-5 py-3 border-b border-line/60 flex items-center justify-between flex-wrap gap-3">
        <span className="label-eyebrow">
          10-Year Unlevered Free Cash Flow — Full Workings
        </span>
        <div className="flex items-center gap-1.5">
          {(["bull", "base", "bear"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setView(k)}
              className={cn(
                "rounded-md px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider transition border",
                view === k
                  ? k === "bull"
                    ? "bg-pos/15 text-pos border-pos/40"
                    : k === "bear"
                      ? "bg-warn/15 text-warn border-warn/40"
                      : "bg-accent/15 text-accent-glow border-accent/40"
                  : "bg-bg-elev text-ink-dim border-line hover:text-ink"
              )}
            >
              {k}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left border-b border-line/60 text-ink-fade">
              <th className="px-3 py-2 font-medium label-eyebrow sticky left-0 bg-bg-elev/80 backdrop-blur-sm">
                Year
              </th>
              {scenario.projections.map((_p, i) => (
                <th
                  key={i}
                  className="px-3 py-2 font-medium num text-right"
                >
                  {startYear + i}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <ProjRow
              label="Revenue Growth"
              fmt={(p) => fmtPct(p.growth, 1)}
              projections={scenario.projections}
              dim
            />
            <ProjRow
              label="Revenue"
              fmt={(p) => fmtUSD(p.revenue)}
              projections={scenario.projections}
              bold
            />
            <ProjRow
              label="EBITDA Margin"
              fmt={(p) => fmtPct(p.ebitdaMargin, 1)}
              projections={scenario.projections}
              dim
            />
            <ProjRow
              label="EBITDA"
              fmt={(p) => fmtUSD(p.ebitda)}
              projections={scenario.projections}
            />
            <ProjRow
              label="(−) D&A"
              fmt={(p) => `(${fmtUSD(p.da)})`}
              projections={scenario.projections}
              dim
            />
            <ProjRow
              label="EBIT"
              fmt={(p) => fmtUSD(p.ebit)}
              projections={scenario.projections}
            />
            <ProjRow
              label="EBIT Margin"
              fmt={(p) => fmtPct(p.effEbitMargin, 1)}
              projections={scenario.projections}
              dim
            />
            <ProjRow
              label={`NOPAT (after ${fmtPct(dcf.wacc.taxRate, 1)} tax)`}
              fmt={(p) => fmtUSD(p.nopat)}
              projections={scenario.projections}
            />
            <ProjRow
              label="(+) D&A"
              fmt={(p) => fmtUSD(p.da)}
              projections={scenario.projections}
              dim
            />
            <ProjRow
              label="(−) CapEx"
              fmt={(p) => `(${fmtUSD(p.capex)})`}
              projections={scenario.projections}
              dim
            />
            <ProjRow
              label="(−) ΔNWC"
              fmt={(p) =>
                p.changeNwc >= 0 ? `(${fmtUSD(p.changeNwc)})` : fmtUSD(-p.changeNwc)
              }
              projections={scenario.projections}
              dim
            />
            <ProjRow
              label="Unlevered FCF"
              fmt={(p) => fmtUSD(p.ufcf)}
              projections={scenario.projections}
              bold
              highlight
            />
            <ProjRow
              label="Discount Factor"
              fmt={(p) => p.discountFactor.toFixed(3)}
              projections={scenario.projections}
              dim
            />
            <ProjRow
              label="PV of UFCF"
              fmt={(p) => fmtUSD(p.pvUfcf)}
              projections={scenario.projections}
              bold
              highlight
            />
          </tbody>
        </table>
      </div>
      <div className="px-5 py-3 border-t border-line/60 grid grid-cols-2 md:grid-cols-4 gap-4 text-[11px]">
        <SummaryStat
          label="Sum of PV(UFCF)"
          value={fmtUSD(scenario.pvExplicitUfcf)}
        />
        <SummaryStat
          label="Terminal UFCF × (1+g)"
          value={fmtUSD(scenario.terminalUfcf)}
        />
        <SummaryStat
          label="Terminal Value"
          value={fmtUSD(scenario.terminalValue)}
          sub={`= TermUFCF / (WACC − g) = ${fmtUSD(scenario.terminalUfcf)} / (${fmtPct(scenario.wacc, 2)} − ${fmtPct(scenario.terminalGrowth, 2)})`}
        />
        <SummaryStat
          label="PV of Terminal Value"
          value={fmtUSD(scenario.pvTerminalValue)}
          sub={`discounted ${dcf.base.projections.length}y at ${fmtPct(scenario.wacc, 2)}`}
        />
      </div>
    </section>
  );
}

function ProjRow({
  label,
  fmt,
  projections,
  dim,
  bold,
  highlight,
}: {
  label: string;
  fmt: (p: YearProjection) => string;
  projections: YearProjection[];
  dim?: boolean;
  bold?: boolean;
  highlight?: boolean;
}) {
  return (
    <tr
      className={cn(
        "border-b border-line/40",
        highlight && "bg-accent/5"
      )}
    >
      <td
        className={cn(
          "px-3 py-2 sticky left-0 bg-bg-elev/80 backdrop-blur-sm",
          dim ? "text-ink-fade" : "text-ink-dim",
          bold && "text-ink font-semibold"
        )}
      >
        {label}
      </td>
      {projections.map((p, i) => (
        <td
          key={i}
          className={cn(
            "px-3 py-2 text-right num",
            dim && "text-ink-fade",
            bold && "font-semibold",
            highlight && "text-accent-glow"
          )}
        >
          {fmt(p)}
        </td>
      ))}
    </tr>
  );
}

function SummaryStat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-ink-fade">
        {label}
      </span>
      <span className="num font-semibold text-ink">{value}</span>
      {sub && <span className="text-[10px] text-ink-fade">{sub}</span>}
    </div>
  );
}

/* ───────────────────────── EquityBridge ───────────────────────── */

function EquityBridge({ dcf }: { dcf: DcfResult }) {
  const scenarios: { name: string; s: ScenarioOutput; col: string }[] = [
    { name: "Bull", s: dcf.bull, col: "text-pos" },
    { name: "Base", s: dcf.base, col: "text-accent-glow" },
    { name: "Bear", s: dcf.bear, col: "text-warn" },
  ];
  return (
    <section className="card-elev overflow-hidden">
      <div className="px-5 py-3 border-b border-line/60 label-eyebrow">
        Enterprise Value → Equity Value per Share Bridge
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line/60 text-ink-fade">
            <th className="px-5 py-2 text-left font-medium label-eyebrow">
              Step
            </th>
            {scenarios.map((sc) => (
              <th
                key={sc.name}
                className={cn(
                  "px-5 py-2 text-right text-[10px] uppercase tracking-wider font-semibold",
                  sc.col
                )}
              >
                {sc.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <BridgeRow
            label="PV of Explicit UFCF (10y)"
            scenarios={scenarios}
            fmt={(s) => fmtUSD(s.pvExplicitUfcf)}
          />
          <BridgeRow
            label="(+) PV of Terminal Value"
            scenarios={scenarios}
            fmt={(s) => fmtUSD(s.pvTerminalValue)}
          />
          <BridgeRow
            label="= Enterprise Value"
            scenarios={scenarios}
            fmt={(s) => fmtUSD(s.enterpriseValue)}
            bold
          />
          <BridgeRow
            label={
              dcf.base.netDebt < 0
                ? "(+) Net Cash"
                : "(−) Net Debt"
            }
            scenarios={scenarios}
            fmt={(s) =>
              s.netDebt < 0
                ? fmtUSD(-s.netDebt)
                : `(${fmtUSD(s.netDebt)})`
            }
            sub="incl. ST cash + LT marketable securities − total debt"
          />
          <BridgeRow
            label="= Equity Value"
            scenarios={scenarios}
            fmt={(s) => fmtUSD(s.equityValue)}
            bold
          />
          <BridgeRow
            label="÷ Diluted Shares Outstanding (today)"
            scenarios={scenarios}
            fmt={(s) => fmtNum(s.sharesOutstanding / 1e6, 1) + "M"}
            dim
          />
          <BridgeRow
            label={
              dcf.base.buybackYield > 0.001
                ? `Buyback Yield ${fmtPct(dcf.base.buybackYield, 2)}/yr → midpoint shares (yr 5)`
                : "Midpoint shares (no buyback)"
            }
            scenarios={scenarios}
            fmt={(s) => {
              const mid =
                s.sharesOutstanding * Math.pow(1 - s.buybackYield, 5);
              return fmtNum(mid / 1e6, 1) + "M";
            }}
            dim
          />
          <BridgeRow
            label="= Equity Value / Share"
            scenarios={scenarios}
            fmt={(s) => fmtUSD(s.pricePerShare)}
            bold
            highlight
          />
        </tbody>
      </table>
      <div className="px-5 py-3 border-t border-line/60 grid grid-cols-3 gap-4 text-[11px] text-ink-dim">
        <span>
          <strong className="text-ink">30/50/20 weighted:</strong>{" "}
          <span className="num font-semibold text-accent-glow">
            {fmtUSD(dcf.fairValue)}
          </span>
        </span>
        <span className="text-center">
          <strong className="text-ink">Market price:</strong>{" "}
          <span className="num font-semibold">
            {fmtUSD(dcf.snapshot.price)}
          </span>
        </span>
        <span className="text-right">
          <strong className="text-ink">Margin of Safety:</strong>{" "}
          <span
            className={cn(
              "num font-semibold",
              dcf.marginOfSafety > 0 ? "text-pos" : "text-neg"
            )}
          >
            {fmtSignedPct(dcf.marginOfSafety)}
          </span>
        </span>
      </div>
    </section>
  );
}

function BridgeRow({
  label,
  scenarios,
  fmt,
  bold,
  highlight,
  dim,
  sub,
}: {
  label: string;
  scenarios: { name: string; s: ScenarioOutput; col: string }[];
  fmt: (s: ScenarioOutput) => string;
  bold?: boolean;
  highlight?: boolean;
  dim?: boolean;
  sub?: string;
}) {
  return (
    <tr
      className={cn(
        "border-b border-line/40",
        highlight && "bg-accent/5"
      )}
    >
      <td
        className={cn(
          "px-5 py-2.5",
          bold ? "text-ink font-semibold" : "text-ink-dim",
          dim && "text-ink-fade"
        )}
      >
        {label}
        {sub && (
          <div className="text-[10px] text-ink-fade font-normal mt-0.5">
            {sub}
          </div>
        )}
      </td>
      {scenarios.map((sc) => (
        <td
          key={sc.name}
          className={cn(
            "px-5 py-2.5 text-right num",
            bold && "font-semibold",
            highlight && sc.col
          )}
        >
          {fmt(sc.s)}
        </td>
      ))}
    </tr>
  );
}

/* ───────────────────────── HistoricalFinancials ───────────────────────── */

function HistoricalFinancials({ dcf }: { dcf: DcfResult }) {
  const rows = dcf.historical.slice(-5);
  if (rows.length === 0) return null;
  return (
    <section className="card-elev overflow-hidden">
      <div className="px-5 py-3 border-b border-line/60 label-eyebrow">
        Historical Financials (last {rows.length}y, source data)
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line/60 text-ink-fade">
              <th className="px-5 py-2 text-left font-medium label-eyebrow">
                Metric
              </th>
              {rows.map((r) => (
                <th
                  key={r.year}
                  className="px-3 py-2 text-right font-medium num"
                >
                  {r.year}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <HistRow
              label="Revenue"
              rows={rows}
              fmt={(r) => (r.revenue !== null ? fmtUSD(r.revenue) : "—")}
              bold
            />
            <HistRow
              label="EBIT (Operating Income)"
              rows={rows}
              fmt={(r) => (r.ebit !== null ? fmtUSD(r.ebit) : "—")}
            />
            <HistRow
              label="EBIT Margin"
              rows={rows}
              fmt={(r) => (r.ebitMargin !== null ? fmtPct(r.ebitMargin, 1) : "—")}
              dim
            />
            <HistRow
              label="EBITDA"
              rows={rows}
              fmt={(r) => (r.ebitda !== null ? fmtUSD(r.ebitda) : "—")}
            />
            <HistRow
              label="EBITDA Margin"
              rows={rows}
              fmt={(r) =>
                r.ebitdaMargin !== null ? fmtPct(r.ebitdaMargin, 1) : "—"
              }
              dim
            />
            <HistRow
              label="Model UFCF (NOPAT + D&A − CapEx − ΔNWC)"
              rows={rows}
              fmt={(r) => (r.ufcf !== null ? fmtUSD(r.ufcf) : "—")}
              highlight
            />
            <HistRow
              label="Reported FCF (Yahoo levered)"
              rows={rows}
              fmt={(r) => (r.reportedFcf !== null ? fmtUSD(r.reportedFcf) : "—")}
              dim
            />
          </tbody>
        </table>
      </div>
    </section>
  );
}

function HistRow({
  label,
  rows,
  fmt,
  dim,
  bold,
  highlight,
}: {
  label: string;
  rows: DcfResult["historical"];
  fmt: (r: DcfResult["historical"][number]) => string;
  dim?: boolean;
  bold?: boolean;
  highlight?: boolean;
}) {
  return (
    <tr className={cn("border-b border-line/40", highlight && "bg-accent/5")}>
      <td
        className={cn(
          "px-5 py-2.5",
          dim ? "text-ink-fade" : "text-ink-dim",
          bold && "text-ink font-semibold"
        )}
      >
        {label}
      </td>
      {rows.map((r) => (
        <td
          key={r.year}
          className={cn(
            "px-3 py-2.5 text-right num",
            dim && "text-ink-fade",
            bold && "font-semibold",
            highlight && "text-accent-glow"
          )}
        >
          {fmt(r)}
        </td>
      ))}
    </tr>
  );
}

/* ───────────────────────── TickerNews ───────────────────────── */

function TickerNews({ ticker }: { ticker: string }) {
  const [news, setNews] = useState<NewsItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchNews = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/news?ticker=${encodeURIComponent(ticker)}&topN=8&t=${Date.now()}`,
        { cache: "no-store" }
      );
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error ?? "Failed to fetch news");
      }
      const j = await r.json();
      setNews(j.items as NewsItem[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker]);

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-line">
        <div className="flex items-center gap-2.5">
          <Newspaper className="h-4 w-4 text-cyan" />
          <h2 className="text-sm font-semibold tracking-wide">
            {ticker} Headlines
          </h2>
          <span className="label-eyebrow">Yahoo Finance</span>
        </div>
        <button
          onClick={fetchNews}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-bg-elev px-2.5 py-1.5 text-[11px] font-medium text-ink-dim hover:text-ink hover:border-line-strong disabled:opacity-50 transition"
        >
          <RefreshCw
            className={"h-3 w-3 " + (loading ? "animate-spin" : "")}
          />
          Refresh
        </button>
      </div>
      <div className="divide-y divide-line/60">
        {error && (
          <div className="px-5 py-6 text-sm text-neg">{error}</div>
        )}
        {!error && loading && !news && (
          <div className="px-5 py-8 text-sm text-ink-fade">
            Loading headlines for {ticker}…
          </div>
        )}
        {!error && news && news.length === 0 && (
          <div className="px-5 py-8 text-sm text-ink-fade">
            No recent headlines available for {ticker}.
          </div>
        )}
        {news?.map((item) => (
          <NewsRow key={item.uuid} item={item} />
        ))}
      </div>
    </section>
  );
}

function NewsRow({ item }: { item: NewsItem }) {
  return (
    <a
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex gap-4 px-5 py-4 hover:bg-bg-hover transition-colors"
    >
      {item.thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.thumbnail}
          alt=""
          className="hidden sm:block h-16 w-16 rounded-md object-cover flex-shrink-0 bg-bg-elev"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <div className="hidden sm:flex h-16 w-16 rounded-md bg-bg-elev flex-shrink-0 items-center justify-center text-ink-fade">
          <Newspaper className="h-5 w-5" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-[10px] text-ink-fade uppercase tracking-wide mb-1">
          <span className="font-semibold text-ink-dim">{item.publisher}</span>
          <span>•</span>
          <span>{relativeTime(item.publishedAt)}</span>
          {item.type && item.type !== "STORY" && (
            <>
              <span>•</span>
              <span className="text-cyan">{item.type}</span>
            </>
          )}
        </div>
        <h3 className="text-sm font-medium leading-snug text-ink group-hover:text-accent-glow transition-colors">
          {item.title}
          <ExternalLink className="inline-block h-3 w-3 ml-1.5 opacity-50 align-baseline" />
        </h3>
      </div>
    </a>
  );
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - then) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString();
}
