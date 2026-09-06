# Air Quality Heatmap

Infocreon Internship - Air Quality Intelligence Platform.

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

## Production containers

The repository includes a standalone Next.js image in `Dockerfile` and an
independent FastAPI image in `etl/Dockerfile`. The services deliberately keep
their current boundary:

- The browser calls same-origin Next.js routes under `/api`.
- Next.js calls OpenAQ and WorldPop directly from server-side adapters.
- FastAPI runs the existing `etl/main.py` application and does not receive
  requests from Next.js.
- Both services mount `./data` at `/app/data`. The ETL service writes
  `data/exposure_scores.json`, and the Next.js snapshot route reads the same
  file.

Recommended repository changes for deployment are already represented by:

- `next.config.js` using `output: "standalone"` for a minimal production
  Node runtime.
- Multi-stage `Dockerfile` builds with Node 20 and a non-root runtime user.
- `etl/Dockerfile` running Uvicorn without `--reload`.
- `docker-compose.yml` sharing the snapshot directory without inventing a
  frontend-to-ETL network call.
- `.dockerignore` excluding local dependencies, build output, secrets, and
  generated metadata while retaining the snapshot directory.
- `.env.example` documenting the server-side API variables.

The snapshot file is intentionally gitignored. When deploying from a checkout
that does not already contain `data/exposure_scores.json`, start the stack and
run the ETL job before expecting `/api/exposure/snapshot` to return scores.

Create `.env` from `.env.example` and add the server-side OpenAQ key. Do not
use a `NEXT_PUBLIC_` prefix: the key must never be exposed to the browser.

```bash
cp .env.example .env
# edit .env and set OPENAQ_API_KEY
docker compose build
docker compose up -d
```

Refresh the shared snapshot:

```bash
curl -X POST http://localhost:8010/run
curl http://localhost:3000/api/exposure/snapshot
```

Useful operational commands:

```bash
docker compose logs -f nextjs
docker compose logs -f fastapi
docker compose ps
docker compose down
docker compose build --no-cache
docker compose up -d
```

On PowerShell, the ETL trigger can be sent with:

```powershell
Invoke-RestMethod -Method Post http://localhost:8010/run
```

## Container validation checklist

- [ ] `docker compose config` succeeds.
- [ ] Both images build without missing-module or missing-file errors.
- [ ] `http://localhost:3000` loads the full-screen Cinematic Rail UI.
- [ ] The dark Leaflet map, tiles, station markers, and selected marker render.
- [ ] City, time-window, and pollutant controls work.
- [ ] The sidebar, exposure score, comparison panel, chart, download controls,
      and developer signature work.
- [ ] `GET /api/exposure/snapshot` returns the shared snapshot after ETL has
      generated `data/exposure_scores.json`.
- [ ] OpenAQ routes work when `OPENAQ_API_KEY` is supplied and fail without
      leaking the key to browser code.
- [ ] WorldPop requests either return population data or degrade to the
      existing unavailable/partial behavior.
- [ ] `http://localhost:8010/docs` loads and `POST /run` completes.
- [ ] `GET http://localhost:8010/snapshot` reflects the shared data directory.
- [ ] Logs contain no connection-refused, module-not-found, or missing-file
      errors.
- [ ] The containers use the shared data directory; no localhost or FastAPI
      hostname is required by the current frontend architecture.

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
