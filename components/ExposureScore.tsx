"use client";

import { ExposureScoreResult, POLLUTANTS } from "@/lib/types";
import { CATEGORY_COLOR, formatConcentration } from "@/lib/exposure";
import Tooltip from "./Tooltip";

const COLOR_CLASS: Record<string, { text: string; bg: string; border: string }> = {
  "signal-good": { text: "text-signal-good", bg: "bg-signal-good/10", border: "border-signal-good/40" },
  "signal-warn": { text: "text-signal-warn", bg: "bg-signal-warn/10", border: "border-signal-warn/40" },
  "signal-alert": { text: "text-signal-alert", bg: "bg-signal-alert/10", border: "border-signal-alert/40" },
  "signal-severe": { text: "text-signal-severe", bg: "bg-signal-severe/10", border: "border-signal-severe/40" },
};

export default function ExposureScore({ result, loading }: { result: ExposureScoreResult | null; loading: boolean }) {
  const def = result ? POLLUTANTS.find((p) => p.code === result.parameter)! : null;

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <p className="font-mono text-[9px] uppercase tracking-wider text-text-faint">Exposure Score</p>
        <Tooltip label="0–100 scale comparing the current mean reading to the WHO 2021 air quality guideline.">
          <span className="cursor-help font-mono text-[8px] text-text-faint">?</span>
        </Tooltip>
      </div>

      {loading ? (
        <p className="font-mono text-xs text-text-muted">Computing…</p>
      ) : result?.dataQuality === "suspect" ? (
        <div>
          <p className="font-mono text-[10px] text-signal-warn">
            Reading looks unreliable (ratio {result.ratioToGuideline}×) — score withheld
          </p>
          {result.meanConcentration != null && (
            <p className="mt-0.5 font-mono text-[9px] text-text-faint">
              Raw mean: {formatConcentration(result.meanConcentration, result.parameter)}
            </p>
          )}
        </div>
      ) : !result || result.score == null ? (
        <p className="font-mono text-[10px] text-text-muted">
          {result?.dataQuality === "unavailable" ? "No live readings" : "Awaiting data…"}
        </p>
      ) : (
        <>
          <div className="flex items-end gap-2">
            <span className="font-mono text-3xl font-semibold text-text-primary">{result.score}</span>
            <span
              className={`mb-0.5 rounded-full border px-1.5 py-0.5 font-mono text-[9px] ${COLOR_CLASS[CATEGORY_COLOR[result.category!]].text} ${COLOR_CLASS[CATEGORY_COLOR[result.category!]].bg} ${COLOR_CLASS[CATEGORY_COLOR[result.category!]].border}`}
            >
              {result.category}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-1 font-mono text-[10px] text-text-muted">
            <div className="flex justify-between">
              <dt>Mean</dt>
              <dd className="text-text-primary">{formatConcentration(result.meanConcentration!, result.parameter)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>WHO</dt>
              <dd>{formatConcentration(result.whoGuideline, result.parameter)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Ratio</dt>
              <dd className={result.ratioToGuideline && result.ratioToGuideline > 1 ? 'text-signal-alert' : 'text-signal-good'}>
                {result.ratioToGuideline}×
              </dd>
            </div>
            {result.population && (
              <div className="flex justify-between">
                <dt>Population</dt>
                <dd className="text-text-primary">{result.population.toLocaleString()}</dd>
              </div>
            )}
          </div>

          <p className="mt-1 font-mono text-[7px] uppercase tracking-wider text-text-faint">
            {result.dataQuality === "mock" ? "Quality: Mock demo data" : `Quality: ${result.dataQuality}`}
          </p>
        </>
      )}
    </div>
  );
}
