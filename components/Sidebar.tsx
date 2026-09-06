"use client";

import { ExposureScoreResult, PollutantCode, StationLocation } from "@/lib/types";
import { formatConcentration } from "@/lib/exposure";
import ExposureScore from "./ExposureScore";
import CompareCities from "./CompareCities";
import DownloadSampleData from "./DownloadSampleData";

interface SidebarProps {
  exposure: ExposureScoreResult | null;
  exposureLoading: boolean;
  parameter: PollutantCode;
  station: StationLocation | null;
  points: import("@/lib/types").MeasurementPoint[];
  cityName: string;
  cityId: string;
  onClose: () => void;
}

export default function Sidebar({ exposure, exposureLoading, parameter, station, points, cityName, cityId, onClose }: SidebarProps) {
  const showQuickStats = exposure && exposure.score != null && exposure.dataQuality !== "suspect";

  return (
    <aside className="flex h-full flex-col gap-4 overflow-y-auto p-5">
      <div className="sticky top-0 z-10 -mx-5 -mt-5 flex items-start justify-between gap-3 border-b border-rail-line bg-rail-void/95 px-5 pb-4 pt-5 backdrop-blur-xl">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-signal-clear">Intelligence panel</p>
          <h2 className="mt-1 text-xl font-semibold text-text-primary">{cityName} signal</h2>
        </div>
        <button type="button" aria-label="Close intelligence panel" onClick={onClose} className="focus-ring flex h-9 w-9 items-center justify-center rounded-full border border-rail-line-bright text-2xl leading-none text-text-muted transition hover:border-signal-clear hover:text-signal-clear">×</button>
      </div>

      <div className="rounded-lg border border-signal-clear/25 bg-signal-clear/5 p-4">
        <p className="font-mono text-xs uppercase tracking-wider text-text-faint">Selected station</p>
        <p className="mt-1 text-lg font-medium text-text-primary">{station?.name ?? "Loading station"}</p>
        <p className="mt-1 font-mono text-xs text-text-muted">{station?.provider ?? "Monitoring network"} · {parameter.toUpperCase()}</p>
      </div>

      <div className="flex justify-end border-b border-rail-line pb-4">
        <DownloadSampleData cityId={cityId} parameter={parameter} points={points} />
      </div>

      <div className="rounded-lg border border-rail-line bg-rail-panel p-4 flex-shrink-0">
        <ExposureScore result={exposure} loading={exposureLoading} />
      </div>

      {showQuickStats && (
        <div className="rounded-lg border border-rail-line bg-rail-panel p-3 flex-shrink-0">
          <p className="font-mono text-[11px] uppercase tracking-wider text-text-faint mb-1.5">Quick Stats</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
            <div className="flex justify-between">
              <span className="text-text-muted text-xs">Concentration</span>
              <span className="text-text-primary font-mono text-xs">
                {formatConcentration(exposure!.meanConcentration!, exposure!.parameter)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted text-xs">vs WHO</span>
              <span className={`font-mono text-xs ${exposure!.ratioToGuideline && exposure!.ratioToGuideline > 1 ? 'text-signal-alert' : 'text-signal-good'}`}>
                {exposure!.ratioToGuideline}×
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted text-xs">Population</span>
              <span className="text-text-primary font-mono text-xs">
                {exposure!.population ? exposure!.population.toLocaleString() : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted text-xs">Stations</span>
              <span className="text-text-primary font-mono text-xs">
                {exposure!.stationsSampled || 0}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-rail-line bg-rail-panel p-4">
        <CompareCities parameter={parameter} />
      </div>

      <div className="rounded-lg border border-rail-line bg-rail-panel p-2 flex-shrink-0">
        <p className="font-mono text-xs uppercase tracking-wider text-signal-clear">Why This Matters</p>
        <p className="text-sm text-text-muted leading-snug">
          Score = concentration ÷ WHO guideline, weighted by population.
        </p>
        <div className="text-xs text-text-faint font-mono truncate">
          score = 100 × (1 − 1/(1 + max(ratio − 1, 0)))
        </div>
      </div>

      <div className="rounded-lg border border-rail-line bg-rail-panel p-2 flex-shrink-0">
        <p className="font-mono text-xs uppercase tracking-wider text-signal-warn">Sources</p>
        <div className="flex gap-3 text-xs text-text-muted">
          <span>OpenAQ <span className="text-text-faint text-[11px]">Air</span></span>
          <span>WorldPop <span className="text-text-faint text-[11px]">Pop</span></span>
          <span>WHO <span className="text-text-faint text-[11px]">Guide</span></span>
        </div>
      </div>
    </aside>
  );
}
