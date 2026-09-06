"use client";

import { CITIES } from "@/lib/cities";
import Tooltip from "./Tooltip";

export default function Filters({
  city,
  onCityChange,
  daysBack,
  onDaysBackChange,
}: {
  city: string;
  onCityChange: (id: string) => void;
  daysBack: number;
  onDaysBackChange: (n: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5">
        <p className="font-mono text-[10px] uppercase tracking-wider text-text-faint">City</p>
        <select
          value={city}
          onChange={(e) => onCityChange(e.target.value)}
          className="focus-ring rounded border border-rail-line bg-rail-panel px-3 py-1.5 text-sm text-text-primary"
        >
          {CITIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}, {c.country}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-1.5">
        <div className="flex items-center gap-0.5">
          <p className="font-mono text-[10px] uppercase tracking-wider text-text-faint">Window</p>
          <Tooltip label="How far back the time-series chart and exposure score look.">
            <span className="cursor-help font-mono text-[7px] text-text-faint">?</span>
          </Tooltip>
        </div>
        <div className="flex gap-0.5">
          {[2, 7, 30].map((n) => (
            <button
              key={n}
              onClick={() => onDaysBackChange(n)}
              className={`focus-ring rounded border px-3 py-1.5 font-mono text-sm transition-colors ${
                daysBack === n
                  ? "border-signal-clear/50 bg-signal-clear/15 text-signal-clear"
                  : "border-rail-line bg-rail-panel text-text-muted hover:border-rail-line-bright hover:text-text-primary"
              }`}
            >
              {n}d
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
