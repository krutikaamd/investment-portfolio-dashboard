"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fmtPct, fmtSignedPct, fmtUSD, tone } from "@/lib/utils";
import { Stat } from "./Stat";
import { VerdictBadge } from "./VerdictBadge";
import type { DcfResult } from "@/lib/dcf";
import { X, ExternalLink } from "lucide-react";
import {
  ConsensusFlag,
  ScenarioTable,
  SensitivityHeatmap,
  WaccBreakdown,
  type SensitivityPayload,
} from "./DcfSections";

interface ApiResponse {
  dcf: DcfResult;
  sensitivity: SensitivityPayload;
  riskFreeRate: number;
}

export function StockDetail({
  ticker,
  onClose,
}: {
  ticker: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setError(null);
    fetch(`/api/valuation?ticker=${encodeURIComponent(ticker)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [ticker]);

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-line">
        <div>
          <h2 className="text-sm font-semibold tracking-wide">
            {ticker} — Quick DCF Preview
          </h2>
          {data && (
            <div className="text-[11px] text-ink-dim mt-0.5">
              {data.dcf.snapshot.longName} • {data.dcf.snapshot.sector ?? "—"}
              {data.dcf.snapshot.industry
                ? ` • ${data.dcf.snapshot.industry}`
                : ""}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/stock/${encodeURIComponent(ticker)}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-[11px] font-semibold text-accent-glow hover:bg-accent/20 transition"
          >
            Open Full DCF Model
            <ExternalLink className="h-3 w-3" />
          </Link>
          <button
            onClick={onClose}
            className="rounded-lg border border-line bg-bg-elev p-1.5 text-ink-dim hover:text-ink hover:border-line-strong transition"
            title="Close preview"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {!data && !error && (
        <div className="px-6 py-14 text-center text-ink-fade text-sm">
          Loading live financials and computing DCF…
        </div>
      )}
      {error && (
        <div className="px-6 py-10 text-center text-neg text-sm">{error}</div>
      )}
      {data && <Content data={data} ticker={ticker} />}
    </div>
  );
}

function Content({ data, ticker }: { data: ApiResponse; ticker: string }) {
  const { dcf, sensitivity, riskFreeRate } = data;
  const mosTone = tone(dcf.marginOfSafety);
  return (
    <div className="p-6 space-y-7">
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-4">
        <Stat label="Current Price" value={fmtUSD(dcf.snapshot.price)} />
        <Stat
          label="DCF Fair Value"
          value={fmtUSD(dcf.fairValue)}
          sub="prob-weighted 30/50/20"
          tone="accent"
        />
        <Stat
          label="Margin of Safety"
          value={fmtSignedPct(dcf.marginOfSafety)}
          tone={mosTone as "pos" | "neg" | "neutral"}
        />
        <Stat
          label="Analyst Target"
          value={
            dcf.snapshot.analystTargetMean
              ? fmtUSD(dcf.snapshot.analystTargetMean)
              : "—"
          }
          sub={
            dcf.upsideToAnalyst !== null
              ? `${fmtSignedPct(dcf.upsideToAnalyst)} vs price`
              : undefined
          }
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <VerdictBadge verdict={dcf.verdict} size="md" />
        <span className="chip bg-bg-elev ring-1 ring-line text-ink-dim">
          Risk-free {fmtPct(riskFreeRate, 2)} (10y UST)
        </span>
        {dcf.snapshot.analystRecommendation && (
          <span className="chip bg-bg-elev ring-1 ring-line text-ink-dim capitalize">
            {dcf.snapshot.analystRecommendation.replace(/_/g, " ")}
          </span>
        )}
        {dcf.snapshot.dividendYield !== null &&
          dcf.snapshot.dividendYield > 0 && (
            <span className="chip bg-bg-elev ring-1 ring-line text-ink-dim">
              Yield {fmtPct(dcf.snapshot.dividendYield, 2)}
            </span>
          )}
      </div>

      {dcf.consensusFlag && dcf.consensusFlag !== "OK" && (
        <ConsensusFlag dcf={dcf} />
      )}

      <WaccBreakdown dcf={dcf} />

      <ScenarioTable dcf={dcf} />

      <SensitivityHeatmap
        sensitivity={sensitivity}
        currentPrice={dcf.snapshot.price}
      />

      {dcf.notes.length > 0 && (
        <div className="rounded-lg border border-line/60 bg-bg-elev/60 p-3 text-[11px] text-ink-fade space-y-1">
          {dcf.notes.map((n, i) => (
            <div key={i}>• {n}</div>
          ))}
        </div>
      )}

      <Link
        href={`/stock/${encodeURIComponent(ticker)}`}
        className="block text-center text-[12px] font-medium text-accent-glow hover:underline pt-2"
      >
        View year-by-year UFCF projections, EV→equity bridge, historical
        financials & ticker news →
      </Link>
    </div>
  );
}
