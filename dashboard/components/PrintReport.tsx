"use client";

import { fmtPct, fmtSignedPct, fmtUSD } from "@/lib/utils";
import { AUTHORS } from "@/lib/site";
import type { PortfolioValuation } from "@/lib/allocate";

/**
 * Print-only one-page portfolio report. Hidden on screen (see globals.css
 * `@media print` rules) and rendered with explicit light styling so it prints
 * cleanly regardless of the active light/dark theme.
 */
export function PrintReport({ p }: { p: PortfolioValuation | null }) {
  if (!p) return null;
  const today = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const holdings = [...p.holdings].sort((a, b) => b.marketValue - a.marketValue);

  return (
    <div className="print-report">
      <div className="pr-head">
        <div>
          <h1>DCF Portfolio Report</h1>
          <p>Live valuations · Yahoo Finance · Dynamic WACC</p>
        </div>
        <div className="pr-date">{today}</div>
      </div>

      <div className="pr-kpis">
        <Kpi label="Market Value" value={fmtUSD(p.totalMarketValue, 0)} />
        <Kpi label="Cost Basis" value={fmtUSD(p.totalCostBasis, 0)} />
        <Kpi
          label="Unrealised P/L"
          value={`${fmtUSD(p.totalPL, 0)} (${fmtSignedPct(p.totalPLPct)})`}
        />
        <Kpi label="Weighted Fair Value" value={fmtUSD(p.weightedFairValue, 0)} />
        <Kpi
          label="Portfolio MoS"
          value={fmtSignedPct(p.portfolioMarginOfSafety)}
        />
        <Kpi label="Positions" value={String(p.holdings.length)} />
      </div>

      <table className="pr-table">
        <thead>
          <tr>
            <th>Ticker</th>
            <th>Name</th>
            <th className="r">Price</th>
            <th className="r">Shares</th>
            <th className="r">Mkt Value</th>
            <th className="r">P/L</th>
            <th className="r">DCF Fair</th>
            <th className="r">MoS</th>
            <th className="r">Weight</th>
            <th>Verdict</th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((h) => (
            <tr key={h.dcf.ticker}>
              <td className="b">{h.dcf.ticker}</td>
              <td className="muted">{h.dcf.snapshot.longName ?? ""}</td>
              <td className="r">{fmtUSD(h.dcf.snapshot.price)}</td>
              <td className="r">{h.holding.shares}</td>
              <td className="r">{fmtUSD(h.marketValue, 0)}</td>
              <td className="r">{fmtSignedPct(h.unrealisedPLPct)}</td>
              <td className="r">{fmtUSD(h.dcf.fairValue)}</td>
              <td className="r">{fmtSignedPct(h.dcf.marginOfSafety)}</td>
              <td className="r">{fmtPct(h.currentWeight)}</td>
              <td>{h.dcf.verdict}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="pr-foot">
        Margin of safety = (DCF fair value − price) / price. Fair values are
        computed live per company (WACC, terminal growth and FCF projections);
        nothing is hardcoded. Generated {today}. For informational use only —
        not investment advice. Built &amp; maintained by {AUTHORS}. ©{" "}
        {new Date().getFullYear()} DCF Portfolio.
      </p>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="pr-kpi">
      <span className="pr-kpi-l">{label}</span>
      <span className="pr-kpi-v">{value}</span>
    </div>
  );
}
