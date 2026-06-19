"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, RefreshCw, Settings2 } from "lucide-react";
import { PortfolioSummary } from "@/components/PortfolioSummary";
import { PortfolioCharts } from "@/components/PortfolioCharts";
import { ReturnsRibbon } from "@/components/ReturnsRibbon";
import { HoldingsTable } from "@/components/HoldingsTable";
import { AllocationPanel } from "@/components/AllocationPanel";
import { StockDetail } from "@/components/StockDetail";
import { PortfolioEditor } from "@/components/PortfolioEditor";
import { NewsFeed } from "@/components/NewsFeed";
import { WatchlistTable } from "@/components/WatchlistTable";
import { ThemeToggle } from "@/components/ThemeToggle";
import { EarningsCalendar } from "@/components/EarningsCalendar";
import { ExportMenu } from "@/components/ExportMenu";
import { PrintReport } from "@/components/PrintReport";
import { AUTHORS } from "@/lib/site";
import type { PortfolioValuation, AllocationRecommendation } from "@/lib/allocate";

interface ApiResp {
  riskFreeRate: number;
  portfolio: PortfolioValuation;
  allocation: {
    recommendations: AllocationRecommendation[];
    cashDeployed: number;
    cashRemaining: number;
    newTotalValue: number;
  };
}

