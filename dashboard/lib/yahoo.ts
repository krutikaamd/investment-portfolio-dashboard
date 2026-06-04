import "server-only";
import { createRequire } from "module";

// yahoo-finance2 v3 is ESM-first and ships a `@deno/shim-deno` dependency that
// references `__dirname` at the top level. Webpack's ESM interop also unwraps
// the default export inconsistently. We bypass both by requiring it natively.
const nativeRequire = createRequire(import.meta.url);

type YahooClient = {
  quote: (symbol: string) => Promise<Record<string, unknown>>;
  quoteSummary: (
    symbol: string,
    opts: { modules: string[] }
  ) => Promise<Record<string, unknown>>;
  fundamentalsTimeSeries: (
    symbol: string,
    opts: { period1: string; type: string; module: string }
  ) => Promise<Record<string, unknown>[]>;
  search: (
    query: string,
    opts?: { newsCount?: number; quotesCount?: number; enableFuzzyQuery?: boolean }
  ) => Promise<{ news?: Record<string, unknown>[] }>;
  chart: (
    symbol: string,
    opts: { period1: string; period2?: string; interval: string }
  ) => Promise<{
    quotes?: { date: Date | string; close: number | null; adjclose?: number | null }[];
  }>;
};
type YahooCtor = new (opts?: Record<string, unknown>) => YahooClient;

const rawModule = nativeRequire("yahoo-finance2") as
  | { default: YahooCtor }
  | YahooCtor;
const Ctor: YahooCtor =
  typeof rawModule === "function"
    ? rawModule
    : (rawModule.default as YahooCtor);

const yf: YahooClient = new Ctor({});

export interface YahooSnapshot {
  ticker: string;
  longName: string;
  sector: string | null;
  industry: string | null;
  currency: string;
  price: number;
  marketCap: number | null;
  sharesOutstanding: number | null;
  beta: number | null;
  dividendYield: number | null;
  trailingPE: number | null;
  forwardPE: number | null;
  analystTargetMean: number | null;
  analystTargetHigh: number | null;
  analystTargetLow: number | null;
  analystTargetMedian: number | null;
  numberOfAnalysts: number | null;
  analystRecommendation: string | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
}

export interface FinancialsRow {
  endDate: string;
  totalRevenue: number | null;
  operatingIncome: number | null;        // EBIT
  ebitda: number | null;
  pretaxIncome: number | null;
  incomeTaxExpense: number | null;
  interestExpense: number | null;
  netIncome: number | null;
}

export interface BalanceSheetRow {
  endDate: string;
  cashAndShortTermInvestments: number | null;
  longTermInvestments: number | null;     // Marketable securities (AAPL ~$130B, etc.)
  totalDebt: number | null;
  totalStockholderEquity: number | null;
  accountsReceivable: number | null;
  inventory: number | null;
  accountsPayable: number | null;
}

export interface CashFlowRow {
  endDate: string;
  operatingCashFlow: number | null;
  capex: number | null;
  depreciationAmortization: number | null;
  freeCashFlow: number | null;            // Yahoo reported (levered)
  stockRepurchases: number | null;        // Cash spent buying back shares (positive number)
  dividendsPaid: number | null;           // Cash returned via dividends (positive number)
}

export interface AnalystGrowth {
  revenueGrowthCurrentYear: number | null;
  revenueGrowthNextYear: number | null;
  earningsGrowth5y: number | null;
  earningsGrowthLT: number | null;
}

export interface CompanyData {
  snapshot: YahooSnapshot;
  income: FinancialsRow[];
  balance: BalanceSheetRow[];
  cashflow: CashFlowRow[];
  growth: AnalystGrowth;
}

function num(x: unknown): number | null {
  if (x === null || x === undefined) return null;
  if (typeof x === "number" && isFinite(x)) return x;
  if (typeof x === "object" && x !== null && "raw" in (x as Record<string, unknown>)) {
    const raw = (x as { raw?: number }).raw;
    return typeof raw === "number" && isFinite(raw) ? raw : null;
  }
  return null;
}

