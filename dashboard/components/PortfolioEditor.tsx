"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Save, X } from "lucide-react";
import type { Holding } from "@/lib/allocate";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function PortfolioEditor({ open, onClose, onSaved }: Props) {
  const [rows, setRows] = useState<Holding[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch("/api/portfolio")
      .then((r) => r.json())
      .then((d) => setRows(d.holdings ?? []))
      .catch(() => setRows([]));
  }, [open]);

  if (!open) return null;

  function setRow(i: number, patch: Partial<Holding>) {
    setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((rs) => [...rs, { ticker: "", shares: 0, avgCost: 0 }]);
  }
  function removeRow(i: number) {
    setRows((rs) => rs.filter((_, k) => k !== i));
  }
  async function save() {
    setSaving(true);
    setError(null);
    try {
      const cleaned = rows
        .map((r) => ({
          ticker: r.ticker.trim().toUpperCase(),
          shares: Number(r.shares),
          avgCost: Number(r.avgCost),
        }))
        .filter((r) => r.ticker && r.shares > 0);
      const resp = await fetch("/api/portfolio", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ holdings: cleaned }),
      });
      if (!resp.ok) throw new Error((await resp.json()).error ?? "Save failed");
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="font-semibold">Manage Portfolio</h2>
          <button
            onClick={onClose}
            className="rounded-lg border border-line bg-bg-elev p-1.5 text-ink-dim hover:text-ink hover:border-line-strong transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-5 space-y-2">
          <div className="grid grid-cols-[1fr_120px_140px_40px] gap-2 items-center label-eyebrow px-1 pb-1">
            <span>Ticker</span>
            <span className="text-right">Shares</span>
            <span className="text-right">Avg Cost ($)</span>
            <span></span>
          </div>
          {rows.map((r, i) => (
            <div
              key={i}
              className="grid grid-cols-[1fr_120px_140px_40px] gap-2 items-center"
            >
              <input
                type="text"
                value={r.ticker}
                onChange={(e) => setRow(i, { ticker: e.target.value.toUpperCase() })}
                placeholder="AAPL"
                className="rounded-lg border border-line bg-bg-elev px-3 py-2 text-sm font-medium uppercase focus:border-accent focus:outline-none"
              />
              <input
                type="number"
                value={r.shares || ""}
                onChange={(e) => setRow(i, { shares: Number(e.target.value) })}
                placeholder="0"
                className="rounded-lg border border-line bg-bg-elev px-3 py-2 text-sm num text-right focus:border-accent focus:outline-none"
              />
              <input
                type="number"
                step="0.01"
                value={r.avgCost || ""}
                onChange={(e) => setRow(i, { avgCost: Number(e.target.value) })}
                placeholder="0.00"
                className="rounded-lg border border-line bg-bg-elev px-3 py-2 text-sm num text-right focus:border-accent focus:outline-none"
              />
              <button
                onClick={() => removeRow(i)}
                className="rounded-lg border border-line bg-bg-elev p-2 text-ink-fade hover:text-neg hover:border-neg/40 transition"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button
            onClick={addRow}
            className="w-full rounded-lg border border-dashed border-line py-2 text-sm text-ink-dim hover:border-accent/60 hover:text-accent-glow transition flex items-center justify-center gap-2"
          >
            <Plus className="h-4 w-4" /> Add Holding
          </button>
          {error && <div className="text-sm text-neg">{error}</div>}
        </div>
        <div className="px-5 py-3 border-t border-line flex items-center justify-between bg-bg-elev/50">
          <span className="text-[11px] text-ink-fade">
            Saved to <code className="text-ink-dim">data/portfolio.json</code>
          </span>
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-50 transition"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving…" : "Save & Revalue"}
          </button>
        </div>
      </div>
    </div>
  );
}
