import type { Holding } from "./allocate";
import type { PriceBar } from "./yahoo";

export type PeriodKey = "1D" | "1W" | "1M" | "3M" | "6M" | "YTD";

export interface PeriodReturn {
  key: PeriodKey;
  label: string;
  startDate: string | null;        // ISO date of the period anchor, null if unavailable
  endDate: string | null;          // ISO date of the latest close used
  startValue: number;              // Portfolio value at startDate (look-through)
  endValue: number;                // Portfolio value at endDate (look-through)
  returnPct: number | null;        // (endValue/startValue) − 1
  dollarChange: number | null;
  benchmarkReturnPct: number | null;
  benchmarkLabel: string;          // e.g. "S&P 500"
  coverage: number;                // fraction of current portfolio market value with full data for this period
}

export interface ReturnsResult {
  asOf: string;                    // ISO datetime of latest close used
  benchmarkTicker: string;
  benchmarkLabel: string;
  totalCurrentValue: number;
  periods: PeriodReturn[];
}

/**
 * Build an indexed price map keyed by ISO date for O(1) lookup of a close on
 * (or before) a given date. We also keep the sorted date list for "find
 * nearest preceding trading day" semantics.
 */
function indexHistory(bars: PriceBar[]): {
  byDate: Map<string, number>;
  dates: string[];
} {
  const byDate = new Map<string, number>();
  const dates: string[] = [];
  for (const b of bars) {
    byDate.set(b.date, b.close);
    dates.push(b.date);
  }
  return { byDate, dates };
}

/**
 * Closest-on-or-before lookup. Markets are closed on weekends/holidays — if
 * the anchor date lands on a Saturday, we fall back to the prior trading day.
 */
function closeOnOrBefore(
  idx: { byDate: Map<string, number>; dates: string[] },
  targetIso: string
): { date: string; close: number } | null {
  if (idx.dates.length === 0) return null;
  // Binary search for the largest date <= targetIso.
  let lo = 0;
  let hi = idx.dates.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (idx.dates[mid] <= targetIso) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (best < 0) return null;
  const date = idx.dates[best];
  return { date, close: idx.byDate.get(date)! };
}

function isoFromOffsetDays(today: Date, daysBack: number): string {
  const d = new Date(today);
  d.setUTCDate(d.getUTCDate() - daysBack);
  return d.toISOString().slice(0, 10);
}

function isoFromMonths(today: Date, monthsBack: number): string {
  const d = new Date(today);
  d.setUTCMonth(d.getUTCMonth() - monthsBack);
  return d.toISOString().slice(0, 10);
}

function startOfYearIso(today: Date): string {
  return `${today.getUTCFullYear()}-01-01`;
}

interface PeriodSpec {
  key: PeriodKey;
  label: string;
  anchor: (today: Date) => string;
}

const PERIOD_SPECS: PeriodSpec[] = [
  { key: "1D", label: "1 Day", anchor: (t) => isoFromOffsetDays(t, 1) },
  { key: "1W", label: "1 Week", anchor: (t) => isoFromOffsetDays(t, 7) },
  { key: "1M", label: "1 Month", anchor: (t) => isoFromMonths(t, 1) },
  { key: "3M", label: "3 Months", anchor: (t) => isoFromMonths(t, 3) },
  { key: "6M", label: "6 Months", anchor: (t) => isoFromMonths(t, 6) },
  { key: "YTD", label: "YTD", anchor: (t) => startOfYearIso(t) },
];

/**
 * Compute look-through portfolio returns: assume current holdings were held
 * for the full window and apply historical closes to compute (start, end)
 * portfolio values. Returns are the % delta between those two values.
 *
 * Look-through is the standard quick-look framing used by Schwab/Fidelity
 * portfolio reports — it tells you "what would my current basket have done"
 * over each window. It's NOT a true time-weighted return (which would
 * require transaction history), but it's the most useful single-number view
 * when transaction history isn't available.
 *
 * `coverage` reports the fraction of current portfolio market value that had
 * a full history for the period — so when an IPO or recent add lacks data
 * for the 5Y window, the user knows the return only reflects (say) 87% of
 * the book.
 */
export function computeReturns(
  holdings: Holding[],
  histories: Map<string, PriceBar[]>,
  benchmark: PriceBar[],
  benchmarkLabel = "S&P 500"
): ReturnsResult {
  const today = new Date();
  const indexed = new Map(
    [...histories.entries()].map(([t, h]) => [t.toUpperCase(), indexHistory(h)])
  );
  const benchIdx = indexHistory(benchmark);

  // Use the latest common close date across the portfolio as the "end"
  // anchor so we're not mixing intraday with stale data.
  let endIso = "";
  for (const idx of indexed.values()) {
    const last = idx.dates[idx.dates.length - 1] ?? "";
    if (last && (!endIso || last > endIso)) endIso = last;
  }
  if (!endIso && benchIdx.dates.length > 0) {
    endIso = benchIdx.dates[benchIdx.dates.length - 1];
  }
  if (!endIso) endIso = today.toISOString().slice(0, 10);

  // Look-through current portfolio value, computed off the latest close.
  let totalCurrent = 0;
  const currentCloses = new Map<string, number>();
  for (const h of holdings) {
    const t = h.ticker.toUpperCase();
    const idx = indexed.get(t);
    if (!idx) continue;
    const last = closeOnOrBefore(idx, endIso);
    if (!last) continue;
    currentCloses.set(t, last.close);
    totalCurrent += last.close * h.shares;
  }

  const periods: PeriodReturn[] = PERIOD_SPECS.map((spec) => {
    const anchorIso = spec.anchor(today);
    let startVal = 0;
    let endVal = 0;
    let covered = 0;
    for (const h of holdings) {
      const t = h.ticker.toUpperCase();
      const idx = indexed.get(t);
      if (!idx) continue;
      const startBar = closeOnOrBefore(idx, anchorIso);
      const endBar = closeOnOrBefore(idx, endIso);
      if (!startBar || !endBar) continue;
      // Skip if the anchor preceded the earliest available bar — would
      // overstate the period return.
      if (idx.dates.length > 0 && idx.dates[0] > anchorIso) continue;
      startVal += startBar.close * h.shares;
      endVal += endBar.close * h.shares;
      covered += endBar.close * h.shares;
    }

    const returnPct =
      startVal > 0 ? endVal / startVal - 1 : null;

    let benchmarkReturnPct: number | null = null;
    const benchStart = closeOnOrBefore(benchIdx, anchorIso);
    const benchEnd = closeOnOrBefore(benchIdx, endIso);
    if (
      benchStart &&
      benchEnd &&
      benchStart.close > 0 &&
      (benchIdx.dates.length === 0 || benchIdx.dates[0] <= anchorIso)
    ) {
      benchmarkReturnPct = benchEnd.close / benchStart.close - 1;
    }

    return {
      key: spec.key,
      label: spec.label,
      startDate: startVal > 0 ? anchorIso : null,
      endDate: endVal > 0 ? endIso : null,
      startValue: startVal,
      endValue: endVal,
      returnPct,
      dollarChange: returnPct !== null ? endVal - startVal : null,
      benchmarkReturnPct,
      benchmarkLabel,
      coverage: totalCurrent > 0 ? covered / totalCurrent : 0,
    };
  });

  return {
    asOf: endIso,
    benchmarkTicker: "^GSPC",
    benchmarkLabel,
    totalCurrentValue: totalCurrent,
    periods,
  };
}
