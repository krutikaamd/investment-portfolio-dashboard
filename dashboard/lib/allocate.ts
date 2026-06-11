import type { DcfResult } from "./dcf";

export interface Transaction {
  date: string; // ISO date (YYYY-MM-DD)
  type: "BUY" | "SELL";
  shares: number;
  price: number; // execution price per share
}

export interface Holding {
  ticker: string;
  shares: number;
  avgCost: number;
  /**
   * Optional ledger of buys/sells for this position. When present it's
   * surfaced in the per-stock dropdown. Net shares should reconcile to
   * `shares`, and the share-weighted average of buy prices to `avgCost`.
   */
  transactions?: Transaction[];
}

export interface ValuedHolding {
  holding: Holding;
  dcf: DcfResult;
  marketValue: number;
  costBasis: number;
  unrealisedPL: number;
  unrealisedPLPct: number;
  currentWeight: number;
  fairWeight: number;
  weightDelta: number;
}

export interface AllocationRecommendation {
  ticker: string;
  action: "OVERWEIGHT" | "INITIATE" | "HOLD" | "UNDERWEIGHT" | "TRIM";
  dollarsToAdd: number;
  sharesToAdd: number;
  marginOfSafety: number;
  reason: string;
  fromWatchlist?: boolean; // True if this ticker isn't currently held but is on the watchlist
}

export interface PortfolioValuation {
  asOf: string;
  totalMarketValue: number;
  totalCostBasis: number;
  totalPL: number;
  totalPLPct: number;
  weightedFairValue: number;
  portfolioMarginOfSafety: number;
  holdings: ValuedHolding[];
}

/**
 * Convert per-stock margin-of-safety into a target portfolio weight.
 *
 * Strict value-investor stance: ONLY stocks with positive DCF margin-of-safety
 * (i.e. fair value > price) receive new capital. HOLD (-10% < MoS < +10%) and
 * TRIM/SELL names get zero new dollars regardless of their current weight.
 *
 * If no holding has positive MoS, the engine reports cash should sit idle
 * rather than deploying into overpriced names.
 */
function fairWeights(dcfs: DcfResult[]): Map<string, number> {
  const scores = dcfs.map((d) => Math.max(0, d.marginOfSafety));
  const sum = scores.reduce((a, b) => a + b, 0);
  const out = new Map<string, number>();
  if (sum === 0) {
    // Nothing has positive MoS — return zeros (cash sits idle).
    dcfs.forEach((d) => out.set(d.ticker, 0));
    return out;
  }
  dcfs.forEach((d, i) => out.set(d.ticker, scores[i] / sum));
  return out;
}

