import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { Redis } from "@upstash/redis";
import type { Holding } from "./allocate";

export interface WatchlistItem {
  ticker: string;
  addedAt: string;
  addedAtPrice: number;
  note?: string;
}

export interface PortfolioFile {
  baseCurrency: string;
  holdings: Holding[];
  watchlist: WatchlistItem[];
}

// Storage backend selection:
//  - If UPSTASH_REDIS_REST_URL + token are set (i.e. on Vercel), use Redis.
//  - Otherwise (local dev), fall back to the filesystem JSON.
const KV_URL = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN =
  process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
const USE_REDIS = Boolean(KV_URL && KV_TOKEN);
// Detect running on Vercel / similar serverless host where the filesystem
// is read-only. Vercel always sets the VERCEL env var.
const IS_SERVERLESS = Boolean(
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
);

class PortfolioStoreConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PortfolioStoreConfigError";
  }
}

// `FILE` is the bundled demo portfolio — used ONLY as the seed template for
// brand-new users. Per-user state lives under `data/portfolios/{id}.json`
// (dev) or `portfolio:user:{id}:v1` in Redis (prod).
const FILE = path.join(process.cwd(), "data", "portfolio.json");
const PORTFOLIO_DIR = path.join(process.cwd(), "data", "portfolios");
const KV_PREFIX = "portfolio:user:";
const KV_TTL_SECONDS = 60 * 60 * 24 * 365; // 1 year; refreshed on access

function userKey(userId: string): string {
  return `${KV_PREFIX}${userId}:v1`;
}
function userFile(userId: string): string {
  return path.join(PORTFOLIO_DIR, `${userId}.json`);
}

let redis: Redis | null = null;
function getRedis(): Redis {
  if (!redis) {
    redis = new Redis({ url: KV_URL!, token: KV_TOKEN! });
  }
  return redis;
}

function normalise(parsed: Partial<PortfolioFile>): PortfolioFile {
  return {
    baseCurrency: parsed.baseCurrency ?? "USD",
    holdings: parsed.holdings ?? [],
    watchlist: parsed.watchlist ?? [],
  };
}

async function readBundledSeed(): Promise<PortfolioFile> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    return normalise(JSON.parse(raw) as Partial<PortfolioFile>);
  } catch {
    return { baseCurrency: "USD", holdings: [], watchlist: [] };
  }
}

async function loadFromFile(userId: string): Promise<PortfolioFile> {
  try {
    const raw = await fs.readFile(userFile(userId), "utf8");
    return normalise(JSON.parse(raw) as Partial<PortfolioFile>);
  } catch {
    // New user — seed from the bundled demo portfolio and persist their copy.
    const seed = await readBundledSeed();
    try {
      await saveToFile(userId, seed);
    } catch {
      /* best-effort seed; return it regardless */
    }
    return seed;
  }
}

async function saveToFile(userId: string, p: PortfolioFile): Promise<void> {
  if (IS_SERVERLESS) {
    throw new PortfolioStoreConfigError(
      "Cannot persist data: running on a read-only serverless filesystem " +
        "but no Redis backend is configured. Provision Upstash Redis on " +
        "Vercel (Storage → Create Database → Upstash → Redis), connect it " +
        "to this project so KV_REST_API_URL and KV_REST_API_TOKEN are " +
        "injected, then trigger a redeploy. See VERCEL_DEPLOY.md for details."
    );
  }
  await fs.mkdir(PORTFOLIO_DIR, { recursive: true });
  await fs.writeFile(userFile(userId), JSON.stringify(p, null, 2), "utf8");
}

async function loadFromRedis(userId: string): Promise<PortfolioFile> {
  const client = getRedis();
  const key = userKey(userId);
  const stored = await client.get<PortfolioFile>(key);
  if (stored && typeof stored === "object" && "holdings" in stored) {
    // Sliding expiry: keep active users' portfolios alive.
    await client.expire(key, KV_TTL_SECONDS);
    return normalise(stored);
  }
  // New user — seed from the bundled portfolio.json so they land on the demo.
  const seed = await readBundledSeed();
  await client.set(key, seed, { ex: KV_TTL_SECONDS });
  return seed;
}

async function saveToRedis(userId: string, p: PortfolioFile): Promise<void> {
  const client = getRedis();
  await client.set(userKey(userId), p, { ex: KV_TTL_SECONDS });
}

export async function loadPortfolio(userId: string): Promise<PortfolioFile> {
  return USE_REDIS ? loadFromRedis(userId) : loadFromFile(userId);
}

export async function savePortfolio(
  userId: string,
  p: PortfolioFile
): Promise<void> {
  return USE_REDIS ? saveToRedis(userId, p) : saveToFile(userId, p);
}

export function storageBackend(): "redis" | "file" {
  return USE_REDIS ? "redis" : "file";
}
