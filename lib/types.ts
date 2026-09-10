// Shared domain types for the Air Quality Heatmap rail.
// Kept deliberately small and explicit — this file is the contract between
// the ETL layer, the API routes, and the UI components.

export type PollutantCode = "pm25" | "pm10" | "no2" | "o3" | "so2" | "co";

// whoGuideline is ALWAYS expressed in µg/m³ — the single canonical unit
// used everywhere internally (measurements, means, guidelines, ratios).
// This used to be a mix of µg/m³ and mg/m³ (CO's guideline was 4 "mg/m³"
// while every concentration it was compared against was actually in
// µg/m³), which silently introduced a 1000x error into CO exposure scores.
// displayUnit is purely cosmetic — used only when formatting a number for
// screen, never in a calculation. See formatConcentration() in exposure.ts.
export const POLLUTANTS: {
  code: PollutantCode;
  label: string;
  displayUnit: string;
  whoGuideline: number;
}[] = [
  // whoGuideline = WHO 2021 Air Quality Guideline annual/short-term reference
  // values used only as a normalization anchor for exposure scoring, not a
  // legal standard.
  { code: "pm25", label: "PM2.5", displayUnit: "µg/m³", whoGuideline: 5 },
  { code: "pm10", label: "PM10", displayUnit: "µg/m³", whoGuideline: 15 },
  { code: "no2", label: "NO2", displayUnit: "µg/m³", whoGuideline: 10 },
  { code: "o3", label: "O3", displayUnit: "µg/m³", whoGuideline: 100 },
  { code: "so2", label: "SO2", displayUnit: "µg/m³", whoGuideline: 40 },
  // WHO guideline for CO is 4 mg/m³ = 4000 µg/m³. Stored here in the
  // canonical unit; displayUnit tells the UI to divide by 1000 when
  // formatting for screen.
  { code: "co", label: "CO", displayUnit: "mg/m³", whoGuideline: 4000 },
];

export interface CityDef {
  id: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  // bounding box used for OpenAQ location search + WorldPop population lookup
  bbox: [minLon: number, minLat: number, maxLon: number, maxLat: number];
}

export interface StationLocation {
  id: number;
  name: string;
  lat: number;
  lon: number;
  provider: string;
  parameters: PollutantCode[];
  lastUpdated: string | null;
}

export interface MeasurementPoint {
  datetime: string; // ISO timestamp
  value: number; // always normalized to µg/m³ — see adapters/openaq.ts
  unit: string; // always "µg/m³"; kept as a field for API-shape stability
}

export interface TimeSeriesResult {
  locationId: number;
  parameter: PollutantCode;
  unit: string;
  points: MeasurementPoint[];
}

export interface PopulationResult {
  cityId: string;
  population: number;
  source: "worldpop" | "unavailable";
  year: number | null;
}

export type ExposureCategory = "Low" | "Moderate" | "High" | "Severe";

// "suspect" = a ratio so far outside plausible bounds (see
// SUSPECT_RATIO_THRESHOLD in exposure.ts) that we don't trust it enough to
// derive a score/category from it. The raw meanConcentration/ratio are
// still reported for transparency/debugging.
export type DataQuality = "live" | "partial" | "unavailable" | "suspect" | "mock";

export interface ExposureScoreResult {
  cityId: string;
  parameter: PollutantCode;
  meanConcentration: number | null; // µg/m³
  unit: string; // always "µg/m³"
  whoGuideline: number; // µg/m³
  ratioToGuideline: number | null;
  population: number | null;
  score: number | null; // 0-100
  category: ExposureCategory | null;
  peopleAboveGuideline: number | null; // rough population-weighted estimate
  computedAt: string;
  dataQuality: DataQuality;
  stationsSampled?: number;
}
