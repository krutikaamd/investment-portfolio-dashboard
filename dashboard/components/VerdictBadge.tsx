import { cn } from "@/lib/utils";

const palette: Record<string, string> = {
  BUY: "bg-pos/20 text-pos ring-pos/40",
  ACCUMULATE: "bg-pos/15 text-pos ring-pos/30",
  HOLD: "bg-ink-dim/15 text-ink-dim ring-ink-dim/30",
  TRIM: "bg-warn/15 text-warn ring-warn/30",
  SELL: "bg-neg/20 text-neg ring-neg/40",
  OVERWEIGHT: "bg-accent/20 text-accent-glow ring-accent/40",
  INITIATE: "bg-cyan/15 text-cyan ring-cyan/40",
  UNDERWEIGHT: "bg-ink-dim/15 text-ink-dim ring-ink-dim/30",
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
