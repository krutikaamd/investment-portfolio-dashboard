"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, Eye, ExternalLink, Plus, RefreshCw, X } from "lucide-react";
import { cn, fmtPct, fmtSignedPct, fmtUSD, tone } from "@/lib/utils";
import { VerdictBadge } from "./VerdictBadge";
import { MiniPriceChart } from "./MiniPriceChart";
import type { DcfResult } from "@/lib/dcf";

const WATCH_COL_SPAN = 12;

interface WatchlistItem {
  ticker: string;
  addedAt: string;
  addedAtPrice: number;
  note?: string;
  dcf: DcfResult;
  performanceSinceAdded: number;
  daysHeld: number;
}

interface Props {
  onSelectTicker?: (ticker: string) => void;
}

export function WatchlistTable({ onSelectTicker }: Props) {
  const [items, setItems] = useState<WatchlistItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addTicker, setAddTicker] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`/api/watchlist?t=${Date.now()}`, {
        cache: "no-store",
      });
      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}));
        throw new Error(j.error ?? "Failed to load watchlist");
      }
      const j: { items: WatchlistItem[] } = await resp.json();
      setItems(j.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const addStock = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = addTicker.trim().toUpperCase();
    if (!t || adding) return;
    setAdding(true);
    setAddError(null);
    try {
      const resp = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: t }),
      });
      const j = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(j.error ?? `Add failed (${resp.status})`);
      }
      setAddTicker("");
      await load();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : String(err));
    } finally {
      setAdding(false);
    }
  };

  const removeStock = async (ticker: string) => {
    if (!confirm(`Remove ${ticker} from your watchlist?`)) return;
    try {
      const resp = await fetch(
        `/api/watchlist?ticker=${encodeURIComponent(ticker)}`,
        { method: "DELETE" }
      );
      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}));
        throw new Error(j.error ?? "Remove failed");
      }
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  const sorted = items
    ? [...items].sort(
        (a, b) => b.dcf.marginOfSafety - a.dcf.marginOfSafety
      )
    : [];

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-line gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <Eye className="h-4 w-4 text-cyan" />
          <h2 className="text-sm font-semibold tracking-wide">Watchlist</h2>
          <span className="label-eyebrow">
            {items?.length ?? 0} tracked · Live DCF
          </span>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-bg-elev px-2.5 py-1.5 text-[11px] font-medium text-ink-dim hover:text-ink hover:border-line-strong disabled:opacity-50 transition"
        >
          <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      <form
        onSubmit={addStock}
        className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-line/60 bg-bg-elev/30"
      >
        <input
          value={addTicker}
          onChange={(e) => setAddTicker(e.target.value.toUpperCase())}
          placeholder="Add ticker (e.g. META)"
          maxLength={10}
          className="flex-1 min-w-[140px] rounded-md border border-line bg-bg px-3 py-1.5 text-sm font-medium uppercase tracking-wide placeholder:text-ink-fade placeholder:normal-case placeholder:tracking-normal focus:outline-none focus:border-accent/60"
        />
        <button
          type="submit"
          disabled={!addTicker.trim() || adding}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent/20 text-accent border border-accent/40 px-3 py-1.5 text-xs font-semibold hover:bg-accent/30 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          <Plus className="h-3.5 w-3.5" />
          {adding ? "Adding…" : "Add to watchlist"}
        </button>
        {addError && (
          <span className="text-[11px] text-neg w-full">{addError}</span>
        )}
      </form>

      <div className="overflow-x-auto">
        {error && (
          <div className="px-5 py-6 text-sm text-neg">{error}</div>
        )}
        {!error && !items && loading && (
          <div className="px-5 py-8 text-sm text-ink-fade">
            Loading watchlist valuations…
          </div>
        )}
        {!error && items && items.length === 0 && (
          <div className="px-5 py-10 text-center text-sm text-ink-fade">
            Nothing on your watchlist yet. Add a ticker above to start tracking
            it with live DCF.
          </div>
        )}
        {sorted.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-fade label-eyebrow border-b border-line">
                <th className="px-5 py-3 font-medium">Ticker</th>
                <th className="px-3 py-3 font-medium">Price</th>
                <th className="px-3 py-3 font-medium text-right hidden md:table-cell">Since Added</th>
                <th className="px-3 py-3 font-medium text-right">DCF Fair</th>
                <th className="px-3 py-3 font-medium text-right hidden lg:table-cell">Analyst</th>
                <th className="px-3 py-3 font-medium text-right">MoS</th>
                <th className="px-3 py-3 font-medium text-right hidden lg:table-cell">P/E</th>
                <th className="px-3 py-3 font-medium text-right hidden lg:table-cell">Div Y</th>
                <th className="px-5 py-3 font-medium hidden sm:table-cell">Verdict</th>
                <th className="px-3 py-3 font-medium text-right hidden sm:table-cell">Model</th>
                <th className="px-3 py-3 font-medium"></th>
                <th className="px-3 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((w) => {
                const perfTone = tone(w.performanceSinceAdded);
                const mosTone = tone(w.dcf.marginOfSafety);
                const isOpen = expanded === w.ticker;
                return (
                  <Fragment key={w.ticker}>
                  <tr
                    onClick={() => onSelectTicker?.(w.ticker)}
                    className={cn(
                      "border-b border-line/60 hover:bg-bg-hover transition-colors cursor-pointer",
                      isOpen && "bg-bg-hover"
                    )}
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex flex-col gap-0.5">
                        <Link
                          href={`/stock/${encodeURIComponent(w.ticker)}`}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 font-semibold text-accent-glow hover:underline w-fit"
                          title={`Open full DCF model for ${w.ticker}`}
                        >
                          {w.ticker}
                          <ExternalLink className="h-3 w-3 opacity-70" />
                        </Link>
                        <span className="text-[11px] text-ink-dim truncate max-w-[160px]">
                          {w.dcf.snapshot.longName}
                        </span>
                        {w.dcf.snapshot.sector && (
                          <span className="inline-flex w-fit text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-bg-elev text-ink-dim border border-line/60">
                            {w.dcf.snapshot.sector}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3.5 num">
                      {fmtUSD(w.dcf.snapshot.price)}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-3.5 text-right num hidden md:table-cell",
                        perfTone === "pos" && "text-pos",
                        perfTone === "neg" && "text-neg"
                      )}
                    >
                      <div>{fmtSignedPct(w.performanceSinceAdded)}</div>
                      <div className="text-[11px] opacity-80">
                        from {fmtUSD(w.addedAtPrice)} · {w.daysHeld}d
                      </div>
                    </td>
                    <td className="px-3 py-3.5 text-right num text-accent-glow">
                      <div className="flex items-center justify-end gap-1.5">
                        {w.dcf.consensusFlag === "ALERT" && (
                          <span
                            title={w.dcf.consensusDiagnosis ?? undefined}
                            className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-neg/20 text-neg leading-none"
                          >
                            ⚠
                          </span>
                        )}
                        {w.dcf.consensusFlag === "WARN" && (
                          <span
                            title={w.dcf.consensusDiagnosis ?? undefined}
                            className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-warn/20 text-warn leading-none"
                          >
                            !
                          </span>
                        )}
                        <span>{fmtUSD(w.dcf.fairValue)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3.5 text-right num text-ink-dim hidden lg:table-cell">
                      {w.dcf.snapshot.analystTargetMean
                        ? fmtUSD(w.dcf.snapshot.analystTargetMean)
                        : "—"}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-3.5 text-right num font-semibold",
                        mosTone === "pos" && "text-pos",
                        mosTone === "neg" && "text-neg"
                      )}
                    >
                      {fmtSignedPct(w.dcf.marginOfSafety)}
                    </td>
                    <td className="px-3 py-3.5 text-right num text-ink-dim hidden lg:table-cell">
                      {w.dcf.snapshot.trailingPE
                        ? w.dcf.snapshot.trailingPE.toFixed(1)
                        : "—"}
                    </td>
                    <td className="px-3 py-3.5 text-right num text-ink-dim hidden lg:table-cell">
                      {w.dcf.snapshot.dividendYield !== null &&
                      w.dcf.snapshot.dividendYield !== undefined
                        ? fmtPct(w.dcf.snapshot.dividendYield, 2)
                        : "—"}
                    </td>
                    <td className="px-5 py-3.5 hidden sm:table-cell">
                      <VerdictBadge verdict={w.dcf.verdict} />
                    </td>
                    <td className="px-3 py-3.5 text-right hidden sm:table-cell">
                      <Link
                        href={`/stock/${encodeURIComponent(w.ticker)}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1 text-[11px] font-semibold text-accent-glow hover:bg-accent/20 transition"
                        title={`Open full DCF model for ${w.ticker}`}
                      >
                        Open
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </td>
                    <td className="px-3 py-3.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeStock(w.ticker);
                        }}
                        title={`Remove ${w.ticker} from watchlist`}
                        className="inline-flex items-center justify-center h-6 w-6 rounded text-ink-fade hover:text-neg hover:bg-neg/10 transition"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </td>
                    <td className="px-3 py-3.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpanded(isOpen ? null : w.ticker);
                        }}
                        title={isOpen ? "Hide details" : "Show 6-month chart"}
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
                      <td colSpan={WATCH_COL_SPAN} className="px-5 py-5">
                        <WatchlistDetail w={w} />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function WatchlistDetail({ w }: { w: WatchlistItem }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
      <div className="card-elev p-4">
        <MiniPriceChart ticker={w.ticker} months={6} />
      </div>
      <div className="card-elev p-4 space-y-3">
        <span className="label-eyebrow">Watch Notes</span>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <Field label="Added" value={new Date(w.addedAt).toLocaleDateString()} />
          <Field label="Added at price" value={fmtUSD(w.addedAtPrice)} />
          <Field
            label="Since added"
            value={fmtSignedPct(w.performanceSinceAdded)}
            tone={tone(w.performanceSinceAdded)}
          />
          <Field label="Days tracked" value={`${w.daysHeld}d`} />
          <Field label="DCF fair value" value={fmtUSD(w.dcf.fairValue)} accent />
          <Field
            label="Margin of safety"
            value={fmtSignedPct(w.dcf.marginOfSafety)}
            tone={tone(w.dcf.marginOfSafety)}
          />
        </div>
        {w.note && (
          <p className="text-[12px] text-ink-dim leading-relaxed border-t border-line/60 pt-3">
            {w.note}
          </p>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  tone: t,
  accent,
}: {
  label: string;
  value: string;
  tone?: "pos" | "neg" | "neutral";
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-ink-fade">
        {label}
      </span>
      <span
        className={cn(
          "num font-medium",
          accent && "text-accent-glow",
          t === "pos" && "text-pos",
          t === "neg" && "text-neg"
        )}
      >
        {value}
      </span>
    </div>
  );
}
