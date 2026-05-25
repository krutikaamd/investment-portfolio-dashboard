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

const FILE = path.join(process.cwd(), "data", "portfolio.json");
const KV_KEY = "portfolio:state:v1";

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

async function loadFromFile(): Promise<PortfolioFile> {
  return readBundledSeed();
}

async function saveToFile(p: PortfolioFile): Promise<void> {
  if (IS_SERVERLESS) {
    throw new PortfolioStoreConfigError(
      "Cannot persist data: running on a read-only serverless filesystem " +
        "but no Redis backend is configured. Provision Upstash Redis on " +
        "Vercel (Storage → Create Database → Upstash → Redis), connect it " +
        "to this project so KV_REST_API_URL and KV_REST_API_TOKEN are " +
        "injected, then trigger a redeploy. See VERCEL_DEPLOY.md for details."
    );
  }
  await fs.writeFile(FILE, JSON.stringify(p, null, 2), "utf8");
}

async function loadFromRedis(): Promise<PortfolioFile> {
  const client = getRedis();
  const stored = await client.get<PortfolioFile>(KV_KEY);
  if (stored && typeof stored === "object" && "holdings" in stored) {
    return normalise(stored);
  }
  // First boot: seed Redis from the bundled portfolio.json so the dashboard
  // is never empty on a fresh deploy.
  const seed = await readBundledSeed();
  await client.set(KV_KEY, seed);
  return seed;
}

async function saveToRedis(p: PortfolioFile): Promise<void> {
  const client = getRedis();
  await client.set(KV_KEY, p);
}

export async function loadPortfolio(): Promise<PortfolioFile> {
  return USE_REDIS ? loadFromRedis() : loadFromFile();
}

export async function savePortfolio(p: PortfolioFile): Promise<void> {
  return USE_REDIS ? saveToRedis(p) : saveToFile(p);
}

export function storageBackend(): "redis" | "file" {
  return USE_REDIS ? "redis" : "file";
}
