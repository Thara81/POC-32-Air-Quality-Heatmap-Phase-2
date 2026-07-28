import { DataQuality, ExposureCategory, ExposureScoreResult, PollutantCode, POLLUTANTS } from "./types";

/**
 * Exposure scoring methodology (v2 — see etl/exposure_calc.py for the full
 * writeup of the two bugs this version fixes: a unit mismatch that made CO
 * ratios ~1000x too large, and a missing sanity bound that let a single bad
 * reading produce a score/category inconsistent with its own ratio).
 *
 *   ratio      = mean concentration (µg/m³) / WHO 2021 guideline (µg/m³)
 *   score      = 100 * (1 - 1 / (1 + max(ratio - 1, 0)))   [0 when at/under guideline, approaches 100 as ratio grows]
 *   category   = Low (<25) / Moderate (25-49) / High (50-74) / Severe (75+)
 *   peopleAboveGuideline = population * ratioAdjustedShare
 *
 * IMPORTANT: this function must be called with meanConcentration already
 * normalized to µg/m³ (see lib/adapters/openaq.ts normalizeToUgM3). It does
 * not convert units — mixing that concern into scoring is exactly how the
 * original CO bug happened.
 *
 * This is a *rail*, not a verdict: it exists so builders can swap in a
 * better model without touching the UI or the ETL job — everything reads
 * this one function's output shape. Keep etl/exposure_calc.py in sync with
 * any change here.
 */

// A ratio beyond this is almost certainly bad upstream data (sensor fault,
// unit tag error, etc.) rather than a real reading. Must match
// SUSPECT_RATIO_THRESHOLD in etl/exposure_calc.py.
export const SUSPECT_RATIO_THRESHOLD = 200;

export function computeExposureScore(
  cityId: string,
  parameter: PollutantCode,
  meanConcentrationUgM3: number | null,
  population: number | null
): ExposureScoreResult {
  const def = POLLUTANTS.find((p) => p.code === parameter)!;
  const computedAt = new Date().toISOString();

  const base = {
    cityId,
    parameter,
    unit: "µg/m³",
    whoGuideline: def.whoGuideline,
    population,
    computedAt,
  };

  if (meanConcentrationUgM3 == null) {
    return {
      ...base,
      meanConcentration: null,
      ratioToGuideline: null,
      score: null,
      category: null,
      peopleAboveGuideline: null,
      dataQuality: "unavailable",
    };
  }

  const ratio = meanConcentrationUgM3 / def.whoGuideline;

  if (ratio > SUSPECT_RATIO_THRESHOLD || ratio < 0) {
    return {
      ...base,
      meanConcentration: meanConcentrationUgM3,
      ratioToGuideline: Number(ratio.toFixed(2)),
      score: null,
      category: null,
      peopleAboveGuideline: null,
      dataQuality: "suspect" as DataQuality,
    };
  }

  const score = Math.round(100 * (1 - 1 / (1 + Math.max(ratio - 1, 0))));
  const category = categorize(score);
  const peopleAboveGuideline =
    population != null ? Math.round(population * Math.min(0.95, Math.max(0, (ratio - 1) * 0.35))) : null;

  return {
    ...base,
    meanConcentration: meanConcentrationUgM3,
    ratioToGuideline: Number(ratio.toFixed(2)),
    score,
    category,
    peopleAboveGuideline,
    dataQuality: population != null ? "live" : "partial",
  };
}

function categorize(score: number): ExposureCategory {
  if (score < 25) return "Low";
  if (score < 50) return "Moderate";
  if (score < 75) return "High";
  return "Severe";
}

/** Cosmetic-only formatting for screen display — never used in a calculation. */
export function formatConcentration(valueUgM3: number, parameter: PollutantCode): string {
  const def = POLLUTANTS.find((p) => p.code === parameter)!;
  if (def.displayUnit === "mg/m³") {
    return `${(valueUgM3 / 1000).toFixed(2)} mg/m³`;
  }
  return `${valueUgM3.toFixed(1)} µg/m³`;
}

export const CATEGORY_COLOR: Record<ExposureCategory, string> = {
  Low: "signal-good",
  Moderate: "signal-warn",
  High: "signal-alert",
  Severe: "signal-severe",
};
