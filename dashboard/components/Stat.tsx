import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface StatProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "neutral" | "pos" | "neg" | "warn" | "accent";
  className?: string;
}

const toneCls: Record<NonNullable<StatProps["tone"]>, string> = {
  neutral: "text-ink",
  pos: "text-pos",
  neg: "text-neg",
  warn: "text-warn",
  accent: "text-accent-glow",
};

export function Stat({ label, value, sub, tone = "neutral", className }: StatProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="label-eyebrow">{label}</div>
      <div className={cn("text-2xl font-semibold num", toneCls[tone])}>
        {value}
      </div>
      {sub && <div className="text-xs text-ink-dim num">{sub}</div>}
    </div>
  );
}