function isoDate(d: unknown): string {
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  if (typeof d === "string") return d.slice(0, 10);
  return "";
}

const TTL_MS = 1000 * 60 * 15;
const cache = new Map<string, { t: number; data: CompanyData }>();
const riskFreeCache: { t: number; rate: number | null } = { t: 0, rate: null };

/**
 * Fetch the 10-year US Treasury yield (^TNX). Yahoo reports it scaled ×10
 * (e.g. 42.9 = 4.29%). We normalize to a decimal (0.0429).
 */
export async function getRiskFreeRate(): Promise<number> {
  const now = Date.now();
  if (riskFreeCache.rate !== null && now - riskFreeCache.t < TTL_MS) {
    return riskFreeCache.rate;
  }
  try {
    const q = await yf.quote("^TNX");
    const price = (q as { regularMarketPrice?: number }).regularMarketPrice;
    if (typeof price === "number" && isFinite(price)) {
      const rate = price / 100;
      riskFreeCache.t = now;
      riskFreeCache.rate = rate;
      return rate;
    }
  } catch {
    /* fall through to default */
  }
  return 0.0425;
}

export async function getCompanyData(ticker: string): Promise<CompanyData> {
  const key = ticker.toUpperCase();
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.t < TTL_MS) return hit.data;

  const period1 = new Date();
  period1.setFullYear(period1.getFullYear() - 5);
  const period1Str = period1.toISOString().slice(0, 10);

  // Run all calls in parallel; if any one fails (e.g. delisted ticker), bubble up.
  const [quote, summary, fundamentals] = await Promise.all([
    yf.quote(key) as Promise<Record<string, unknown>>,
    yf.quoteSummary(key, {
      modules: [
        "assetProfile",
        "summaryDetail",
        "defaultKeyStatistics",
        "financialData",
        "earningsTrend",
        "price",
      ],
    }) as Promise<Record<string, unknown>>,
    yf.fundamentalsTimeSeries(key, {
      period1: period1Str,
      type: "annual",
      module: "all",
    }) as Promise<Record<string, unknown>[]>,
  ]);

  const sd = (summary.summaryDetail as Record<string, unknown>) ?? {};
  const dks = (summary.defaultKeyStatistics as Record<string, unknown>) ?? {};
  const fd = (summary.financialData as Record<string, unknown>) ?? {};
  const ap = (summary.assetProfile as Record<string, unknown>) ?? {};
  const pr = (summary.price as Record<string, unknown>) ?? {};

  const snapshot: YahooSnapshot = {
    ticker: key,
    longName:
      (pr.longName as string | undefined) ??
      (quote.longName as string | undefined) ??
      (quote.shortName as string | undefined) ??
      key,
    sector: (ap.sector as string | undefined) ?? null,
    industry: (ap.industry as string | undefined) ?? null,
    currency:
      (pr.currency as string | undefined) ??
      (quote.currency as string | undefined) ??
      "USD",
    price:
      num(quote.regularMarketPrice) ??
      num(pr.regularMarketPrice) ??
      0,
    marketCap: num(quote.marketCap) ?? num(pr.marketCap),
    sharesOutstanding:
      num(dks.sharesOutstanding) ?? num(quote.sharesOutstanding),
    beta: num(sd.beta) ?? num(dks.beta),
    dividendYield: num(sd.dividendYield),
    trailingPE: num(sd.trailingPE),
    forwardPE: num(sd.forwardPE),
    analystTargetMean: num(fd.targetMeanPrice),
    analystTargetHigh: num(fd.targetHighPrice),
    analystTargetLow: num(fd.targetLowPrice),
    analystTargetMedian: num(fd.targetMedianPrice),
    numberOfAnalysts: num(fd.numberOfAnalystOpinions),
    analystRecommendation: (fd.recommendationKey as string | undefined) ?? null,
    fiftyTwoWeekHigh: num(sd.fiftyTwoWeekHigh),
    fiftyTwoWeekLow: num(sd.fiftyTwoWeekLow),
  };

  // ── fundamentalsTimeSeries returns one row per annual period with flat keys.
  const sortedRows = [...fundamentals].sort((a, b) => {
    const da = isoDate((a as { date?: unknown }).date);
    const db = isoDate((b as { date?: unknown }).date);
    return da.localeCompare(db);
  });

  const income: FinancialsRow[] = sortedRows
    .map((r) => {
      const ebit = num(r.operatingIncome);
      const da =
        num(r.reconciledDepreciation) ?? num(r.depreciationAndAmortization);
      const ebitda = ebit !== null && da !== null ? ebit + da : null;
      return {
        endDate: isoDate((r as { date?: unknown }).date),
        totalRevenue: num(r.totalRevenue),
        operatingIncome: ebit,
        ebitda,
        pretaxIncome: num(r.pretaxIncome),
        incomeTaxExpense: num(r.taxProvision),
        interestExpense: num(r.interestExpense),
        netIncome: num(r.netIncome),
      };
    })
    .filter((r) => r.totalRevenue !== null);

  const balance: BalanceSheetRow[] = sortedRows
    .map((r) => ({
      endDate: isoDate((r as { date?: unknown }).date),
      cashAndShortTermInvestments:
        num(r.cashCashEquivalentsAndShortTermInvestments) ??
        num(r.cashAndCashEquivalents),
      longTermInvestments:
        num(r.longTermInvestments) ??
        num(r.investmentsAndAdvances) ??
        num(r.availableForSaleSecurities),
      totalDebt: num(r.totalDebt),
      totalStockholderEquity:
        num(r.stockholdersEquity) ?? num(r.commonStockEquity),
      accountsReceivable:
        num(r.accountsReceivable) ?? num(r.netReceivables),
      inventory: num(r.inventory),
      accountsPayable: num(r.accountsPayable),
    }))
    .filter((r) => r.totalDebt !== null || r.cashAndShortTermInvestments !== null);

  const cashflow: CashFlowRow[] = sortedRows
    .map((r) => {
      const ocf = num(r.operatingCashFlow);
      const capex = num(r.capitalExpenditure);
      const da =
        num(r.reconciledDepreciation) ??
        num(r.depreciationAndAmortization) ??
        null;
      const fcf =
        num(r.freeCashFlow) ??
        (ocf !== null && capex !== null ? ocf + capex : null);
      // Yahoo reports buybacks as a *negative* number (cash outflow). We want
      // the magnitude (positive) for buyback-yield math downstream.
      const buybacksRaw =
        num(r.repurchaseOfCapitalStock) ?? num(r.commonStockRepurchased);
      const stockRepurchases =
        buybacksRaw !== null ? Math.abs(buybacksRaw) : null;
      const divsRaw =
        num(r.cashDividendsPaid) ?? num(r.commonStockDividendPaid);
      const dividendsPaid = divsRaw !== null ? Math.abs(divsRaw) : null;
      return {
        endDate: isoDate((r as { date?: unknown }).date),
        operatingCashFlow: ocf,
        capex,
        depreciationAmortization: da,
        freeCashFlow: fcf,
        stockRepurchases,
        dividendsPaid,
      };
    })
    .filter((r) => r.freeCashFlow !== null);

  // ── Analyst earnings/revenue growth ────────────────────────────────────────
  const trend =
    ((summary.earningsTrend as { trend?: Record<string, unknown>[] })?.trend ??
      []) as Record<string, unknown>[];
  const findTrend = (period: string) =>
    trend.find((t) => (t.period as string) === period);

  const growth: AnalystGrowth = {
    revenueGrowthCurrentYear: num(
      (findTrend("0y")?.revenueEstimate as Record<string, unknown> | undefined)
        ?.growth
    ),
    revenueGrowthNextYear: num(
      (findTrend("+1y")?.revenueEstimate as Record<string, unknown> | undefined)
        ?.growth
    ),
    earningsGrowth5y: num(findTrend("+5y")?.growth),
    earningsGrowthLT:
      num(findTrend("+5y")?.growth) ?? num(findTrend("+1y")?.growth),
  };

  const data: CompanyData = {
    snapshot,
    income,
    balance,
    cashflow,
    growth,
  };

  cache.set(key, { t: now, data });
  return data;
}

