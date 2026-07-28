"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { MeasurementPoint, PollutantCode, POLLUTANTS } from "@/lib/types";

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit" });
}

export default function TimeSeriesChart({
  points,
  parameter,
  loading,
  stationName,
}: {
  points: MeasurementPoint[];
  parameter: PollutantCode;
  loading: boolean;
  stationName: string | null;
}) {
  const def = POLLUTANTS.find((p) => p.code === parameter)!;
  const data = points.map((p) => ({ ...p, label: fmtTime(p.datetime) }));
  // Chart stays in µg/m³ — the single canonical unit every point and the
  // WHO guideline are already normalized to (see lib/adapters/openaq.ts).
  // Converting only for display would require a second conversion path,
  // which is exactly the kind of duplication that caused the original bug.

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-1 flex-shrink-0">
        <p className="font-mono text-[9px] uppercase tracking-wider text-text-faint truncate">
          {stationName ? stationName : "Select a station on the map"}
        </p>
        <p className="font-mono text-[9px] text-text-faint flex-shrink-0">µg/m³</p>
      </div>

      <div className="flex-1 min-h-0 rounded border border-rail-line bg-rail-panel p-1">
        {loading ? (
          <div className="flex h-full items-center justify-center font-mono text-xs text-text-muted">Loading…</div>
        ) : data.length === 0 ? (
          <div className="flex h-full items-center justify-center font-mono text-xs text-text-muted">
            No measurements in this window
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -4 }}>
              <CartesianGrid stroke="#1a2126" vertical={false} />
              <XAxis 
                dataKey="label" 
                tick={{ fill: "#4B565F", fontSize: 8 }} 
                axisLine={{ stroke: "#232B31" }} 
                tickLine={false} 
                minTickGap={25} 
              />
              <YAxis 
                tick={{ fill: "#4B565F", fontSize: 8 }} 
                axisLine={{ stroke: "#232B31" }} 
                tickLine={false} 
                width={25} 
              />
              <ReferenceLine 
                y={def.whoGuideline} 
                stroke="#F5A623" 
                strokeDasharray="3 3" 
                label={{ value: "WHO", position: "insideTopRight", fill: "#F5A623", fontSize: 7 }} 
              />
              <RTooltip
                contentStyle={{ background: "#161D23", border: "1px solid #33414A", borderRadius: 4, fontSize: 10, padding: "4px 8px" }}
                labelStyle={{ color: "#7C8994", fontSize: 9 }}
                itemStyle={{ color: "#3FE0C5", fontSize: 10 }}
                formatter={(v: number) => [`${v.toFixed(1)} µg/m³`, def.label]}
              />
              <Line type="monotone" dataKey="value" stroke="#3FE0C5" strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Rail track - minimal */}
      <div className="mt-0.5 flex items-center gap-0.5 flex-shrink-0" aria-hidden="true">
        <div className="h-1 w-1 rounded-full bg-rail-line-bright" />
        <div className="relative h-[1px] flex-1 bg-rail-track">
          {data.slice(0, Math.min(data.length, 20)).map((_, i) => (
            <span
              key={i}
              className="absolute top-1/2 h-0.5 w-[1px] -translate-y-1/2 bg-signal-clear/30"
              style={{ left: `${(i / Math.max(Math.min(data.length, 20) - 1, 1)) * 100}%` }}
            />
          ))}
        </div>
        <div className="h-1 w-1 rounded-full bg-rail-line-bright" />
      </div>
    </div>
  );
}
