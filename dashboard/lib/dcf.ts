import type { CompanyData } from "./yahoo";
import { computeWacc, type WaccBreakdown } from "./wacc";

export interface ScenarioInputs {
  name: "Bull" | "Base" | "Bear";
  wacc: number;
  terminalGrowth: number;
  yearOneGrowth: number;
  longRunGrowth: number;
  ebitdaMarginStart: number;
  ebitdaMarginEnd: number;
}

export interface YearProjection {
  year: number;
  revenue: number;
  growth: number;
  ebitdaMargin: number;
  ebitda: number;
  da: number;
  ebit: number;
  effEbitMargin: number;        // EBIT / Revenue (emerges from EBITDA - D&A)
  nopat: number;
  capex: number;
  changeNwc: number;
  ufcf: number;
  discountFactor: number;
  pvUfcf: number;
}

export interface ScenarioOutput extends ScenarioInputs {
  startingRevenue: number;
  projections: YearProjection[];
  terminalUfcf: number;
  terminalValue: number;
  pvTerminalValue: number;
  pvExplicitUfcf: number;
  enterpriseValue: number;
  netDebt: number;
  equityValue: number;
  pricePerShare: number;
  sharesOutstanding: number;
}

export interface DcfResult {
  ticker: string;
  asOf: string;
  snapshot: CompanyData["snapshot"];
  wacc: WaccBreakdown;
  historical: {
    year: string;
    revenue: number | null;
    ebit: number | null;
    ebitMargin: number | null;
    ebitda: number | null;
    ebitdaMargin: number | null;
    ufcf: number | null;        // EBIT(1-T) + D&A - CapEx - ΔNWC
    reportedFcf: number | null;
  }[];
  drivers: {
    revGrowthHistCagr: number | null;
    analystY1Growth: number | null;
    ebitdaMarginLatest: number;
    ebitdaMarginMean: number;
    ebitdaMarginMax: number;
    isImpaired: boolean;
    isMature: boolean;
    isHyperGrowth: boolean;
    daStarting: number;
    capexStarting: number;
    nwcPctRevenue: number;
    inflation: number;
  };
  bull: ScenarioOutput;
  base: ScenarioOutput;
  bear: ScenarioOutput;
  rawDcfFair: number;          // pure DCF output before consensus anchoring
  fairValue: number;           // final fair value used for MoS (post-anchor)
  marginOfSafety: number;
  verdict: "BUY" | "ACCUMULATE" | "HOLD" | "TRIM" | "SELL";
  upsideToFair: number;
  upsideToAnalyst: number | null;
  /**
   * Consensus diagnostics. The rule: DCF fair values should fall within ~25%
   * of the analyst-target-mean for the system to be trustworthy. Larger gaps
   * indicate a model-calibration issue or a legitimate contrarian call.
   *   • OK     — raw DCF within ±25% of consensus; use as-is.
   *   • WARN   — raw DCF 25–50% off; soft-anchored (65% DCF / 35% consensus).
   *   • ALERT  — raw DCF >50% off; strongly anchored (30% DCF / 70% consensus)
   *             and flagged on the dashboard for manual review.
   */
  consensusGap: number | null;            // raw DCF vs consensus, pre-anchor
  consensusGapAnchored: number | null;    // anchored fair vs consensus
  consensusFlag: "OK" | "WARN" | "ALERT" | null;
  consensusDiagnosis: string | null;      // best guess at *why* DCF deviates
  notes: string[];
}

const PROJ_YEARS = 10;
const LONG_RUN_GDP = 0.025;
const INFLATION = 0.025;

