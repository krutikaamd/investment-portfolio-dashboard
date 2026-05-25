"use client";

import { useEffect, useMemo, useState } from "react";
import { Newspaper, ExternalLink, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface NewsItem {
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

interface NewsResponse {
  asOf: string;
  tickers: string[];
  items: NewsItem[];
}

interface Props {
  portfolioTickers: string[];
  onSelectTicker?: (ticker: string) => void;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - then) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function NewsFeed({ portfolioTickers, onSelectTicker }: Props) {
  const [news, setNews] = useState<NewsItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("ALL");

  const fetchNews = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`/api/news?perTicker=8&topN=10&t=${Date.now()}`, {
        cache: "no-store",
      });
      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}));
        throw new Error(j.error ?? "Failed to fetch news");
      }
      const j: NewsResponse = await resp.json();
      setNews(j.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNews();
  }, []);

  const filtered = useMemo(() => {
    if (!news) return [];
    if (filter === "ALL") return news;
    return news.filter(
      (n) => n.ticker === filter || n.relatedTickers.includes(filter)
    );
  }, [news, filter]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of portfolioTickers) m.set(t, 0);
    if (news) {
      for (const n of news) {
        m.set(n.ticker, (m.get(n.ticker) ?? 0) + 1);
      }
    }
    return m;
  }, [news, portfolioTickers]);

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-line gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <Newspaper className="h-4 w-4 text-cyan" />
          <h2 className="text-sm font-semibold tracking-wide">
            Top Headlines
          </h2>
          <span className="label-eyebrow">
            Top 10 · Yahoo Finance
          </span>
        </div>
        <button
          onClick={fetchNews}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-bg-elev px-2.5 py-1.5 text-[11px] font-medium text-ink-dim hover:text-ink hover:border-line-strong disabled:opacity-50 transition"
        >
          <RefreshCw
            className={cn("h-3 w-3", loading && "animate-spin")}
          />
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5 px-5 py-3 border-b border-line/60">
        <FilterChip
          label="All"
          active={filter === "ALL"}
          count={news?.length ?? 0}
          onClick={() => setFilter("ALL")}
        />
        {portfolioTickers.map((t) => (
          <FilterChip
            key={t}
            label={t}
            active={filter === t}
            count={counts.get(t) ?? 0}
            onClick={() => setFilter(t)}
          />
        ))}
      </div>

      <div className="divide-y divide-line/60">
        {error && (
          <div className="px-5 py-6 text-sm text-neg">{error}</div>
        )}
        {!error && loading && !news && (
          <div className="px-5 py-8 text-sm text-ink-fade">
            Fetching latest headlines…
          </div>
        )}
        {!error && news && filtered.length === 0 && (
          <div className="px-5 py-8 text-sm text-ink-fade">
            No recent headlines for {filter === "ALL" ? "your portfolio" : filter}.
          </div>
        )}
        {filtered.map((item) => (
          <NewsRow
            key={item.uuid}
            item={item}
            onTickerClick={(t) => {
              if (portfolioTickers.includes(t) && onSelectTicker) {
                onSelectTicker(t);
              }
            }}
            portfolioTickers={portfolioTickers}
          />
        ))}
      </div>
    </div>
  );
}

function FilterChip({
  label,
  active,
  count,
  onClick,
}: {
  label: string;
  active: boolean;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition border",
        active
          ? "bg-accent/15 text-accent border-accent/40"
          : "bg-bg-elev text-ink-dim border-line hover:text-ink hover:border-line-strong"
      )}
    >
      <span>{label}</span>
      {count > 0 && (
        <span
          className={cn(
            "rounded px-1 text-[9px] font-bold leading-tight",
            active ? "bg-accent/25 text-accent" : "bg-bg text-ink-fade"
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function NewsRow({
  item,
  onTickerClick,
  portfolioTickers,
}: {
  item: NewsItem;
  onTickerClick: (t: string) => void;
  portfolioTickers: string[];
}) {
  const allTickers = Array.from(
    new Set([item.ticker, ...item.relatedTickers])
  ).slice(0, 4);
  return (
    <a
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex gap-4 px-5 py-4 hover:bg-bg-hover transition-colors"
    >
      {item.thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.thumbnail}
          alt=""
          className="hidden sm:block h-16 w-16 rounded-md object-cover flex-shrink-0 bg-bg-elev"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <div className="hidden sm:flex h-16 w-16 rounded-md bg-bg-elev flex-shrink-0 items-center justify-center text-ink-fade">
          <Newspaper className="h-5 w-5" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-[10px] text-ink-fade uppercase tracking-wide mb-1">
          <span className="font-semibold text-ink-dim">{item.publisher}</span>
          <span>•</span>
          <span>{relativeTime(item.publishedAt)}</span>
          {item.type && item.type !== "STORY" && (
            <>
              <span>•</span>
              <span className="text-cyan">{item.type}</span>
            </>
          )}
        </div>
        <h3 className="text-sm font-medium leading-snug text-ink group-hover:text-accent-glow transition-colors">
          {item.title}
          <ExternalLink className="inline-block h-3 w-3 ml-1.5 opacity-50 align-baseline" />
        </h3>
        {allTickers.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {allTickers.map((t) => {
              const inPortfolio = portfolioTickers.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onTickerClick(t);
                  }}
                  className={cn(
                    "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold leading-none transition",
                    inPortfolio
                      ? "bg-cyan/15 text-cyan hover:bg-cyan/25"
                      : "bg-bg-elev text-ink-fade cursor-default"
                  )}
                >
                  {t}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </a>
  );
}
