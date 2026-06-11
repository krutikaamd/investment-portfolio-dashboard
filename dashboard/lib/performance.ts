import type { Holding } from "./allocate";
import type { PriceBar } from "./yahoo";

export interface PerformancePoint {
  date: string;
  portfolio: number; // indexed to 100 at the window start
  benchmark: number; // indexed to 100 at the window start
  portfolioValue: number; // look-through dollar value on that day
}

export interface PerformanceSeries {
  points: PerformancePoint[];
  startDate: string | null;
  endDate: string | null;
  startValue: number;
  endValue: number;
  portfolioReturnPct: number | null;
  benchmarkReturnPct: number | null;
  benchmarkLabel: string;
  coverage: number; // fraction of current book with data across the window
}

function index(bars: PriceBar[]): { byDate: Map<string, number>; dates: string[] } {
  const byDate = new Map<string, number>();
  const dates: string[] = [];
  for (const b of bars) {
    byDate.set(b.date, b.close);
    dates.push(b.date);
  }
  return { byDate, dates };
}

function closeOnOrBefore(
  idx: { byDate: Map<string, number>; dates: string[] },
  targetIso: string
): number | null {
  if (idx.dates.length === 0) return null;
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
  return idx.byDate.get(idx.dates[best])!;
}

/**
 * Build a daily look-through performance series for the current basket vs a
 * benchmark, both rebased to 100 at the window start. We iterate over the
 * benchmark's trading days (the canonical calendar) and value the portfolio on
 * each using each holding's most recent close on-or-before that day.
 */
export function computePerformanceSeries(
  holdings: Holding[],
  histories: Map<string, PriceBar[]>,
  benchmark: PriceBar[],
  fromIso: string,
  benchmarkLabel = "S&P 500"
): PerformanceSeries {
  const indexed = new Map(
    [...histories.entries()].map(([t, h]) => [t.toUpperCase(), index(h)])
  );
  const benchIdx = index(benchmark);

  const calendar = benchIdx.dates.filter((d) => d >= fromIso);
  if (calendar.length === 0) {
    return {
      points: [],
      startDate: null,
      endDate: null,
      startValue: 0,
      endValue: 0,
      portfolioReturnPct: null,
      benchmarkReturnPct: null,
      benchmarkLabel,
      coverage: 0,
    };
  }

  const portfolioValueOn = (iso: string): number => {
    let v = 0;
    for (const h of holdings) {
      const idx = indexed.get(h.ticker.toUpperCase());
      if (!idx) continue;
      const c = closeOnOrBefore(idx, iso);
      if (c !== null) v += c * h.shares;
    }
    return v;
  };

  // Coverage: fraction of latest book value whose history spans the window.
  const endIso = calendar[calendar.length - 1];
  let fullBook = 0;
  let coveredBook = 0;
  for (const h of holdings) {
    const idx = indexed.get(h.ticker.toUpperCase());
    const endC = idx ? closeOnOrBefore(idx, endIso) : null;
    if (endC === null || !idx) continue;
    fullBook += endC * h.shares;
    if (idx.dates.length > 0 && idx.dates[0] <= fromIso) {
      coveredBook += endC * h.shares;
    }
  }

  const startPortfolio = portfolioValueOn(calendar[0]);
  const startBench = closeOnOrBefore(benchIdx, calendar[0]);
  const points: PerformancePoint[] = [];
  for (const iso of calendar) {
    const pv = portfolioValueOn(iso);
    const bc = closeOnOrBefore(benchIdx, iso);
    points.push({
      date: iso,
      portfolio: startPortfolio > 0 ? (pv / startPortfolio) * 100 : 100,
      benchmark:
        startBench && bc ? (bc / startBench) * 100 : 100,
      portfolioValue: pv,
    });
  }

  const endPortfolio = portfolioValueOn(endIso);
  const endBench = closeOnOrBefore(benchIdx, endIso);

  return {
    points,
    startDate: calendar[0],
    endDate: endIso,
    startValue: startPortfolio,
    endValue: endPortfolio,
    portfolioReturnPct:
      startPortfolio > 0 ? endPortfolio / startPortfolio - 1 : null,
    benchmarkReturnPct:
      startBench && endBench ? endBench / startBench - 1 : null,
    benchmarkLabel,
    coverage: fullBook > 0 ? coveredBook / fullBook : 0,
  };
}
