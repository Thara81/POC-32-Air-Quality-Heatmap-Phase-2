"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Filters from "@/components/Filters";
import PollutantSelector from "@/components/PollutantSelector";
import CityMap from "@/components/CityMap";
import Sidebar from "@/components/Sidebar";
import TimeSeriesChart from "@/components/TimeSeriesChart";
import { getCity } from "@/lib/cities";
import { ExposureScoreResult, MeasurementPoint, PollutantCode, StationLocation } from "@/lib/types";

type ApiError = { error: string; code?: string };
function isError<T>(v: T | ApiError): v is ApiError {
  return typeof v === "object" && v !== null && "error" in v;
}

async function findStationWithData(
  candidateStations: StationLocation[],
  parameter: PollutantCode,
  daysBack: number
): Promise<{ stationId: number; points: MeasurementPoint[] } | null> {
  const matchingParameter = candidateStations.filter((station) =>
    station.parameters.includes(parameter)
  );

  const candidates = (matchingParameter.length > 0 ? matchingParameter : candidateStations)
    .slice()
    .sort(
      (a, b) =>
        new Date(b.lastUpdated ?? 0).getTime() - new Date(a.lastUpdated ?? 0).getTime()
    )
    .slice(0, 8);

  for (const station of candidates) {
    try {
      const res = await fetch(
        `/api/openaq/measurements?locationId=${station.id}&parameter=${parameter}&daysBack=${daysBack}`
      );
      const data = (await res.json()) as { points?: MeasurementPoint[] } | ApiError;

      if (isError(data)) {
        console.error(`station ${station.id} api error:`, data.error);
        continue;
      }

      if ((data.points?.length ?? 0) > 0) {
        return { stationId: station.id, points: data.points ?? [] };
      }
    } catch (err) {
      console.error(`station ${station.id} measurement fetch fail:`, err);
    }
  }
  return null;
}

