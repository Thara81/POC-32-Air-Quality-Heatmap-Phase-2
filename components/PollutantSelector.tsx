"use client";

import { POLLUTANTS, PollutantCode } from "@/lib/types";
import Tooltip from "./Tooltip";

export default function PollutantSelector({
  value,
  onChange,
}: {
  value: PollutantCode;
  onChange: (p: PollutantCode) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <p className="font-mono text-[10px] uppercase tracking-wider text-text-faint">Pollutant</p>
      <div className="flex flex-wrap gap-1">
        {POLLUTANTS.map((p) => {
          const active = p.code === value;
          const guidelineLabel =
            p.displayUnit === "mg/m³" ? `${p.whoGuideline / 1000} mg/m³` : `${p.whoGuideline} µg/m³`;
          return (
            <Tooltip key={p.code} label={`WHO 2021 guideline: ${guidelineLabel}`}>
              <button
                type="button"
                onClick={() => onChange(p.code)}
                className={`focus-ring rounded border px-2.5 py-1.5 font-mono text-xs transition-colors ${
                  active
                    ? "border-signal-clear/50 bg-signal-clear/15 text-signal-clear"
                    : "border-rail-line bg-rail-panel text-text-muted hover:border-rail-line-bright hover:text-text-primary"
                }`}
              >
                {p.label}
              </button>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
