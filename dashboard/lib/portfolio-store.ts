import "server-only";
import { promises as fs } from "fs";
import path from "path";
import type { Holding } from "./allocate";

const FILE = path.join(process.cwd(), "data", "portfolio.json");

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

export async function loadPortfolio(): Promise<PortfolioFile> {
  const raw = await fs.readFile(FILE, "utf8");
  const parsed = JSON.parse(raw) as Partial<PortfolioFile>;
  return {
    baseCurrency: parsed.baseCurrency ?? "USD",
    holdings: parsed.holdings ?? [],
    watchlist: parsed.watchlist ?? [],
  };
}

export async function savePortfolio(p: PortfolioFile): Promise<void> {
  await fs.writeFile(FILE, JSON.stringify(p, null, 2), "utf8");
}
