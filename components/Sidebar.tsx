"use client";

import { ExposureScoreResult, PollutantCode } from "@/lib/types";
import { formatConcentration } from "@/lib/exposure";
import ExposureScore from "./ExposureScore";
import CompareCities from "./CompareCities";

interface SidebarProps {
  exposure: ExposureScoreResult | null;
  exposureLoading: boolean;
  parameter: PollutantCode;
}

export default function Sidebar({ exposure, exposureLoading, parameter }: SidebarProps) {
  const showQuickStats = exposure && exposure.score != null && exposure.dataQuality !== "suspect";

  return (
    <aside className="h-full flex flex-col gap-2 overflow-hidden">
      {/* Exposure Score - Compact */}
      <div className="rounded-lg border border-rail-line bg-rail-panel p-3 flex-shrink-0">
        <ExposureScore result={exposure} loading={exposureLoading} />
      </div>

      {/* Quick Stats - Compact */}
      {showQuickStats && (
        <div className="rounded-lg border border-rail-line bg-rail-panel p-3 flex-shrink-0">
          <p className="font-mono text-[9px] uppercase tracking-wider text-text-faint mb-1.5">Quick Stats</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
            <div className="flex justify-between">
              <span className="text-text-muted text-[10px]">Concentration</span>
              <span className="text-text-primary font-mono text-[11px]">
                {formatConcentration(exposure!.meanConcentration!, exposure!.parameter)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted text-[10px]">vs WHO</span>
              <span className={`font-mono text-[11px] ${exposure!.ratioToGuideline && exposure!.ratioToGuideline > 1 ? 'text-signal-alert' : 'text-signal-good'}`}>
                {exposure!.ratioToGuideline}×
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted text-[10px]">Population</span>
              <span className="text-text-primary font-mono text-[11px]">
                {exposure!.population ? exposure!.population.toLocaleString() : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted text-[10px]">Stations</span>
              <span className="text-text-primary font-mono text-[11px]">
                {exposure!.stationsSampled || 0}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Compare Cities - Fills remaining space */}
      <div className="flex-1 min-h-0 rounded-lg border border-rail-line bg-rail-panel p-3 overflow-hidden">
        <CompareCities parameter={parameter} />
      </div>

      {/* Why This Matters - Compact */}
      <div className="rounded-lg border border-rail-line bg-rail-panel p-2 flex-shrink-0">
        <p className="font-mono text-[8px] uppercase tracking-wider text-signal-clear">Why This Matters</p>
        <p className="text-[9px] text-text-muted leading-tight">
          Score = concentration ÷ WHO guideline, weighted by population.
        </p>
        <div className="text-[8px] text-text-faint font-mono truncate">
          score = 100 × (1 − 1/(1 + max(ratio − 1, 0)))
        </div>
      </div>

      {/* Data Sources - Compact */}
      <div className="rounded-lg border border-rail-line bg-rail-panel p-2 flex-shrink-0">
        <p className="font-mono text-[8px] uppercase tracking-wider text-signal-warn">Sources</p>
        <div className="flex gap-3 text-[9px] text-text-muted">
          <span>OpenAQ <span className="text-text-faint text-[8px]">Air</span></span>
          <span>WorldPop <span className="text-text-faint text-[8px]">Pop</span></span>
          <span>WHO <span className="text-text-faint text-[8px]">Guide</span></span>
        </div>
      </div>
    </aside>
  );
}
