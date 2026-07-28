"use client";

import { useEffect, useState } from "react";
import { CITIES } from "@/lib/cities";
import { ExposureScoreResult, PollutantCode, POLLUTANTS } from "@/lib/types";
import { CATEGORY_COLOR, formatConcentration } from "@/lib/exposure";

const DEFAULT_COMPARE = ["delhi", "london", "sao-paulo"];

const CATEGORY_TEXT_CLASS: Record<string, string> = {
  "signal-good": "text-signal-good",
  "signal-warn": "text-signal-warn",
  "signal-alert": "text-signal-alert",
  "signal-severe": "text-signal-severe",
};

export default function CompareCities({ parameter }: { parameter: PollutantCode }) {
  const [selected, setSelected] = useState<string[]>(DEFAULT_COMPARE);
  const [results, setResults] = useState<Record<string, ExposureScoreResult | null>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    
    fetch(`/api/exposure/snapshot`)
      .then((r) => r.json())
      .then((data: ExposureScoreResult[]) => {
        if (cancelled) return;
        const next: Record<string, ExposureScoreResult | null> = {};
        selected.forEach((id) => {
          const found = data.find((d) => d.cityId === id && d.parameter === parameter);
          next[id] = found || null;
        });
        setResults(next);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setResults({});
          setLoading(false);
        }
      });
      
    return () => { cancelled = true; };
  }, [selected, parameter]);

  function updateSlot(index: number, cityId: string) {
    setSelected((prev) => prev.map((c, i) => (i === index ? cityId : c)));
  }

  const def = POLLUTANTS.find((p) => p.code === parameter)!;

  return (
    <div className="h-full flex flex-col">
      <p className="font-mono text-[9px] uppercase tracking-wider text-text-faint mb-2 flex-shrink-0">
        Compare · {def.label}
      </p>

      <div className="flex-1 space-y-2 overflow-y-auto pr-1">
        {selected.map((cityId, i) => {
          const city = CITIES.find((c) => c.id === cityId)!;
          const r = results[cityId];
          const ok = r && r.score != null && r.dataQuality !== "suspect" ? r : null;
          const suspect = r && r.dataQuality === "suspect" ? r : null;
          return (
            <div key={i} className="rounded-md border border-rail-line bg-rail-panel-raised p-2">
              <select
                value={cityId}
                onChange={(e) => updateSlot(i, e.target.value)}
                className="focus-ring w-full rounded border border-rail-line bg-rail-void px-2 py-0.5 font-mono text-[10px] text-text-primary mb-1"
              >
                {CITIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

              {loading ? (
                <p className="font-mono text-[10px] text-text-muted">Loading…</p>
              ) : ok ? (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-baseline gap-1">
                    <span className="font-mono text-lg font-semibold text-text-primary">{ok.score}</span>
                    <span className="font-mono text-[7px] uppercase text-text-faint">/100</span>
                  </div>
                  <span className={`text-[10px] font-mono ${CATEGORY_TEXT_CLASS[CATEGORY_COLOR[ok.category!]]}`}>
                    {ok.category}
                  </span>
                  <span className="text-[9px] text-text-muted font-mono truncate">
                    {formatConcentration(ok.meanConcentration!, ok.parameter)}
                  </span>
                </div>
              ) : suspect ? (
                <p className="font-mono text-[10px] text-signal-warn">Unreliable reading, excluded</p>
              ) : (
                <p className="font-mono text-[10px] text-text-muted">No data</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
