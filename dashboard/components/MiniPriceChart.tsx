"use client";

import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  YAxis,
} from "recharts";
import { cn, fmtSignedPct, fmtUSD } from "@/lib/utils";

interface HistoryResponse {
  ticker: string;
  bars: { date: string; close: number }[];
  changePct: number | null;
  error?: string;
}

/**
 * Compact trailing price chart for a single ticker, used inside the per-stock
 * dropdown rows. Self-fetches from /api/history and caches per ticker+months.
 */
export function MiniPriceChart({
  ticker,
  months = 6,
}: {
  ticker: string;
  months?: number;
}) {
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    fetch(`/api/history?ticker=${encodeURIComponent(ticker)}&months=${months}`)
      .then(async (r) => {
        const j = (await r.json()) as HistoryResponse;
        if (!r.ok) throw new Error(j.error ?? `Failed (${r.status})`);
        return j;
      })
      .then((j) => !cancelled && setData(j))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [ticker, months]);

  const up = (data?.changePct ?? 0) >= 0;
  const stroke = up ? "#22c55e" : "#ef4444";
  const id = `mini-${ticker}-${up ? "up" : "dn"}`;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="label-eyebrow">{months}-Month Price</span>
        {data?.changePct !== null && data?.changePct !== undefined && (
          <span
            className={cn(
              "num text-xs font-semibold",
              up ? "text-pos" : "text-neg"
            )}
          >
            {fmtSignedPct(data.changePct)}
          </span>
        )}
      </div>
      <div className="h-28">
        {error ? (
          <div className="flex h-full items-center justify-center text-[11px] text-ink-fade">
            No price history
          </div>
        ) : !data ? (
          <div className="flex h-full items-center justify-center text-[11px] text-ink-fade">
            Loading…
          </div>
        ) : data.bars.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[11px] text-ink-fade">
            No price history
          </div>
        ) : (
          <ResponsiveContainer>
            <AreaChart
              data={data.bars}
              margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={stroke} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                </linearGradient>
              </defs>
              <YAxis hide domain={["dataMin", "dataMax"]} />
              <Tooltip content={<MiniTooltip />} />
              <Area
                type="monotone"
                dataKey="close"
                stroke={stroke}
                strokeWidth={2}
                fill={`url(#${id})`}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function MiniTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload?: { date: string; close: number } }[];
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  if (!d) return null;
  return (
    <div className="rounded-md border border-line bg-bg-elev/95 px-2 py-1 shadow-card backdrop-blur-sm">
      <div className="text-[10px] text-ink-fade">
        {new Date(d.date).toLocaleDateString()}
      </div>
      <div className="num text-[11px] font-medium text-ink">
        {fmtUSD(d.close)}
      </div>
    </div>
  );
}
