# Air Quality Heatmap

Part of the **Real Rails Intelligence Library** — rail: **Data & Intelligence**.

A live dashboard that scores how much of a city's pollutant exposure exceeds
WHO 2021 guidelines, weighted by who actually lives there. Built on two
public, real (non-mock) sources:

- **[OpenAQ](https://openaq.org)** — monitoring station locations + pollutant measurements (v3 API, CC BY 4.0)
- **[WorldPop](https://www.worldpop.org)** — modeled population counts per city bounding box

No synthetic data is used for the live views. If the OpenAQ API key isn't
configured, the UI says so explicitly rather than silently substituting
fake numbers — see "Who controls the rail" in-app.

## Stack

- Next.js 14 (App Router) + TypeScript + Tailwind — dashboard UI
- `lib/adapters/*` — thin, swappable data-source adapters
- `app/api/*` — Route Handlers that keep the OpenAQ key server-side
- `etl/` — Python FastAPI service for batch scoring across the full city list

## Run the dashboard

```bash
npm install
cp .env.example .env.local   # add your free OpenAQ key: https://explore.openaq.org/register
npm run dev
```

Open http://localhost:3000.

## Run the batch ETL (optional)

```bash
pip install -r etl/requirements.txt
OPENAQ_API_KEY=... python etl/main.py --once
# writes data/exposure_scores.json for all cities in lib/cities.ts
```

Or serve it: `uvicorn etl.main:app --reload --port 8010` → `POST /run`, `GET /snapshot`.

## Project layout

```
app/
  page.tsx                 dashboard shell + client-side data orchestration
  api/openaq/locations      → lib/adapters/openaq.ts fetchStations
  api/openaq/measurements    → lib/adapters/openaq.ts fetchMeasurements
  api/worldpop/population    → lib/adapters/worldpop.ts fetchCityPopulation
  api/exposure                → joins both + lib/exposure.ts
components/                CityMap, TimeSeriesChart, PollutantSelector,
                            ExposureScore, CompareCities, WhyThisMatters,
                            WhoControlsTheRail, Filters, DownloadSampleData
lib/
  types.ts                 shared contract (cities, pollutants, results)
  cities.ts                starter city registry with bboxes
  exposure.ts               scoring formula (also mirrored in etl/exposure_calc.py)
  adapters/openaq.ts        server-only OpenAQ v3 client
  adapters/worldpop.ts      server-only WorldPop stats client
etl/                       Python FastAPI batch scorer
public/sample-data/        labeled SCHEMA EXAMPLE files (not live data)
```

## Extending

- **Swap data sources**: only `lib/adapters/*` and `lib/types.ts` should need
  to change; components consume the typed result shapes, not raw API responses.
- **Change the scoring model**: edit `lib/exposure.ts` (and mirror in
  `etl/exposure_calc.py` if you use the batch job).
- **Add cities**: append to `lib/cities.ts` (and `etl/main.py`'s `CITIES` list).

## Known v1 limitations

- WorldPop's stats API is async and occasionally slow; the exposure score
  degrades to "partial" (concentration-only) rather than blocking the UI.
- The exposure formula is a documented demo heuristic, not a peer-reviewed
  health index — see the "Why this matters" panel for the exact formula.
- City list is a curated starter set, not global coverage.