export default function Page() {
  const [cityId, setCityId] = useState("delhi");
  const [parameter, setParameter] = useState<PollutantCode>("pm25");
  const [daysBack, setDaysBack] = useState(7);

  const [stations, setStations] = useState<StationLocation[]>([]);
  const [stationsLoading, setStationsLoading] = useState(true);
  const [stationsError, setStationsError] = useState<string | null>(null);
  const [selectedStationId, setSelectedStationId] = useState<number | null>(null);

  const [points, setPoints] = useState<MeasurementPoint[]>([]);
  const [seriesLoading, setSeriesLoading] = useState(false);

  const [exposure, setExposure] = useState<ExposureScoreResult | null>(null);
  const [exposureLoading, setExposureLoading] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);

  const city = getCity(cityId)!;

  // Load exposure from snapshot (most reliable source)
  useEffect(() => {
    let cancelled = false;
    setExposureLoading(true);

    fetch(`/api/exposure/snapshot`)
      .then((r) => r.json())
      .then((data: ExposureScoreResult[] | ApiError) => {
        if (cancelled) return;
        if (isError(data)) {
          setExposure(null);
          return;
        }
        const cityData = data.find(
          (d) => d.cityId === cityId && d.parameter === parameter
        );
        setExposure(cityData || null);
      })
      .catch(() => {
        if (!cancelled) setExposure(null);
      })
      .finally(() => {
        if (!cancelled) setExposureLoading(false);
      });

    return () => { cancelled = true; };
  }, [cityId, parameter]);

  // Load stations - reloads when city OR parameter changes
  useEffect(() => {
    let cancelled = false;
    setStationsLoading(true);
    setStationsError(null);
    setSelectedStationId(null);
    setPanelOpen(false);
    setPoints([]);

    fetch(`/api/openaq/locations?city=${cityId}`)
      .then((r) => r.json())
      .then(async (data: { stations: StationLocation[] } | ApiError) => {
        if (cancelled) return;
        if (isError(data)) {
          setStationsError(data.error);
          setStations([]);
          return;
        }

        setStations(data.stations);

        const match = await findStationWithData(data.stations, parameter, daysBack);
        if (!cancelled) {
          if (match) {
            setSelectedStationId(match.stationId);
            setPoints(match.points);
          } else if (data.stations.length > 0) {
            setSelectedStationId(data.stations[0].id);
          }
        }
      })
      .catch(() => {
        if (!cancelled) setStationsError("Network error reaching the OpenAQ rail.");
      })
      .finally(() => {
        if (!cancelled) setStationsLoading(false);
      });

    return () => { cancelled = true; };
  }, [cityId, parameter, daysBack]);

  // Load time series - with AbortController
  useEffect(() => {
    if (!selectedStationId) {
      setPoints([]);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    let cancelled = false;
    setSeriesLoading(true);

    fetch(
      `/api/openaq/measurements?locationId=${selectedStationId}&parameter=${parameter}&daysBack=${daysBack}`,
      { signal: controller.signal }
    )
      .then((r) => r.json())
      .then((data: { points: MeasurementPoint[] } | ApiError) => {
        if (cancelled || controller.signal.aborted) return;
        const pts = isError(data) ? [] : data.points;

        if (pts.length === 0 && stations.length > 0) {
          const nextStations = stations.filter(s => s.id !== selectedStationId);
          findStationWithData(nextStations, parameter, daysBack).then((match) => {
            if (match && !cancelled && !controller.signal.aborted) {
              setSelectedStationId(match.stationId);
              setPoints(match.points);
            } else {
              setPoints([]);
            }
          });
        } else {
          setPoints(pts);
        }
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        if (!cancelled && !controller.signal.aborted) setPoints([]);
      })
      .finally(() => {
        if (!cancelled && !controller.signal.aborted) setSeriesLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [selectedStationId, parameter, daysBack, stations]);

  const selectedStation = stations.find((s) => s.id === selectedStationId) ?? null;
  const selectStation = (id: number) => {
    setSelectedStationId(id);
    setPanelOpen(true);
  };

  return (
    <div className="relative h-screen overflow-hidden bg-rail-void">
      <Header />

      <main className="relative h-full w-full">
        {stationsError && (
          <div className="absolute left-4 top-24 z-[1050] rounded-lg border border-signal-alert/40 bg-rail-panel/95 p-2 text-xs text-signal-alert shadow-xl">
            <p className="font-mono text-[9px] uppercase tracking-wider">Live data unavailable</p>
            <p className="text-text-primary text-[10px]">{stationsError}</p>
          </div>
        )}

        <div className="absolute left-4 right-4 top-[5.75rem] z-[1000] flex justify-between gap-3 pointer-events-none">
          <div className="pointer-events-auto flex max-w-[calc(100%-1rem)] flex-wrap items-center gap-3 rounded-lg border border-rail-line-bright bg-rail-panel/95 p-3 shadow-xl backdrop-blur-md">
            <Filters
              city={cityId}
              onCityChange={setCityId}
              daysBack={daysBack}
              onDaysBackChange={setDaysBack}
            />
            <PollutantSelector value={parameter} onChange={setParameter} />
          </div>
          <div className="hidden self-start rounded-lg border border-rail-line bg-rail-panel/90 px-4 py-3 font-mono text-xs uppercase tracking-wider text-text-muted shadow-xl backdrop-blur-md sm:block">
            Click a marker to inspect intelligence
          </div>
        </div>

        <div className="absolute inset-0 p-2 pt-2">
          <CityMap
            city={city}
            stations={stations}
            selectedStationId={selectedStationId}
            onSelectStation={selectStation}
            loading={stationsLoading}
          />
        </div>

        <aside className={`absolute right-2 top-20 bottom-2 z-[1050] w-[min(500px,calc(100%-1rem))] overflow-hidden rounded-lg border border-rail-line-bright bg-rail-void/95 shadow-2xl shadow-black/50 backdrop-blur-xl transition-transform duration-300 ease-out ${panelOpen ? "translate-x-0" : "translate-x-[calc(100%+1rem)]"}`}>
          <Sidebar
            exposure={exposure}
            exposureLoading={exposureLoading}
            parameter={parameter}
            station={selectedStation}
            points={points}
            cityName={city.name}
            cityId={cityId}
            onClose={() => setPanelOpen(false)}
          />
        </aside>

        <div className="signal-graph absolute bottom-10 left-4 z-[1000] h-56 w-[min(560px,calc(100%-2rem))] rounded-xl border border-rail-line-bright bg-rail-panel/95 p-4 shadow-2xl shadow-black/40 backdrop-blur-md">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal-clear">Live signal graph</p>
              <p className="mt-0.5 text-sm font-medium text-text-primary">{selectedStation?.name ?? "Waiting for station data"}</p>
            </div>
            <span className="rounded border border-rail-line px-2 py-1 font-mono text-[10px] text-text-muted">{daysBack} DAY WINDOW</span>
          </div>
          <div className="h-[calc(100%-3.25rem)]">
            <TimeSeriesChart
              points={points}
              parameter={parameter}
              loading={seriesLoading || stationsLoading}
              stationName={null}
            />
          </div>
        </div>

        <footer className="absolute bottom-3 left-4 z-[1000] rounded border border-rail-line bg-rail-panel/80 px-2 py-1 font-mono text-[10px] text-text-faint backdrop-blur">
          <span>Environmental Intelligence · OpenAQ · WorldPop · WHO</span>
        </footer>
      </main>
    </div>
  );
}