function cagr(values: (number | null)[]): number | null {
  const clean = values.filter(
    (v): v is number => v !== null && isFinite(v) && v > 0
  );
  if (clean.length < 2) return null;
  const first = clean[0];
  const last = clean[clean.length - 1];
  const n = clean.length - 1;
  return Math.pow(last / first, 1 / n) - 1;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function mean(xs: (number | null)[]): number | null {
  const v = xs.filter((x): x is number => x !== null && isFinite(x));
  if (!v.length) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

/**
 * Build one scenario using the template's "EBITDA-method" UFCF logic
 * (Inputs!B44 + Model!B254-N283):
 *
 *   • EBITDA  = Revenue × EBITDA_margin  (margin can expand modestly w/ scale)
 *   • D&A     = D&A_latest × (1+inflation)^t   ← FIXED-DOLLAR line, not % rev
 *               (Inputs!B44 — depreciation grows at inflation per template)
 *   • CapEx   = CapEx_latest × (1+capex_growth)^t  (real maintenance + some growth)
 *               Terminal year: CapEx = D&A (Inputs!L23 going-concern principle)
 *   • EBIT    = EBITDA - D&A   ← naturally expands as Revenue grows past fixed D&A
 *   • NOPAT   = EBIT × (1-T)
 *   • ΔNWC    = NWC%_revenue × ΔRevenue
 *   • UFCF    = NOPAT + D&A - CapEx - ΔNWC
 *
 * The big win vs %-of-revenue D&A: companies with heavy acquisition
 * amortization (AMD-Xilinx, GOOGL, MSFT-Activision, JNJ deals, V acquisitions)
 * see EBIT margin EXPAND as revenue scales past the fixed-dollar amortization
 * load — which is what actually happens economically.
 */
function buildScenario(
  name: "Bull" | "Base" | "Bear",
  startingRevenue: number,
  yearOneGrowth: number,
  yearTwoGrowth: number,
  longRunGrowth: number,
  ebitdaMarginStart: number,
  ebitdaMarginEnd: number,
  daStarting: number,
  capexStarting: number,
  nwcPctRev: number,
  taxRate: number,
  wacc: number,
  terminalGrowth: number,
  netDebt: number,
  shares: number,
  inflation: number
): ScenarioOutput {
  const projections: YearProjection[] = [];
  let rev = startingRevenue;
  let prevNwc = startingRevenue * nwcPctRev;

  // CapEx grows faster than inflation when the company is genuinely growing.
  const avgGrowth = (yearOneGrowth + longRunGrowth) / 2;
  const capexGrowth = inflation + 0.5 * Math.max(0, avgGrowth - inflation);

  // Growth path: Y1 = analyst current-year, Y2 = analyst next-year, Y3 = midpoint,
  // then linear fade from Y3 to longRunGrowth over years 3→10. This properly
  // sustains the high-growth phase for hypergrowth names instead of fading
  // straight from Y1 to LT growth.
  const growthPath: number[] = [];
  growthPath.push(yearOneGrowth);                            // Y1
  growthPath.push(yearTwoGrowth);                            // Y2
  growthPath.push((yearTwoGrowth + yearTwoGrowth * 0.9) / 2);// Y3 (slight fade)
  for (let t = 4; t <= PROJ_YEARS; t++) {
    const startFade = (yearTwoGrowth + yearTwoGrowth * 0.9) / 2;
    const f = (t - 3) / (PROJ_YEARS - 3);
    growthPath.push(startFade + (longRunGrowth - startFade) * f);
  }

  for (let t = 1; t <= PROJ_YEARS; t++) {
    const g = growthPath[t - 1];
    rev = rev * (1 + g);

    const ebitdaMargin =
      ebitdaMarginStart +
      ((ebitdaMarginEnd - ebitdaMarginStart) * (t - 1)) / (PROJ_YEARS - 1);
    const ebitda = rev * ebitdaMargin;

    // FIXED-DOLLAR D&A growing at inflation — the template's convention.
    const da = daStarting * Math.pow(1 + inflation, t);

    // Terminal-year CapEx forced equal to D&A (going-concern per template).
    const capex = t === PROJ_YEARS ? da : capexStarting * Math.pow(1 + capexGrowth, t);

    const ebit = ebitda - da;
    const effEbitMargin = rev > 0 ? ebit / rev : 0;
    const nopat = ebit * (1 - taxRate);

    const newNwc = rev * nwcPctRev;
    const changeNwc = newNwc - prevNwc;
    prevNwc = newNwc;

    const ufcf = nopat + da - capex - changeNwc;
    const df = 1 / Math.pow(1 + wacc, t);
    projections.push({
      year: t,
      revenue: rev,
      growth: g,
      ebitdaMargin,
      ebitda,
      da,
      ebit,
      effEbitMargin,
      nopat,
      capex,
      changeNwc,
      ufcf,
      discountFactor: df,
      pvUfcf: ufcf * df,
    });
  }

  const terminalUfcf =
    projections[projections.length - 1].ufcf * (1 + terminalGrowth);
  const terminalValue =
    wacc > terminalGrowth ? terminalUfcf / (wacc - terminalGrowth) : NaN;
  const pvTerminalValue = isFinite(terminalValue)
    ? terminalValue / Math.pow(1 + wacc, PROJ_YEARS)
    : NaN;
  const pvExplicitUfcf = projections.reduce((s, p) => s + p.pvUfcf, 0);
  const enterpriseValue =
    pvExplicitUfcf + (isFinite(pvTerminalValue) ? pvTerminalValue : 0);
  const equityValue = enterpriseValue - netDebt;
  const pricePerShare = shares > 0 ? equityValue / shares : NaN;

  return {
    name,
    wacc,
    terminalGrowth,
    yearOneGrowth,
    longRunGrowth,
    ebitdaMarginStart,
    ebitdaMarginEnd,
    startingRevenue,
    projections,
    terminalUfcf,
    terminalValue,
    pvTerminalValue,
    pvExplicitUfcf,
    enterpriseValue,
    netDebt,
    equityValue,
    pricePerShare,
    sharesOutstanding: shares,
  };
}

export function valuateCompany(
  data: CompanyData,
  riskFreeRate: number
): DcfResult {
  const wacc = computeWacc(data, riskFreeRate);
  const { snapshot, income, balance, cashflow, growth } = data;
  const notes = [...wacc.notes];

  // ── Build historical EBITDA, EBIT, UFCF per year ───────────────────────────
  const yearKey = (d: string) => d.slice(0, 4);
  const incomeMap = new Map(income.map((r) => [yearKey(r.endDate), r]));
  const balanceMap = new Map(balance.map((r) => [yearKey(r.endDate), r]));
  const cashflowMap = new Map(cashflow.map((r) => [yearKey(r.endDate), r]));

  const allYears = [
    ...new Set([
      ...incomeMap.keys(),
      ...balanceMap.keys(),
      ...cashflowMap.keys(),
    ]),
  ].sort();

  const nwcByYear: Record<string, number | null> = {};
  for (const y of allYears) {
    const b = balanceMap.get(y);
    if (
      b &&
      (b.accountsReceivable !== null ||
        b.inventory !== null ||
        b.accountsPayable !== null)
    ) {
      nwcByYear[y] =
        (b.accountsReceivable ?? 0) +
        (b.inventory ?? 0) -
        (b.accountsPayable ?? 0);
    } else {
      nwcByYear[y] = null;
    }
  }

  const historical: DcfResult["historical"] = [];
  let prevNwcVal: number | null = null;
  for (const y of allYears) {
    const inc = incomeMap.get(y);
    const cf = cashflowMap.get(y);
    const rev = inc?.totalRevenue ?? null;
    const ebit = inc?.operatingIncome ?? null;
    const ebitMargin = rev && ebit && rev > 0 ? ebit / rev : null;
    const da = cf?.depreciationAmortization ?? null;
    const ebitda = ebit !== null && da !== null ? ebit + da : null;
    const ebitdaMargin = ebitda !== null && rev && rev > 0 ? ebitda / rev : null;
    const capex = cf?.capex ?? null;
    const nwc = nwcByYear[y];
    const dNwc =
      prevNwcVal !== null && nwc !== null ? nwc - prevNwcVal : null;
    if (nwc !== null) prevNwcVal = nwc;

    let ufcf: number | null = null;
    if (
      ebit !== null &&
      rev !== null &&
      capex !== null &&
      da !== null
    ) {
      const nopat = ebit * (1 - wacc.taxRate);
      ufcf = nopat + da + capex - (dNwc ?? 0); // capex is signed negative in Yahoo
    }

    historical.push({
      year: y,
      revenue: rev,
      ebit,
      ebitMargin,
      ebitda,
      ebitdaMargin,
      ufcf,
      reportedFcf: cf?.freeCashFlow ?? null,
    });
  }

  // ── Forecast base ──────────────────────────────────────────────────────────
  const latest = historical[historical.length - 1];
  const latestRev = latest?.revenue ?? historical[historical.length - 2]?.revenue ?? 0;

  // ── EBITDA margin: latest year (weighted with 3-yr mean), plus 5-yr max
  //    as a structural ceiling and impairment detection. ────────────────────
  const recent = historical.slice(-5);
  const ebitdaMargins = recent
    .map((h) => h.ebitdaMargin)
    .filter((x): x is number => x !== null && isFinite(x));
  const ebitdaMarginMean = mean(ebitdaMargins) ?? 0.20;
  const ebitdaMarginMax =
    ebitdaMargins.length > 0
      ? Math.max(...ebitdaMargins)
      : ebitdaMarginMean;

  const last3EbitdaMargins = recent
    .slice(-3)
    .map((h) => h.ebitdaMargin)
    .filter((x): x is number => x !== null && isFinite(x));
  const ebitdaMarginRecent3 = mean(last3EbitdaMargins) ?? ebitdaMarginMean;

  const ebitdaMarginLatest =
    latest?.ebitdaMargin && isFinite(latest.ebitdaMargin)
      ? latest.ebitdaMargin
      : ebitdaMarginRecent3;

  // 60/40 weighted blend of latest year + 3-yr mean (smooths one-year noise).
  const ebitdaMarginStartRaw =
    0.6 * ebitdaMarginLatest + 0.4 * ebitdaMarginRecent3;
  const ebitdaMarginStart = clamp(ebitdaMarginStartRaw, 0.03, 0.85);

  // Impairment signal: starting margin meaningfully below 5-yr mean →
  // 2024-25 events have crushed it (UNH-Change Healthcare, regulatory hits).
  // Model should glide BACK to historical mean, not expand above it.
  const isImpaired = ebitdaMarginStart < ebitdaMarginMean * 0.80;
  if (isImpaired) {
    notes.push(
      `Margin impairment detected: starting EBITDA margin ${(ebitdaMarginStart * 100).toFixed(1)}% is well below 5-yr mean ${(ebitdaMarginMean * 100).toFixed(1)}%. Model assumes recovery toward historical mean, not expansion above it.`
    );
  }

  // ── Revenue / growth inputs ────────────────────────────────────────────────
  const histRevCagr = cagr(recent.map((h) => h.revenue));
  const analystY1 = growth.revenueGrowthCurrentYear;
  const analystY2 = growth.revenueGrowthNextYear;
  const analystLT = growth.earningsGrowthLT ?? growth.earningsGrowth5y;

  let baseY1 = analystY1 ?? analystY2 ?? histRevCagr ?? 0.04;
  baseY1 = clamp(baseY1, -0.10, 0.60);
  if (analystY1 === null) {
    notes.push("No analyst Y1 growth — used analyst Y2 / historical CAGR fallback.");
  }

  // Y2 growth: if analyst gives us a Y2 estimate, use it; otherwise hold Y1
  // for one more year (mild fade) — captures hypergrowth's natural two-year
  // sustained phase before fade.
  let baseY2 = analystY2 ?? baseY1 * 0.95;
  baseY2 = clamp(baseY2, -0.10, 0.55);

  // Long-run growth (Y10 revenue growth): blend of analyst LT and historical.
  // Hypergrowth names (analyst LT > 20%) can sustain >5% out at Y10 because
  // they're still growing meaningfully into a large TAM; mature names fade to
  // nominal GDP (~2.5%).
  let baseLongRun: number;
  if (analystLT !== null && analystLT !== undefined) {
    baseLongRun = clamp(analystLT * 0.5, 0.025, 0.07);
  } else if (histRevCagr !== null) {
    baseLongRun = clamp(histRevCagr * 0.4, 0.025, 0.07);
  } else {
    baseLongRun = 0.03;
  }

  // ── Fixed-dollar D&A and CapEx starting points (latest year) ───────────────
  const latestYear = allYears[allYears.length - 1];
  const latestCf = cashflowMap.get(latestYear);
  const daStarting =
    latestCf?.depreciationAmortization ??
    Math.max(0, latestRev * 0.04);
  const capexStarting =
    latestCf?.capex !== null && latestCf?.capex !== undefined
      ? Math.abs(latestCf.capex)
      : latestRev * 0.04;

  // ── NWC as % of revenue (5-yr mean) ────────────────────────────────────────
  // Cap at 20% because the formula ΔNWC = NWC% × ΔRevenue otherwise creates
  // an excessive cash drag at hypergrowth scale (AR/Inventory don't actually
  // expand 1-for-1 with revenue — payment terms tighten, inventory turns
  // improve, AP days lengthen as a scaled buyer).
  const nwcVals = allYears
    .slice(-5)
    .map((y) => {
      const nwc = nwcByYear[y];
      const rev = incomeMap.get(y)?.totalRevenue;
      if (nwc !== null && rev && rev > 0) return nwc / rev;
      return null;
    });
  const nwcPctRev = clamp(mean(nwcVals) ?? 0.10, -0.05, 0.20);

  // ── Net debt & shares ──────────────────────────────────────────────────────
  const lastBal = balance[balance.length - 1];
  const netDebt =
    (lastBal?.totalDebt ?? 0) - (lastBal?.cashAndShortTermInvestments ?? 0);

  const shares = snapshot.sharesOutstanding ?? 0;
  if (!shares) {
    notes.push("Shares outstanding unavailable — per-share values cannot be computed.");
  }

  // ── Scenario WACCs (±75bps) and terminal growths (bear ≤ base ≤ bull) ──────
  const waccBase = wacc.wacc;
  const waccBull = Math.max(waccBase - 0.0075, 0.05);
  const waccBear = waccBase + 0.0075;
  const cap = (g: number, w: number) => clamp(g, 0.005, w - 0.02);
  // Terminal growth: GDP (2.5%) for mature, up to 3.5% for higher-growth names
  // (analyst-implied LT > 15%), capped at WACC − 200bps.
  const isHighGrowth = baseY1 > 0.15;
  const tgCeiling = isHighGrowth ? 0.035 : LONG_RUN_GDP;
  const tgBase = cap(Math.min(tgCeiling, baseLongRun), waccBase);
  const tgBull = cap(tgBase + 0.005, waccBull);
  const tgBear = cap(Math.max(tgBase - 0.005, 0.01), waccBear);

  // ── EBITDA margin trajectories (with structural caps) ──────────────────────
  // KEY RULES:
  //   1. Mature/slow-growth businesses (baseY1 < 10%, large revenue): margin
  //      cannot exceed historical 5-yr max. No operating leverage to unlock.
  //   2. Hypergrowth (baseY1 > 20%): can scale beyond historical max as
  //      revenue grows past fixed-amortization burden — cap at 1.3× max.
  //   3. Impaired (starting margin < 80% of 5-yr mean): glide BACK to mean,
  //      no expansion above mean. Bear stays impaired; Bull = quick recovery.
  const isHyperGrowth = baseY1 > 0.20;
  const isMature = baseY1 < 0.10 && latestRev > 50e9;
  let baseMarginEnd: number, bullMarginStart: number, bullMarginEnd: number;
  let bearMarginStart: number, bearMarginEnd: number;
  if (isImpaired) {
    // Partial recovery — most impairment events (regulatory, structural cost
    // pressure, legal overhangs) leave permanent scarring. Base = 75% recovery
    // to 5-yr mean; Bull = full recovery + small upside; Bear = only 25%
    // recovery (most of impairment sticks).
    const recoveryGap = ebitdaMarginMean - ebitdaMarginStart;
    baseMarginEnd = clamp(
      ebitdaMarginStart + recoveryGap * 0.75,
      ebitdaMarginStart,
      ebitdaMarginMax
    );
    bullMarginStart = clamp(ebitdaMarginStart + 0.005, 0.02, 0.90);
    bullMarginEnd = clamp(
      ebitdaMarginStart + recoveryGap * 1.05,
      ebitdaMarginStart,
      ebitdaMarginMax
    );
    bearMarginStart = clamp(ebitdaMarginStart * 0.97, 0.02, 0.85);
    bearMarginEnd = clamp(
      ebitdaMarginStart + recoveryGap * 0.25,
      0.02,
      ebitdaMarginMean
    );
  } else if (isMature) {
    // Healthy mature business: at most 100bps expansion, cap at hist max.
    baseMarginEnd = clamp(ebitdaMarginStart + 0.01, 0.03, ebitdaMarginMax);
    bullMarginStart = clamp(ebitdaMarginStart + 0.005, 0.03, 0.90);
    bullMarginEnd = clamp(ebitdaMarginStart + 0.025, 0.03, ebitdaMarginMax * 1.05);
    bearMarginStart = clamp(ebitdaMarginStart * 0.97, 0.02, 0.85);
    bearMarginEnd = clamp(ebitdaMarginStart * 0.94, 0.02, 0.85);
  } else if (isHyperGrowth) {
    // Hypergrowth: real operating leverage exists. Allow expansion up to
    // 1.3× historical max (semis/SaaS scaling past acquired-intangibles).
    const expansion = ebitdaMarginStart < 0.30 ? 0.07 : 0.04;
    const ceiling = Math.max(ebitdaMarginMax * 1.30, ebitdaMarginStart + 0.10);
    baseMarginEnd = clamp(ebitdaMarginStart + expansion, ebitdaMarginStart, ceiling);
    bullMarginStart = clamp(ebitdaMarginStart + 0.015, 0.03, 0.90);
    bullMarginEnd = clamp(baseMarginEnd + 0.05, 0.03, ceiling * 1.05);
    bearMarginStart = clamp(ebitdaMarginStart * 0.95, 0.02, 0.85);
    bearMarginEnd = clamp(baseMarginEnd * 0.92, 0.02, 0.85);
  } else {
    // Middle case: modest expansion capped at 1.1× historical max.
    const expansion = ebitdaMarginStart < 0.30 ? 0.04 : 0.025;
    const ceiling = ebitdaMarginMax * 1.10;
    baseMarginEnd = clamp(ebitdaMarginStart + expansion, ebitdaMarginStart, ceiling);
    bullMarginStart = clamp(ebitdaMarginStart + 0.01, 0.03, 0.90);
    bullMarginEnd = clamp(baseMarginEnd + 0.03, 0.03, ceiling * 1.05);
    bearMarginStart = clamp(ebitdaMarginStart * 0.95, 0.02, 0.85);
    bearMarginEnd = clamp(baseMarginEnd * 0.93, 0.02, 0.85);
  }

  const bullY1 = clamp(baseY1 + 0.03, -0.05, 0.65);
  const bullY2 = clamp(baseY2 + 0.02, -0.05, 0.60);
  const bearY1 = clamp(baseY1 - 0.035, -0.15, 0.50);
  const bearY2 = clamp(baseY2 - 0.03, -0.15, 0.45);

  const bull = buildScenario(
    "Bull", latestRev, bullY1, bullY2, baseLongRun + 0.005,
    bullMarginStart, bullMarginEnd,
    daStarting, capexStarting * 0.95, nwcPctRev,
    wacc.taxRate, waccBull, tgBull, netDebt, shares, INFLATION
  );
  const base = buildScenario(
    "Base", latestRev, baseY1, baseY2, baseLongRun,
    ebitdaMarginStart, baseMarginEnd,
    daStarting, capexStarting, nwcPctRev,
    wacc.taxRate, waccBase, tgBase, netDebt, shares, INFLATION
  );
  const bear = buildScenario(
    "Bear", latestRev, bearY1, bearY2, Math.max(baseLongRun - 0.005, 0.015),
    bearMarginStart, bearMarginEnd,
    daStarting, capexStarting * 1.05, nwcPctRev,
    wacc.taxRate, waccBear, tgBear, netDebt, shares, INFLATION
  );

  // ── Raw probability-weighted DCF fair value ────────────────────────────────
  // Standard weighting: 30/50/20 bull/base/bear. For *impaired* companies, the
  // distribution of forward outcomes is left-skewed — there's more downside
  // risk than upside (think MLR pressure, regulatory action, lasting damage).
  // Weight 15/50/35 to reflect that asymmetry.
  let bullWeight = 0.30, baseWeight = 0.50, bearWeight = 0.20;
  if (isImpaired) {
    bullWeight = 0.15; baseWeight = 0.50; bearWeight = 0.35;
    notes.push(
      "Impaired companies show left-skewed outcome distributions — scenario weights tilted toward bear case (15/50/35)."
    );
  }
  const rawDcfFair =
    bullWeight * bull.pricePerShare +
    baseWeight * base.pricePerShare +
    bearWeight * bear.pricePerShare;

  // ── Consensus anchoring ────────────────────────────────────────────────────
  // Rule per dashboard spec: DCF fair values must be "in and around" sell-side
  // consensus. If the raw DCF diverges materially, blend toward consensus and
  // surface a diagnostic flag. The model still tilts the value toward whichever
  // side has positive MoS (i.e. preserves the contrarian signal directionally)
  // but doesn't produce wildly different numbers.
  const consensus = snapshot.analystTargetMean;
  let fairValue = rawDcfFair;
  let consensusGap: number | null = null;
  let consensusGapAnchored: number | null = null;
  let consensusFlag: "OK" | "WARN" | "ALERT" | null = null;
  let consensusDiagnosis: string | null = null;

  if (consensus && consensus > 0) {
    consensusGap = rawDcfFair / consensus - 1;
    const a = Math.abs(consensusGap);
    if (a <= 0.15) {
      // Within 15% of consensus — accept raw DCF as-is.
      consensusFlag = "OK";
      fairValue = rawDcfFair;
    } else if (a <= 0.40) {
      // 15–40% gap — soft anchor at 50% DCF / 50% consensus.
      consensusFlag = "WARN";
      fairValue = 0.5 * rawDcfFair + 0.5 * consensus;
      consensusDiagnosis = diagnoseGap(
        consensusGap, snapshot, wacc, ebitdaMarginStart, baseY1, nwcPctRev
      );
      notes.push(
        `Raw DCF $${rawDcfFair.toFixed(0)} vs analyst $${consensus.toFixed(0)} (${(consensusGap * 100).toFixed(0)}% gap) — soft-anchored to $${fairValue.toFixed(0)}. ${consensusDiagnosis}`
      );
    } else {
      // >40% gap — strong anchor at 25% DCF / 75% consensus + ALERT flag.
      consensusFlag = "ALERT";
      fairValue = 0.25 * rawDcfFair + 0.75 * consensus;
      consensusDiagnosis = diagnoseGap(
        consensusGap, snapshot, wacc, ebitdaMarginStart, baseY1, nwcPctRev
      );
      notes.push(
        `⚠ ALERT: Raw DCF $${rawDcfFair.toFixed(0)} vs analyst $${consensus.toFixed(0)} (${(consensusGap * 100).toFixed(0)}% gap). Strongly anchored to $${fairValue.toFixed(0)}. ${consensusDiagnosis}`
      );
    }
    consensusGapAnchored = fairValue / consensus - 1;
  }

  const price = snapshot.price;
  const marginOfSafety = price > 0 ? (fairValue - price) / price : 0;

  let verdict: DcfResult["verdict"];
  if (marginOfSafety > 0.25) verdict = "BUY";
  else if (marginOfSafety > 0.10) verdict = "ACCUMULATE";
  else if (marginOfSafety > -0.10) verdict = "HOLD";
  else if (marginOfSafety > -0.25) verdict = "TRIM";
  else verdict = "SELL";

  const upsideToAnalyst =
    consensus && price > 0 ? consensus / price - 1 : null;

  return {
    ticker: snapshot.ticker,
    asOf: new Date().toISOString(),
    snapshot,
    wacc,
    historical,
    drivers: {
      revGrowthHistCagr: histRevCagr,
      analystY1Growth: analystY1,
      ebitdaMarginLatest,
      ebitdaMarginMean,
      ebitdaMarginMax,
      isImpaired,
      isMature,
      isHyperGrowth,
      daStarting,
      capexStarting,
      nwcPctRevenue: nwcPctRev,
      inflation: INFLATION,
    },
    bull, base, bear,
    rawDcfFair,
    fairValue,
    marginOfSafety,
    verdict,
    upsideToFair: marginOfSafety,
    upsideToAnalyst,
    consensusGap,
    consensusGapAnchored,
    consensusFlag,
    consensusDiagnosis,
    notes,
  };
}

/**
 * Inspect inputs and emit a short, plain-English best-guess for why the raw
 * DCF diverges materially from analyst consensus.  This is what the dashboard
 * shows when a stock is flagged WARN/ALERT.
 */
function diagnoseGap(
  gap: number,
  snapshot: CompanyData["snapshot"],
  wacc: WaccBreakdown,
  ebitdaMargin: number,
  y1Growth: number,
  nwcPct: number
): string {
  const sector = snapshot.sector ?? "";
  const industry = snapshot.industry ?? "";

  if (gap > 0) {
    // Raw DCF > consensus → model is too bullish
    if (sector === "Financial Services" &&
        (industry.includes("Insurance") || industry.includes("Capital Markets"))) {
      return "Likely cause: holding-company structure — operating cash flow includes dividend income from a large public-equity portfolio, double-counting value already reflected in market cap. DCF is unsuitable for pure asset-allocators; anchored to consensus.";
    }
    if (snapshot.ticker === "UNH" || (sector === "Healthcare" && y1Growth < 0.05)) {
      return "Likely cause: historical financials look strong, but consensus reflects current impaired outlook (regulatory/legal headwinds) not yet visible in trailing fundamentals. Anchored to forward consensus.";
    }
    if (ebitdaMargin < 0.10 && wacc.wacc < 0.09) {
      return "Likely cause: thin-margin business + low WACC produces an outsized terminal value sensitive to small input shifts. Anchored.";
    }
    return "Raw DCF exceeds analyst consensus — likely overstated terminal value or non-operating income inflating cash flow. Anchored toward consensus.";
  } else {
    // Raw DCF < consensus → model is too bearish
    if (wacc.beta >= wacc.betaCeiling && y1Growth > 0.20) {
      return "Likely cause: β capped at ceiling but WACC still punishingly high for hypergrowth; market accepts a lower equity risk premium for category leaders. Anchored toward consensus.";
    }
    if (y1Growth < 0.05 && ebitdaMargin > 0.25) {
      return "Likely cause: low organic revenue growth (DCF can't model platform/services optionality, capital-return programs, or moat premiums). Anchored toward consensus.";
    }
    if (nwcPct > 0.15) {
      return "Likely cause: heavy NWC drag at growth scale compresses UFCF — sell-side models typically assume working-capital efficiency improves with scale. Anchored.";
    }
    return "Raw DCF below analyst consensus — possible underprojection of forward margins or growth. Anchored toward consensus.";
  }
}

/** WACC × terminal-g sensitivity grid using the Base-case UFCF stream. */
export function sensitivityGrid(
  base: ScenarioOutput,
  netDebt: number,
  shares: number
): { waccs: number[]; gs: number[]; values: (number | null)[][] } {
  const waccs = [-0.015, -0.0075, 0, 0.0075, 0.015, 0.0225].map(
    (d) => base.wacc + d
  );
  const gs = [-0.01, -0.005, 0, 0.005, 0.01].map((d) => base.terminalGrowth + d);
  const baseUfcfs = base.projections.map((p) => p.ufcf);
  const values: (number | null)[][] = waccs.map((w) =>
    gs.map((g) => {
      if (w <= g) return null;
      const pvUfcf = baseUfcfs.reduce(
        (sum, f, i) => sum + f / Math.pow(1 + w, i + 1),
        0
      );
      const tv = (baseUfcfs[baseUfcfs.length - 1] * (1 + g)) / (w - g);
      const pvTv = tv / Math.pow(1 + w, baseUfcfs.length);
      const eq = pvUfcf + pvTv - netDebt;
      return shares > 0 ? eq / shares : null;
    })
  );
  return { waccs, gs, values };
}
