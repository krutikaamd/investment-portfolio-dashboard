import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmtUSD(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export function fmtPct(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

export function fmtSignedPct(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  const v = (n * 100).toFixed(digits);
  return `${n >= 0 ? "+" : ""}${v}%`;
}

export function fmtNum(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function tone(n: number | null | undefined): "pos" | "neg" | "neutral" {
  if (n === null || n === undefined || !isFinite(n)) return "neutral";
  if (n > 0.0001) return "pos";
  if (n < -0.0001) return "neg";
  return "neutral";
}
