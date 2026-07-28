"use client";

import { MeasurementPoint, PollutantCode } from "@/lib/types";
import Tooltip from "./Tooltip";

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toCSV(points: MeasurementPoint[]) {
  const header = "datetime,value,unit";
  const rows = points.map((p) => `${p.datetime},${p.value},${p.unit}`);
  return [header, ...rows].join("\n");
}

export default function DownloadSampleData({
  cityId,
  parameter,
  points,
}: {
  cityId: string;
  parameter: PollutantCode;
  points: MeasurementPoint[];
}) {
  const exportPoints = points;
  const base = `openaq-${cityId}-${parameter}`;

  return (
    <div className="flex items-center gap-2">
      <Tooltip label="Exports exactly what's currently loaded in the time-series chart — the live OpenAQ response.">
        <span className="font-mono text-[11px] uppercase tracking-wider text-text-faint">Export current series</span>
      </Tooltip>
      <button
        onClick={() => download(`${base}.csv`, toCSV(exportPoints), "text/csv")}
        className="focus-ring rounded-md border border-rail-line bg-rail-panel px-2.5 py-1 font-mono text-xs text-text-muted transition-colors hover:border-rail-line-bright hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
      >
        CSV
      </button>
      <button
        onClick={() => download(`${base}.json`, JSON.stringify(exportPoints, null, 2), "application/json")}
        className="focus-ring rounded-md border border-rail-line bg-rail-panel px-2.5 py-1 font-mono text-xs text-text-muted transition-colors hover:border-rail-line-bright hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
      >
        JSON
      </button>
    </div>
  );
}
