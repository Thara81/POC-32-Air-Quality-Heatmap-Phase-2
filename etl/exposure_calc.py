"""
Exposure scoring — single source of truth for the batch ETL job. Mirrors
lib/exposure.ts exactly (see the comment there for the paired-file rule).

v2 fixes two root-cause bugs found via a Beijing/CO snapshot that showed a
score of 44 ("Moderate") next to a ratioToGuideline of 112,635x:

1. UNIT MISMATCH: CO measurements from OpenAQ arrive in µg/m³, but the old
   WHO_GUIDELINE table expressed the CO guideline in mg/m³ (4.0) while the
   UI labeled the unit "mg/m³" without ever converting the raw value. That
   silently introduced a 1000x error into every CO ratio calculation.
   Fix: every guideline below is expressed in µg/m³ — the same unit OpenAQ
   reports concentrations in for all six pollutants. There is now exactly
   one internal unit, so there is no unit-mismatch class of bug possible.
   (CO's guideline of 4 mg/m³ = 4000 µg/m³.)

2. NO SANITY BOUNDS: a single glitched sensor reading (or a bad unit tag
   from the upstream API) could produce a mean concentration in the
   billions, which then produced a ratio so large it should have driven the
   score to ~100 ("Severe") — but because compute_exposure_score was only
   ever called from wherever a script happened to source `mean` from, a
   stale/partial snapshot write could leave score and ratio computed from
   two different values entirely (see main.py's atomic-write fix). As a
   second line of defense, this module now flags any ratio above
   SUSPECT_RATIO_THRESHOLD as "suspect" data quality rather than reporting
   a number the UI will render as if it were trustworthy.
"""
from datetime import datetime, timezone
from typing import Optional

# All guideline values are in µg/m³ — the canonical internal unit for every
# pollutant in this app. Convert at the edges (display formatting only),
# never in the middle of a calculation.
WHO_GUIDELINE_UGM3 = {
    "pm25": 5.0,
    "pm10": 15.0,
    "no2": 10.0,
    "o3": 100.0,
    "so2": 40.0,
    "co": 4000.0,  # WHO guideline is 4 mg/m3 = 4000 µg/m3
}

# A ratio beyond this is almost certainly bad upstream data (sensor fault,
# unit tag error, etc.) rather than a real reading. We still surface the
# raw number for transparency but refuse to derive a score/category from it.
SUSPECT_RATIO_THRESHOLD = 200.0


def categorize(score: int) -> str:
    if score < 25:
        return "Low"
    if score < 50:
        return "Moderate"
    if score < 75:
        return "High"
    return "Severe"


def compute_exposure_score(
    city_id: str,
    parameter: str,
    mean_concentration_ugm3: Optional[float],
    population: Optional[int],
) -> dict:
    """
    mean_concentration_ugm3 must already be normalized to µg/m³ by the
    caller (see fetch_city_mean in main.py) — this function does no unit
    conversion, only scoring.
    """
    guideline = WHO_GUIDELINE_UGM3[parameter]
    computed_at = datetime.now(timezone.utc).isoformat()

    base = {
        "cityId": city_id,
        "parameter": parameter,
        "unit": "µg/m³",
        "whoGuideline": guideline,
        "population": population,
        "computedAt": computed_at,
    }

    if mean_concentration_ugm3 is None:
        return {
            **base,
            "meanConcentration": None,
            "ratioToGuideline": None,
            "score": None,
            "category": None,
            "peopleAboveGuideline": None,
            "dataQuality": "unavailable",
        }

    ratio = mean_concentration_ugm3 / guideline

    if ratio > SUSPECT_RATIO_THRESHOLD or ratio < 0:
        # Surface the raw reading for debugging, but do not derive a
        # score/category from data we don't trust.
        return {
            **base,
            "meanConcentration": mean_concentration_ugm3,
            "ratioToGuideline": round(ratio, 2),
            "score": None,
            "category": None,
            "peopleAboveGuideline": None,
            "dataQuality": "suspect",
        }

    score = round(100 * (1 - 1 / (1 + max(ratio - 1, 0))))
    category = categorize(score)
    people_above = None
    if population is not None:
        people_above = round(population * min(0.95, max(0.0, (ratio - 1) * 0.35)))

    return {
        **base,
        "meanConcentration": mean_concentration_ugm3,
        "ratioToGuideline": round(ratio, 2),
        "score": score,
        "category": category,
        "peopleAboveGuideline": people_above,
        "dataQuality": "live" if population is not None else "partial",
    }
