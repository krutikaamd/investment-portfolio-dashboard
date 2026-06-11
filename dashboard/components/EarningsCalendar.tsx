"use client";

import { useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";

interface EarningsItem {
  ticker: string;
  longName: string;
  earningsDate: string | null;
  isEstimate: boolean;
  epsEstimate: number | null;
  inPortfolio: boolean;
}

interface EarningsResponse {
  asOf: string;
  items: EarningsItem[];
  error?: string;
}

function daysUntil(iso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(iso + "T00:00:00");
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

function fmtDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function relLabel(days: number): string {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 0) return `${Math.abs(days)}d ago`;
  if (days < 7) return `in ${days}d`;
  if (days < 30) return `in ${Math.round(days / 7)}w`;
  return `in ${Math.round(days / 30)}mo`;
}

export function EarningsCalendar({
  onSelectTicker,
}: {
  onSelectTicker?: (t: string) => void;
}) {
  const [data, setData] = useState<EarningsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/earnings?t=${Date.now()}`, { cache: "no-store" })
      .then(async (r) => {
        const j = (await r.json()) as EarningsResponse;
        if (!r.ok) throw new Error(j.error ?? `Failed (${r.status})`);
        return j;
      })
      .then((j) => {
        if (!cancelled) setData(j);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Upcoming (today onward), then most-recent past as a fallback if nothing is upcoming.
  const upcoming = (data?.items ?? [])
    .filter((i) => i.earningsDate && daysUntil(i.earningsDate) >= 0)
    .slice(0, 12);

  if (error) return null;
  if (data && upcoming.length === 0) return null;

  return (
    <section className="card p-6 print:hidden">
      <div className="flex items-center gap-2.5 mb-4">
        <CalendarClock className="h-4 w-4 text-accent-glow" />
        <h2 className="text-sm font-semibold tracking-wide">
          Upcoming earnings
        </h2>
        <span className="text-[11px] text-ink-fade">
          next reports across your holdings &amp; watchlist
        </span>
      </div>

      {!data ? (
        <div className="text-sm text-ink-fade py-2">Loading earnings dates…</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {upcoming.map((item) => {
            const days = item.earningsDate ? daysUntil(item.earningsDate) : 0;
            const soon = days <= 7;
            return (
              <button
                key={item.ticker}
                onClick={() => onSelectTicker?.(item.ticker)}
                title={`${item.longName}${
                  item.isEstimate ? " · estimated date" : ""
                }`}
                className={cn(
                  "text-left rounded-lg border bg-bg-elev/60 px-3 py-2.5 transition hover:border-line-strong",
                  soon ? "border-accent/40" : "border-line"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-sm text-ink">
                    {item.ticker}
                  </span>
                  <span
                    className={cn(
                      "text-[10px] font-semibold num px-1.5 py-0.5 rounded",
                      soon
                        ? "bg-accent/15 text-accent-glow"
                        : "bg-line/40 text-ink-dim"
                    )}
                  >
                    {item.earningsDate ? relLabel(days) : "—"}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="num text-[12px] text-ink-dim">
                    {item.earningsDate ? fmtDate(item.earningsDate) : "TBD"}
                    {item.isEstimate && (
                      <span className="text-ink-fade"> est.</span>
                    )}
                  </span>
                  {!item.inPortfolio && (
                    <span className="text-[9px] uppercase tracking-wide text-ink-fade">
                      watch
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
