import type { CompanyData } from "./yahoo";

/**
 * Damodaran-style implied equity risk premium for the US market.
 * The single global input — everything else is derived from each company's
 * own financials.
 */
export const EQUITY_RISK_PREMIUM = 0.049;

/**
 * US Country Risk Premium (Damodaran). Matches the +0.5% CRP your template
 * adds to K_e for US-listed names.
 */
export const US_COUNTRY_RISK_PREMIUM = 0.005;

/**
 * Sector-level *re-levered* beta floor.
 *
 * Methodology: take Damodaran's industry-average unlevered beta and re-lever
 * at a representative 25% D/E. We apply this as a *floor* on a company's
 * own Yahoo beta — so a defensive name like JNJ (Yahoo β = 0.26) can't get
 * away with a structurally too-low cost of equity vs its peer group.
 *
 * If you wanted a true bottom-up beta (the template's method), you'd unlever
 * each peer with its own D/E + tax, average, then re-lever to the target
 * capital structure. The floor approximates that without needing a peer list.
 */
const SECTOR_BETA_FLOOR: Record<string, number> = {
  Technology: 1.10,
  "Communication Services": 1.00,
  "Consumer Cyclical": 1.05,
  "Consumer Defensive": 0.65,
  Energy: 1.05,
  "Financial Services": 1.05,
  Healthcare: 0.85,
  Industrials: 1.00,
  "Real Estate": 0.85,
  "Basic Materials": 1.05,
  Utilities: 0.55,
};

export interface WaccBreakdown {
  riskFreeRate: number;
  equityRiskPremium: number;
  countryRiskPremium: number;
  rawBeta: number | null;
  sectorBetaFloor: number | null;
  betaCeiling: number;
  beta: number;                       // effective beta = clamp(raw, floor, ceiling)
  costOfEquity: number;
  preTaxCostOfDebt: number;
  taxRate: number;
  afterTaxCostOfDebt: number;
  marketCap: number;
  totalDebt: number;
  equityWeight: number;
  debtWeight: number;
  wacc: number;
  notes: string[];
}

/**
 * Beta ceiling. Damodaran's industry-average levered betas top out around 1.5
 * (semis, biotech, airlines, online retail). Yahoo's 5-yr-monthly β can spike
 * to 2.4+ for high-volatility movers (AMD, NVDA, TSLA-class names) — but
 * that's a statistical artifact of recent stock-price action, not a sustainable
 * measure of business risk. We cap at 1.5 to align with industry bottom-up
 * convention; sell-side DCFs typically use industry β not company-specific.
 */
export const BETA_CEILING = 1.5;

function meanPositive(xs: (number | null)[]): number | null {
  const vals = xs.filter(
    (v): v is number => v !== null && isFinite(v) && v > 0
  );
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function computeWacc(
  data: CompanyData,
  riskFreeRate: number
): WaccBreakdown {
  const notes: string[] = [];
  const { snapshot, income, balance } = data;

  // ── Beta: max(raw Yahoo β, sector bottom-up floor) ─────────────────────────
  const rawBeta = snapshot.beta;
  const sector = snapshot.sector ?? null;
  const sectorFloor =
    sector && SECTOR_BETA_FLOOR[sector] !== undefined
      ? SECTOR_BETA_FLOOR[sector]
      : null;

  let beta: number;
  if (rawBeta === null || !isFinite(rawBeta)) {
    beta = sectorFloor ?? 1.0;
    notes.push(
      `Raw beta unavailable — using sector bottom-up floor (β=${beta.toFixed(2)}).`
    );
  } else if (sectorFloor !== null && rawBeta < sectorFloor) {
    beta = sectorFloor;
    notes.push(
      `Yahoo β=${rawBeta.toFixed(2)} below sector bottom-up floor — using β=${sectorFloor.toFixed(2)} (${sector}).`
    );
  } else if (rawBeta > BETA_CEILING) {
    beta = BETA_CEILING;
    notes.push(
      `Yahoo β=${rawBeta.toFixed(2)} above ceiling — capped at β=${BETA_CEILING} (statistical 5y β overshoots true business risk).`
    );
  } else {
    beta = rawBeta;
  }

  // ── Cost of equity: CAPM + CRP ─────────────────────────────────────────────
  const crp =
    snapshot.currency === "USD" ? US_COUNTRY_RISK_PREMIUM : 0.01;
  const costOfEquity = riskFreeRate + beta * EQUITY_RISK_PREMIUM + crp;

  // ── Effective tax rate from latest 3 income statements (cap [10%, 35%]) ────
  const taxRates = income.map((r) => {
    if (
      r.pretaxIncome === null ||
      r.incomeTaxExpense === null ||
      r.pretaxIncome <= 0
    )
      return null;
    return r.incomeTaxExpense / r.pretaxIncome;
  });
  const meanTax = meanPositive(taxRates);
  let taxRate = meanTax ?? 0.21;
  if (meanTax === null) {
    notes.push("Tax rate unavailable — used US federal default (21%).");
  }
  taxRate = Math.min(Math.max(taxRate, 0.10), 0.35);

  // ── Pre-tax cost of debt: interest expense / average total debt ────────────
  const interestExp =
    income[income.length - 1]?.interestExpense ??
    income[income.length - 2]?.interestExpense ??
    null;
  const debtNow: number | null = balance[balance.length - 1]?.totalDebt ?? null;
  const debtPrev: number | null = balance[balance.length - 2]?.totalDebt ?? null;
  let avgDebt: number | null;
  if (debtNow !== null && debtPrev !== null) {
    avgDebt = (debtNow + debtPrev) / 2;
  } else {
    avgDebt = debtNow ?? debtPrev;
  }

  let preTaxKd: number;
  if (
    interestExp !== null &&
    avgDebt !== null &&
    avgDebt > 0 &&
    Math.abs(interestExp) > 0
  ) {
    preTaxKd = Math.abs(interestExp) / avgDebt;
    preTaxKd = Math.min(Math.max(preTaxKd, riskFreeRate, 0.02), 0.12);
  } else {
    const mc = snapshot.marketCap ?? 0;
    const spread =
      mc > 200e9 ? 0.0080 : mc > 50e9 ? 0.0120 : mc > 10e9 ? 0.0180 : 0.0250;
    preTaxKd = riskFreeRate + spread;
    notes.push(
      `Interest expense unavailable — estimated K_d from size spread (+${(spread * 100).toFixed(2)}%).`
    );
  }
  const afterTaxKd = preTaxKd * (1 - taxRate);

  const marketCap = snapshot.marketCap ?? 0;
  const totalDebt = debtNow ?? 0;
  const capStruct = marketCap + totalDebt;

  let equityWeight = 1;
  let debtWeight = 0;
  if (capStruct > 0) {
    equityWeight = marketCap / capStruct;
    debtWeight = totalDebt / capStruct;
  }

  const wacc = equityWeight * costOfEquity + debtWeight * afterTaxKd;

  return {
    riskFreeRate,
    equityRiskPremium: EQUITY_RISK_PREMIUM,
    countryRiskPremium: crp,
    rawBeta,
    sectorBetaFloor: sectorFloor,
    betaCeiling: BETA_CEILING,
    beta,
    costOfEquity,
    preTaxCostOfDebt: preTaxKd,
    taxRate,
    afterTaxCostOfDebt: afterTaxKd,
    marketCap,
    totalDebt,
    equityWeight,
    debtWeight,
    wacc,
    notes,
  };
}