export default function Page() {
  const [cash, setCash] = useState(5000);
  const [data, setData] = useState<ApiResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const load = useCallback(
    async (cashAmount: number) => {
      setLoading(true);
      setError(null);
      try {
        const resp = await fetch(`/api/allocate?cash=${cashAmount}`);
        if (!resp.ok) {
          throw new Error((await resp.json()).error ?? "Failed to load");
        }
        const j: ApiResp = await resp.json();
        setData(j);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    load(cash);
  }, [cash, load]);

  return (
    <>
    <div className="min-h-screen relative z-10 screen-root">
      <Header
        riskFree={data?.riskFreeRate ?? null}
        onRefresh={() => load(cash)}
        onEdit={() => setEditorOpen(true)}
        loading={loading}
        portfolio={data?.portfolio ?? null}
      />

      <main className="max-w-[1440px] mx-auto px-4 sm:px-6 pt-6 pb-20 space-y-8">
        <div className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-[12px] leading-relaxed text-ink-dim">
          <span className="font-semibold text-warn">Disclaimer:</span> This
          dashboard is for informational purposes only and does{" "}
          <strong className="text-ink">not</strong> constitute financial,
          investment, or trading advice. The author(s) ({AUTHORS}) accept{" "}
          <strong className="text-ink">no liability</strong> for any losses or
          gains arising from use of this tool. Always do your own research and
          consult a qualified professional before investing.
        </div>

        {error && (
          <div className="rounded-xl border border-neg/40 bg-neg/10 p-4 text-sm text-neg">
            {error}
          </div>
        )}

        {data && <ConsensusAlertBanner data={data} onJump={setSelectedTicker} />}

        <section className="card p-7">
          {data ? (
            <PortfolioSummary p={data.portfolio} />
          ) : (
            <div className="text-sm text-ink-fade py-6">
              Loading live valuations from Yahoo Finance…
            </div>
          )}
        </section>

        {data && data.portfolio.holdings.length > 0 && <ReturnsRibbon />}

        {data && data.portfolio.holdings.length > 0 && (
          <PortfolioCharts p={data.portfolio} />
        )}

        {data && data.portfolio.holdings.length > 0 && (
          <EarningsCalendar onSelectTicker={setSelectedTicker} />
        )}

        <section className="space-y-6">
          {data && (
            <HoldingsTable
              holdings={data.portfolio.holdings}
              onSelect={(t) => setSelectedTicker(t)}
              selectedTicker={selectedTicker}
            />
          )}

          <WatchlistTable onSelectTicker={setSelectedTicker} />

          <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6 items-start">
            <AllocationPanel
              cash={cash}
              setCash={setCash}
              recommendations={data?.allocation.recommendations ?? []}
              cashDeployed={data?.allocation.cashDeployed ?? 0}
              cashRemaining={data?.allocation.cashRemaining ?? cash}
              loading={loading && !data}
              onInvested={() => load(cash)}
            />
            <p className="text-[11px] text-ink-fade leading-relaxed px-1 xl:pt-2">
              <strong className="text-ink-dim">How this works:</strong> Yahoo
              Finance pulls each company&apos;s 10-K financials. WACC, terminal
              growth, FCF projections are all computed live per-company —
              nothing hardcoded. Margin of safety = (DCF fair value − price) /
              price drives the overweight / underweight tilt for your next
              investment.
            </p>
          </div>

          {selectedTicker && (
            <StockDetail
              ticker={selectedTicker}
              onClose={() => setSelectedTicker(null)}
            />
          )}

          {data && (
            <NewsFeed
              portfolioTickers={data.portfolio.holdings.map(
                (h) => h.dcf.ticker
              )}
              onSelectTicker={setSelectedTicker}
            />
          )}
        </section>
      </main>

      <PortfolioEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        onSaved={() => load(cash)}
      />

      <footer className="border-t border-line/60 mt-4">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-[12px] text-ink-fade">
          <span>
            Built &amp; maintained by{" "}
            <span className="font-semibold text-ink-dim">{AUTHORS}</span>
          </span>
          <span>
            © {new Date().getFullYear()} · DCF Portfolio. All rights reserved.
          </span>
        </div>
      </footer>
    </div>
    <PrintReport p={data?.portfolio ?? null} />
    </>
  );
}

function ConsensusAlertBanner({
  data,
  onJump,
}: {
  data: ApiResp;
  onJump: (t: string) => void;
}) {
  const flagged = data.portfolio.holdings.filter(
    (h) => h.dcf.consensusFlag === "ALERT" || h.dcf.consensusFlag === "WARN"
  );
  if (flagged.length === 0) return null;
  const alerts = flagged.filter((h) => h.dcf.consensusFlag === "ALERT");
  const warns = flagged.filter((h) => h.dcf.consensusFlag === "WARN");
  const isAlert = alerts.length > 0;
  return (
    <div
      className={
        "rounded-lg border px-3 py-2 flex items-center gap-2 flex-wrap text-[11px] " +
        (isAlert ? "border-neg/40 bg-neg/10" : "border-warn/40 bg-warn/10")
      }
    >
      <span className="leading-none">⚠</span>
      <span className="font-semibold text-ink-dim">
        {isAlert
          ? `${alerts.length} holding${alerts.length === 1 ? "" : "s"} ALERT — DCF materially disagrees with consensus`
          : `${warns.length} holding${warns.length === 1 ? "" : "s"} WARN — DCF moderately disagrees with consensus`}
      </span>
      <span className="flex flex-wrap gap-1.5">
        {flagged
          .sort((a, b) =>
            Math.abs(b.dcf.consensusGap ?? 0) - Math.abs(a.dcf.consensusGap ?? 0)
          )
          .map((h) => (
            <button
              key={h.dcf.ticker}
              onClick={() => onJump(h.dcf.ticker)}
              className={
                "inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium hover:opacity-80 transition " +
                (h.dcf.consensusFlag === "ALERT"
                  ? "bg-neg/20 text-neg"
                  : "bg-warn/20 text-warn")
              }
              title={h.dcf.consensusDiagnosis ?? "Click to view diagnostic"}
            >
              <span className="font-bold">{h.dcf.ticker}</span>
              <span className="num opacity-90">
                {h.dcf.consensusGap !== null
                  ? `${h.dcf.consensusGap > 0 ? "+" : ""}${(h.dcf.consensusGap * 100).toFixed(0)}%`
                  : ""}
              </span>
            </button>
          ))}
      </span>
    </div>
  );
}

function Header({
  riskFree,
  onRefresh,
  onEdit,
  loading,
  portfolio,
}: {
  riskFree: number | null;
  onRefresh: () => void;
  onEdit: () => void;
  loading: boolean;
  portfolio: PortfolioValuation | null;
}) {
  return (
    <header className="border-b border-line/60 bg-bg-elev/40 backdrop-blur-sm sticky top-0 z-30 print:hidden">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-accent to-cyan flex items-center justify-center shadow-glow">
            <Activity className="h-4 w-4 text-white" />
          </div>
          <div>
            <h1 className="text-base font-semibold leading-tight text-gradient">
              DCF Portfolio
            </h1>
            <p className="text-[11px] text-ink-fade">
              Live valuation · Yahoo Finance · Dynamic WACC
            </p>
            <p className="text-[11px] text-ink-dim font-medium mt-0.5">
              by {AUTHORS}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          {riskFree !== null && (
            <div className="hidden md:flex flex-col text-right">
              <span className="text-[10px] uppercase tracking-wider text-ink-fade">
                10-Y UST
              </span>
              <span className="text-sm font-semibold num text-cyan">
                {(riskFree * 100).toFixed(2)}%
              </span>
            </div>
          )}
          <button
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-line bg-bg-elev px-3 py-2 text-xs font-medium text-ink-dim hover:text-ink hover:border-line-strong disabled:opacity-50 transition"
          >
            <RefreshCw className={"h-3.5 w-3.5 " + (loading ? "animate-spin" : "")} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button
            onClick={onEdit}
            className="inline-flex items-center gap-2 rounded-lg border border-line bg-bg-elev px-3 py-2 text-xs font-medium text-ink-dim hover:text-ink hover:border-line-strong transition"
          >
            <Settings2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Holdings</span>
          </button>
          <ExportMenu portfolio={portfolio} />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
