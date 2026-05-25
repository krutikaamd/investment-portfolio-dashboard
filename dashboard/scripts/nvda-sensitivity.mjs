// Re-runs the same DCF math on NVDA with progressively relaxed caps so you
// can see how the fair value moves as you trust hypergrowth assumptions more.
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const yfMod = require("yahoo-finance2");
const Ctor = typeof yfMod === "function" ? yfMod : yfMod.default;
const yf = new Ctor({});

const ERP = 0.049;
const ticker = "NVDA";

const [q, summary, fts] = await Promise.all([
  yf.quote(ticker),
  yf.quoteSummary(ticker, {
    modules: ["summaryDetail", "defaultKeyStatistics", "financialData", "earningsTrend", "price"],
  }),
  yf.fundamentalsTimeSeries(ticker, {
    period1: "2020-01-01", type: "annual", module: "all",
  }),
]);
const rfQuote = await yf.quote("^TNX");
const rf = rfQuote.regularMarketPrice / 100;

const beta = summary.summaryDetail?.beta ?? summary.defaultKeyStatistics?.beta ?? 2.0;
const price = q.regularMarketPrice;
const shares = summary.defaultKeyStatistics?.sharesOutstanding ?? q.sharesOutstanding;
const mc = q.marketCap;

const sorted = [...fts].sort((a, b) => new Date(a.date) - new Date(b.date));
const last = sorted[sorted.length - 1];
const rev0 = last.totalRevenue;
const latestMargin = last.freeCashFlow / last.totalRevenue;
const netDebt = (last.totalDebt ?? 0) - (last.cashCashEquivalentsAndShortTermInvestments ?? last.cashAndCashEquivalents ?? 0);

const tax = Math.min(Math.max((last.taxProvision ?? 0) / (last.pretaxIncome ?? 1), 0.10), 0.35);
const kd = Math.min(Math.max(Math.abs(last.interestExpense ?? 0) / (last.totalDebt || 1e12), rf, 0.02), 0.12);
const ke = rf + beta * ERP;
const wE = mc / (mc + (last.totalDebt ?? 0));
const wD = 1 - wE;
const wacc = wE * ke + wD * kd * (1 - tax);

const trend = summary.earningsTrend?.trend ?? [];
const findT = p => trend.find(t => t.period === p);
const analystY1 = findT("0y")?.revenueEstimate?.growth ?? findT("+1y")?.revenueEstimate?.growth;
const analystLT = findT("+5y")?.growth;

console.log("=== NVDA live inputs ===");
console.log("Price:               $" + price);
console.log("Market cap:          $" + (mc / 1e9).toFixed(0) + "B");
console.log("Beta:                ", beta.toFixed(3));
console.log("Risk-free:            " + (rf * 100).toFixed(2) + "%");
console.log("Cost of equity:       " + (ke * 100).toFixed(2) + "%");
console.log("WACC:                 " + (wacc * 100).toFixed(2) + "%");
console.log("Latest revenue:      $" + (rev0 / 1e9).toFixed(1) + "B");
console.log("Latest FCF margin:    " + (latestMargin * 100).toFixed(1) + "%");
console.log("Net debt:            $" + (netDebt / 1e9).toFixed(1) + "B");
console.log("Shares (B):           " + (shares / 1e9).toFixed(2));
console.log("Analyst Y1 rev growth:" + (analystY1 * 100).toFixed(1) + "%");
console.log("Analyst LT growth:    " + (analystLT * 100).toFixed(1) + "%");
console.log();

function dcf({ y1, longRun, marginEnd, terminalG, label }) {
  let rev = rev0, pvSum = 0, lastFcf = 0;
  for (let t = 1; t <= 10; t++) {
    const g = y1 + (longRun - y1) * (t - 1) / 9;
    rev *= 1 + g;
    const m = latestMargin + (marginEnd - latestMargin) * (t - 1) / 9;
    const fcf = rev * m;
    pvSum += fcf / (1 + wacc) ** t;
    lastFcf = fcf;
  }
  const tv = lastFcf * (1 + terminalG) / (wacc - terminalG);
  const pvTv = tv / (1 + wacc) ** 10;
  const ev = pvSum + pvTv;
  const eq = ev - netDebt;
  const ps = eq / shares;
  console.log(label.padEnd(50), 'Y10 FCF=$' + (lastFcf/1e9).toFixed(0) + 'B', 'PS=$' + ps.toFixed(0), 'MoS=' + (((ps/price)-1)*100).toFixed(0) + '%');
}

console.log("=== Sensitivity to growth caps ===\n");
console.log("Current model (Y1≤30%, LT≤5%, terminal≤2.5%):");
dcf({ y1: 0.30, longRun: 0.05, marginEnd: 0.47, terminalG: 0.025, label: "  base case" });
console.log();

console.log("Relax Y1 to analyst estimate, keep LT at 5%:");
dcf({ y1: Math.min(analystY1, 0.60), longRun: 0.05, marginEnd: 0.47, terminalG: 0.025, label: "  Y1=" + (Math.min(analystY1, 0.60)*100).toFixed(0) + "%, LT=5%, term=2.5%" });
console.log();

console.log("Relax LT cap to 10%:");
dcf({ y1: 0.30, longRun: 0.10, marginEnd: 0.50, terminalG: 0.03, label: "  Y1=30%, LT=10%, term=3%" });
dcf({ y1: Math.min(analystY1, 0.60), longRun: 0.10, marginEnd: 0.50, terminalG: 0.03, label: "  Y1=" + (Math.min(analystY1, 0.60)*100).toFixed(0) + "%, LT=10%, term=3%" });
console.log();

console.log("Aggressive — 'AI dominance' case:");
dcf({ y1: 0.40, longRun: 0.15, marginEnd: 0.50, terminalG: 0.035, label: "  Y1=40%, LT=15%, term=3.5%" });
dcf({ y1: 0.50, longRun: 0.20, marginEnd: 0.55, terminalG: 0.035, label: "  Y1=50%, LT=20%, term=3.5%" });