export function valuePortfolio(
  holdings: Holding[],
  dcfs: DcfResult[]
): PortfolioValuation {
  const dcfMap = new Map(dcfs.map((d) => [d.ticker, d]));

  const positions = holdings
    .map((h) => {
      const dcf = dcfMap.get(h.ticker.toUpperCase());
      if (!dcf) return null;
      const mv = dcf.snapshot.price * h.shares;
      const cb = h.avgCost * h.shares;
      return {
        holding: h,
        dcf,
        marketValue: mv,
        costBasis: cb,
        unrealisedPL: mv - cb,
        unrealisedPLPct: cb > 0 ? (mv - cb) / cb : 0,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  const totalMv = positions.reduce((s, p) => s + p.marketValue, 0);
  const totalCb = positions.reduce((s, p) => s + p.costBasis, 0);

  const fair = fairWeights(positions.map((p) => p.dcf));

  const holdingsOut: ValuedHolding[] = positions.map((p) => {
    const cw = totalMv > 0 ? p.marketValue / totalMv : 0;
    const fw = fair.get(p.dcf.ticker) ?? 0;
    return {
      ...p,
      currentWeight: cw,
      fairWeight: fw,
      weightDelta: fw - cw,
    };
  });

  const weightedFairValue = holdingsOut.reduce(
    (s, h) => s + h.dcf.fairValue * h.holding.shares,
    0
  );
  const portfolioMoS =
    totalMv > 0 ? (weightedFairValue - totalMv) / totalMv : 0;

  return {
    asOf: new Date().toISOString(),
    totalMarketValue: totalMv,
    totalCostBasis: totalCb,
    totalPL: totalMv - totalCb,
    totalPLPct: totalCb > 0 ? (totalMv - totalCb) / totalCb : 0,
    weightedFairValue,
    portfolioMarginOfSafety: portfolioMoS,
    holdings: holdingsOut,
  };
}

/**
 * Given an investable cash amount, produce per-stock recommendations.
 *
 * Logic (strict value-investor stance):
 *   1. Only stocks with POSITIVE MoS receive new capital, weighted by MoS
 *      (higher MoS → larger share of cash).
 *   2. Stocks with MoS ≤ −10% get a TRIM / UNDERWEIGHT flag (no buy).
 *   3. Stocks with MoS in (−10%, +10%) are HOLD (no buy, no sell).
 *   4. Cash that can't be deployed (no undervalued names) is reported idle.
 */
export function allocate(
  portfolio: PortfolioValuation,
  cashToInvest: number,
  watchlistTickers: Set<string> = new Set()
): {
  recommendations: AllocationRecommendation[];
  cashDeployed: number;
  cashRemaining: number;
  newTotalValue: number;
} {
  const isWatchlist = (ticker: string) =>
    watchlistTickers.has(ticker.toUpperCase());

  if (cashToInvest <= 0) {
    return {
      recommendations: portfolio.holdings.map((h) => ({
        ticker: h.dcf.ticker,
        action: "HOLD",
        dollarsToAdd: 0,
        sharesToAdd: 0,
        marginOfSafety: h.dcf.marginOfSafety,
        reason: "No new capital to deploy.",
        fromWatchlist: isWatchlist(h.dcf.ticker) && h.holding.shares === 0,
      })),
      cashDeployed: 0,
      cashRemaining: 0,
      newTotalValue: portfolio.totalMarketValue,
    };
  }

  // Allocate cash *proportionally to MoS* among positive-MoS names only
  // (positions you actually hold AND positive-MoS watchlist candidates).
  const positiveScores = portfolio.holdings.map((h) =>
    Math.max(0, h.dcf.marginOfSafety)
  );
  const totalScore = positiveScores.reduce((a, b) => a + b, 0);
  const noUndervaluedNames = totalScore === 0;

  const recs: AllocationRecommendation[] = portfolio.holdings.map((h, i) => {
    const mos = h.dcf.marginOfSafety;
    const price = h.dcf.snapshot.price;
    const cw = h.currentWeight;
    // Watchlist-sourced flag: ticker is on the watchlist AND not currently
    // a real held position (shares == 0 in the phantom-holding pipeline).
    const fromWatchlist = isWatchlist(h.dcf.ticker) && h.holding.shares === 0;

    if (mos > 0 && !noUndervaluedNames) {
      const share = positiveScores[i] / totalScore;
      const dollars = cashToInvest * share;
      const sharesToAdd = price > 0 ? dollars / price : 0;
      const action: AllocationRecommendation["action"] =
        cw < 0.01 ? "INITIATE" : "OVERWEIGHT";
      let reason: string;
      if (fromWatchlist) {
        reason = `On your watchlist; DCF margin of safety ${(mos * 100).toFixed(1)}% — open a position.`;
      } else if (action === "INITIATE") {
        reason = `Currently <1% weight; DCF margin of safety ${(mos * 100).toFixed(1)}% — build a position.`;
      } else {
        reason = `Margin of safety ${(mos * 100).toFixed(1)}%. ${
          share > 0.4
            ? "Largest pool of fair value in portfolio."
            : "Add to overweight."
        }`;
      }
      return {
        ticker: h.dcf.ticker,
        action,
        dollarsToAdd: dollars,
        sharesToAdd,
        marginOfSafety: mos,
        reason,
        fromWatchlist,
      };
    }

    if (mos < -0.10) {
      const trimPct = Math.min(0.5, -mos);
      // Don't show TRIM/UNDERWEIGHT advice for watchlist stocks — you don't
      // own them. Just show as HOLD (skip).
      if (fromWatchlist) {
        return {
          ticker: h.dcf.ticker,
          action: "HOLD",
          dollarsToAdd: 0,
          sharesToAdd: 0,
          marginOfSafety: mos,
          reason: `On your watchlist; trading ${(Math.abs(mos) * 100).toFixed(1)}% above DCF fair value — wait for a better entry.`,
          fromWatchlist,
        };
      }
      const action: AllocationRecommendation["action"] =
        mos < -0.25 ? "TRIM" : "UNDERWEIGHT";
      return {
        ticker: h.dcf.ticker,
        action,
        dollarsToAdd: 0,
        sharesToAdd: 0,
        marginOfSafety: mos,
        reason:
          action === "TRIM"
            ? `Trading ${(Math.abs(mos) * 100).toFixed(1)}% above DCF fair value — consider trimming up to ${(trimPct * 100).toFixed(0)}% of the position.`
            : `Price is ${(Math.abs(mos) * 100).toFixed(1)}% above DCF fair value — no new capital; consider light trim.`,
        fromWatchlist: false,
      };
    }

    return {
      ticker: h.dcf.ticker,
      action: "HOLD",
      dollarsToAdd: 0,
      sharesToAdd: 0,
      marginOfSafety: mos,
      reason: fromWatchlist
        ? `On your watchlist; within ±10% of fair value (${(mos * 100).toFixed(1)}%) — wait for a better entry.`
        : noUndervaluedNames && mos >= -0.10
          ? "Nothing in portfolio is meaningfully undervalued — cash should sit idle until prices improve."
          : `Within ±10% of fair value (${(mos * 100).toFixed(1)}%) — hold.`,
      fromWatchlist,
    };
  });

  const deployed = recs.reduce((s, r) => s + r.dollarsToAdd, 0);

  return {
    recommendations: recs,
    cashDeployed: deployed,
    cashRemaining: cashToInvest - deployed,
    newTotalValue: portfolio.totalMarketValue + cashToInvest,
  };
}