export interface NewsItem {
  uuid: string;
  ticker: string;
  title: string;
  publisher: string;
  link: string;
  publishedAt: string;
  type: string | null;
  thumbnail: string | null;
  relatedTickers: string[];
}

const newsCache = new Map<string, { t: number; data: NewsItem[] }>();
const NEWS_TTL_MS = 10 * 60 * 1000;

function pickThumbnail(thumb: unknown): string | null {
  if (!thumb || typeof thumb !== "object") return null;
  const resolutions = (thumb as { resolutions?: unknown }).resolutions;
  if (!Array.isArray(resolutions) || resolutions.length === 0) return null;
  const first = resolutions[0] as { url?: unknown } | undefined;
  if (first && typeof first.url === "string") return first.url;
  return null;
}

export async function getCompanyNews(
  ticker: string,
  limit = 8
): Promise<NewsItem[]> {
  const key = ticker.toUpperCase();
  const now = Date.now();
  const cached = newsCache.get(key);
  if (cached && now - cached.t < NEWS_TTL_MS) {
    return cached.data;
  }

  let raw: Record<string, unknown>[] = [];
  try {
    const res = await yf.search(key, {
      newsCount: limit,
      quotesCount: 0,
      enableFuzzyQuery: false,
    });
    raw = res.news ?? [];
  } catch {
    raw = [];
  }

  const items: NewsItem[] = raw
    .map((n) => {
      const uuid = typeof n.uuid === "string" ? n.uuid : "";
      const title = typeof n.title === "string" ? n.title : "";
      const link = typeof n.link === "string" ? n.link : "";
      if (!uuid || !title || !link) return null;
      const publisher =
        typeof n.publisher === "string" ? n.publisher : "Yahoo Finance";
      const ts = typeof n.providerPublishTime === "number"
        ? n.providerPublishTime * 1000
        : typeof n.providerPublishTime === "string"
        ? Date.parse(n.providerPublishTime)
        : Date.now();
      const type = typeof n.type === "string" ? n.type : null;
      const related = Array.isArray(n.relatedTickers)
        ? (n.relatedTickers as unknown[]).filter(
            (t): t is string => typeof t === "string"
          )
        : [];
      const item: NewsItem = {
        uuid,
        ticker: key,
        title,
        publisher,
        link,
        publishedAt: new Date(ts).toISOString(),
        type,
        thumbnail: pickThumbnail(n.thumbnail),
        relatedTickers: related,
      };
      return item;
    })
    .filter((x): x is NewsItem => x !== null);

  newsCache.set(key, { t: now, data: items });
  return items;
}

