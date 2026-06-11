"use client";

import { useEffect, useRef, useState } from "react";
import { Download, FileText, Printer, ChevronDown } from "lucide-react";
import type { PortfolioValuation } from "@/lib/allocate";

function csvEscape(v: string | number | null | undefined): string {
  if (v === null || v === undefined || (typeof v === "number" && !isFinite(v)))
    return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildCsv(p: PortfolioValuation): string {
  const header = [
    "Ticker",
    "Name",
    "Sector",
    "Price",
    "Shares",
    "MarketValue",
    "CostBasis",
    "UnrealisedPL",
    "UnrealisedPLPct",
    "DCFFairValue",
    "AnalystTarget",
    "MarginOfSafety",
    "CurrentWeight",
    "Verdict",
  ];
  const rows = [...p.holdings]
    .sort((a, b) => b.marketValue - a.marketValue)
    .map((h) =>
      [
        h.dcf.ticker,
        h.dcf.snapshot.longName ?? "",
        h.dcf.snapshot.sector ?? "",
        h.dcf.snapshot.price,
        h.holding.shares,
        h.marketValue,
        h.costBasis,
        h.unrealisedPL,
        h.unrealisedPLPct,
        h.dcf.fairValue,
        h.dcf.snapshot.analystTargetMean ?? "",
        h.dcf.marginOfSafety,
        h.currentWeight,
        h.dcf.verdict,
      ]
        .map(csvEscape)
        .join(",")
    );
  const totals = [
    "TOTAL",
    "",
    "",
    "",
    "",
    p.totalMarketValue,
    p.totalCostBasis,
    p.totalPL,
    p.totalPLPct,
    "",
    "",
    p.portfolioMarginOfSafety,
    "",
    "",
  ]
    .map(csvEscape)
    .join(",");

  return [header.join(","), ...rows, totals].join("\n");
}

export function ExportMenu({ portfolio }: { portfolio: PortfolioValuation | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const downloadCsv = () => {
    if (!portfolio) return;
    const csv = buildCsv(portfolio);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dcf-portfolio-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setOpen(false);
  };

  const printReport = () => {
    setOpen(false);
    // Give the menu a tick to close before opening the print dialog.
    setTimeout(() => window.print(), 50);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={!portfolio}
        className="inline-flex items-center gap-2 rounded-lg border border-line bg-bg-elev px-3 py-2 text-xs font-medium text-ink-dim hover:text-ink hover:border-line-strong disabled:opacity-50 transition"
      >
        <Download className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Export</span>
        <ChevronDown className="h-3 w-3 opacity-70" />
      </button>
      {open && (
        <div className="absolute right-0 mt-1.5 w-52 rounded-lg border border-line bg-bg-card shadow-card z-40 overflow-hidden">
          <button
            onClick={downloadCsv}
            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-xs text-ink-dim hover:bg-bg-hover hover:text-ink transition text-left"
          >
            <FileText className="h-3.5 w-3.5 text-cyan" />
            <span>
              Download CSV
              <span className="block text-[10px] text-ink-fade">
                Holdings &amp; valuations
              </span>
            </span>
          </button>
          <button
            onClick={printReport}
            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-xs text-ink-dim hover:bg-bg-hover hover:text-ink transition text-left border-t border-line/60"
          >
            <Printer className="h-3.5 w-3.5 text-accent-glow" />
            <span>
              Print / Save PDF
              <span className="block text-[10px] text-ink-fade">
                One-page report
              </span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
