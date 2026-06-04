"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, RefreshCw, Settings2 } from "lucide-react";
import { PortfolioSummary } from "@/components/PortfolioSummary";
import { ReturnsRibbon } from "@/components/ReturnsRibbon";
import { HoldingsTable } from "@/components/HoldingsTable";
import { AllocationPanel } from "@/components/AllocationPanel";
import { StockDetail } from "@/components/StockDetail";
import { PortfolioEditor } from "@/components/PortfolioEditor";
import { NewsFeed } from "@/components/NewsFeed";
import { WatchlistTable } from "@/components/WatchlistTable";
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
    <div className="min-h-screen">
      <Header
        riskFree={data?.riskFreeRate ?? null}
        onRefresh={() => load(cash)}
        onEdit={() => setEditorOpen(true)}
        loading={loading}
      />

      <main className="max-w-[1440px] mx-auto px-6 pt-6 pb-20 space-y-8">
        {error && (
          <div className="rounded-xl border border-neg/40 bg-neg/10 p-4 text-sm text-neg">
            {error}
          </div>
        )}

        <div className="rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 text-[12px] text-ink-dim flex items-center justify-between gap-3 flex-wrap">
          <span>
            <span className="font-semibold text-accent-glow">New:</span> Click
            any{" "}
            <span className="font-mono text-accent-glow">
              Open ↗
            </span>{" "}
            button (or the coloured ticker symbol) in the tables below to view
            the <strong className="text-ink">full DCF model</strong> for that
            stock — year-by-year UFCF projections, EV→equity bridge, historical
            financials, sensitivity grid, and per-ticker news.
          </span>
        </div>

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
    </div>
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
        "rounded-xl border p-4 " +
        (isAlert
          ? "border-neg/40 bg-neg/10"
          : "border-warn/40 bg-warn/10")
      }
    >
      <div className="flex items-start gap-3">
        <span className="text-lg leading-none mt-0.5">⚠</span>
        <div className="flex-1 space-y-2">
          <div className="text-sm font-semibold">
            {isAlert
              ? `${alerts.length} holding${alerts.length === 1 ? "" : "s"} flagged ALERT — DCF materially disagrees with sell-side consensus`
              : `${warns.length} holding${warns.length === 1 ? "" : "s"} flagged WARN — DCF moderately disagrees with consensus`}
          </div>
          <div className="flex flex-wrap gap-2">
            {flagged
              .sort((a, b) =>
                Math.abs(b.dcf.consensusGap ?? 0) - Math.abs(a.dcf.consensusGap ?? 0)
              )
              .map((h) => (
                <button
                  key={h.dcf.ticker}
                  onClick={() => onJump(h.dcf.ticker)}
                  className={
                    "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium hover:opacity-80 transition " +
                    (h.dcf.consensusFlag === "ALERT"
                      ? "bg-neg/20 text-neg"
                      : "bg-warn/20 text-warn")
                  }
                  title={h.dcf.consensusDiagnosis ?? undefined}
                >
                  <span className="font-bold">{h.dcf.ticker}</span>
                  <span className="num opacity-90">
                    {h.dcf.consensusGap !== null
                      ? `${h.dcf.consensusGap > 0 ? "+" : ""}${(h.dcf.consensusGap * 100).toFixed(0)}%`
                      : ""}
                  </span>
                </button>
              ))}
          </div>
          <p className="text-[11px] text-ink-dim leading-relaxed">
            Click a ticker to see the diagnostic explanation. The DCF is shown
            as-is — no post-hoc anchoring. WARN/ALERT means the model
            meaningfully disagrees with the street; review the bull/bear range
            and the diagnosis to decide which view you trust.
          </p>
        </div>
      </div>
    </div>
  );
}

function Header({
  riskFree,
  onRefresh,
  onEdit,
  loading,
}: {
  riskFree: number | null;
  onRefresh: () => void;
  onEdit: () => void;
  loading: boolean;
}) {
  return (
    <header className="border-b border-line/60 bg-bg-elev/40 backdrop-blur-sm sticky top-0 z-30">
      <div className="max-w-[1440px] mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-accent to-cyan flex items-center justify-center shadow-glow">
            <Activity className="h-4 w-4 text-white" />
          </div>
          <div>
            <h1 className="text-base font-semibold leading-tight">
              DCF Portfolio
            </h1>
            <p className="text-[11px] text-ink-fade">
              Live valuation · Yahoo Finance · Dynamic WACC
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
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
            Refresh
          </button>
          <button
            onClick={onEdit}
            className="inline-flex items-center gap-2 rounded-lg border border-line bg-bg-elev px-3 py-2 text-xs font-medium text-ink-dim hover:text-ink hover:border-line-strong transition"
          >
            <Settings2 className="h-3.5 w-3.5" />
            Holdings
          </button>
        </div>
      </div>
    </header>
  );
}
