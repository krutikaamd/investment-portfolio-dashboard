import { cn } from "@/lib/utils";

const palette: Record<string, string> = {
  BUY: "bg-pos/30 text-ink ring-pos/60",
  ACCUMULATE: "bg-pos/25 text-ink ring-pos/50",
  HOLD: "bg-ink-dim/25 text-ink ring-ink-dim/50",
  TRIM: "bg-warn/25 text-ink ring-warn/55",
  SELL: "bg-neg/30 text-ink ring-neg/60",
  OVERWEIGHT: "bg-accent/30 text-ink ring-accent/60",
  INITIATE: "bg-cyan/25 text-ink ring-cyan/55",
  UNDERWEIGHT: "bg-ink-dim/25 text-ink ring-ink-dim/50",
};

export function VerdictBadge({
  verdict,
  size = "sm",
}: {
  verdict: string;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={cn(
        "chip ring-1 font-semibold tracking-wide uppercase",
        size === "md" ? "px-3 py-1 text-xs" : "px-2 py-0.5 text-[10px]",
        palette[verdict] ?? palette.HOLD
      )}
    >
      {verdict}
    </span>
  );
}