// Publisher reputation tiers for ranking. Tier-1 = top-tier wire/business
// press, tier-2 = mainstream financial media, everything else = tier-3.
const PUBLISHER_TIER_1 = new Set([
  "reuters",
  "bloomberg",
  "wall street journal",
  "the wall street journal",
  "wsj",
  "financial times",
  "ft.com",
  "cnbc",
  "associated press",
  "ap news",
  "dow jones",
  "barron's",
  "barrons",
  "the new york times",
  "the economist",
]);
const PUBLISHER_TIER_2 = new Set([
  "marketwatch",
  "yahoo finance",
  "investor's business daily",
  "investors business daily",
  "ibd",
  "forbes",
  "mt newswires",
  "benzinga",
  "morningstar",
  "investing.com",
  "the motley fool",
  "motley fool",
  "seeking alpha",
  "zacks",
  "zacks investment research",
  "tipranks",
  "bnn bloomberg",
  "reuters business",
]);

function publisherScore(publisher: string): number {
  const p = publisher.toLowerCase().trim();
  if (PUBLISHER_TIER_1.has(p)) return 3;
  if (PUBLISHER_TIER_2.has(p)) return 2;
  return 1;
}

export function scoreNewsItem(
  item: NewsItem,
  portfolioTickers: Set<string>,
  now = Date.now()
): number {
  const ageHrs = Math.max(
    0,
    (now - new Date(item.publishedAt).getTime()) / 3_600_000
  );
  // 72-hour half-life: 0h => 1.0, 72h => 0.5, 168h (1w) => ~0.2
  const recency = Math.exp(-ageHrs / 104) * 4;

  const pub = publisherScore(item.publisher);

  const portfolioHits = new Set<string>([item.ticker]);
  for (const rt of item.relatedTickers) {
    if (portfolioTickers.has(rt.toUpperCase())) portfolioHits.add(rt.toUpperCase());
  }
  const multiTickerBonus = portfolioHits.size > 1 ? 1.5 : 0;

  const typeBonus =
    item.type && item.type.toUpperCase() === "STORY" ? 0.5 : 0;

  return recency + pub + multiTickerBonus + typeBonus;
}

export async function getPortfolioNews(
  tickers: string[],
  perTicker = 8,
  topN = 10
): Promise<NewsItem[]> {
  const all = await Promise.all(
    tickers.map((t) => getCompanyNews(t, perTicker).catch(() => []))
  );
  const seen = new Set<string>();
  const merged: NewsItem[] = [];
  for (const list of all) {
    for (const item of list) {
      if (seen.has(item.uuid)) continue;
      seen.add(item.uuid);
      merged.push(item);
    }
  }
  const portfolioSet = new Set(tickers.map((t) => t.toUpperCase()));
  const now = Date.now();
  const ranked = merged
    .map((item) => ({ item, score: scoreNewsItem(item, portfolioSet, now) }))
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);
  return ranked.slice(0, topN);
}

/* ───────────────────────── Historical prices ───────────────────────── */

export interface PriceBar {
  date: string; // YYYY-MM-DD
  close: number;
}

const historyCache = new Map<string, { t: number; data: PriceBar[] }>();
const HISTORY_TTL_MS = 60 * 60 * 1000; // 1h — historical closes don't change

/**
 * Fetch daily closes for `ticker` from `fromDate` (inclusive) to today.
 * Uses Yahoo's chart endpoint. Falls back to adjusted close if close is null
 * (handles splits/dividends gracefully). Cached for 1 hour per symbol.
 */
export async function getHistoricalCloses(
  ticker: string,
  fromDate: Date
): Promise<PriceBar[]> {
  const key = `${ticker.toUpperCase()}|${fromDate.toISOString().slice(0, 10)}`;
  const now = Date.now();
  const hit = historyCache.get(key);
  if (hit && now - hit.t < HISTORY_TTL_MS) return hit.data;

  const period1 = fromDate.toISOString().slice(0, 10);
  let raw: { quotes?: { date: Date | string; close: number | null; adjclose?: number | null }[] };
  try {
    raw = await yf.chart(ticker.toUpperCase(), {
      period1,
      interval: "1d",
    });
  } catch {
    historyCache.set(key, { t: now, data: [] });
    return [];
  }

  const bars: PriceBar[] = (raw.quotes ?? [])
    .map((q) => {
      const date = isoDate(q.date);
      const close =
        typeof q.close === "number" && isFinite(q.close)
          ? q.close
          : typeof q.adjclose === "number" && isFinite(q.adjclose)
            ? q.adjclose
            : null;
      if (!date || close === null) return null;
      return { date, close } as PriceBar;
    })
    .filter((x): x is PriceBar => x !== null);

  // De-dupe (rare Yahoo quirk where the same date appears twice) and sort.
  const byDate = new Map<string, number>();
  for (const b of bars) byDate.set(b.date, b.close);
  const deduped = [...byDate.entries()]
    .map(([date, close]) => ({ date, close }))
    .sort((a, b) => a.date.localeCompare(b.date));

  historyCache.set(key, { t: now, data: deduped });
  return deduped;
}
