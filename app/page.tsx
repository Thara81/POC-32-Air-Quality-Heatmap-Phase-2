"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Filters from "@/components/Filters";
import PollutantSelector from "@/components/PollutantSelector";
import CityMap from "@/components/CityMap";
import TimeSeriesChart from "@/components/TimeSeriesChart";
import DownloadSampleData from "@/components/DownloadSampleData";
import Sidebar from "@/components/Sidebar";
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

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Header />

      <main className="flex-1 flex flex-col min-h-0 mx-auto max-w-7xl w-full px-3 py-1.5">
        {stationsError && (
          <div className="rounded-lg border border-signal-alert/40 bg-signal-alert/10 p-1.5 text-xs text-signal-alert mb-1.5 flex-shrink-0">
            <p className="font-mono text-[9px] uppercase tracking-wider">Live data unavailable</p>
            <p className="text-text-primary text-[10px]">{stationsError}</p>
          </div>
        )}

        <div className="rounded-lg border border-rail-line bg-rail-panel-raised p-1.5 mb-1.5 flex-shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <Filters
              city={cityId}
              onCityChange={setCityId}
              daysBack={daysBack}
              onDaysBackChange={setDaysBack}
            />
            <PollutantSelector value={parameter} onChange={setParameter} />
          </div>
        </div>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-2 min-h-0">
          <div className="lg:col-span-2 flex flex-col gap-2 min-h-0">
            <div className="flex-shrink-0" style={{ height: '40%' }}>
              <div className="flex items-center justify-between mb-0.5">
                <p className="font-mono text-[9px] uppercase tracking-wider text-text-faint">
                  {city.name} · {stations.length} stations
                </p>
                <span className="font-mono text-[9px] text-text-faint">
                  {parameter.toUpperCase()}
                </span>
              </div>
              <CityMap
                city={city}
                stations={stations}
                selectedStationId={selectedStationId}
                onSelectStation={setSelectedStationId}
                loading={stationsLoading}
              />
            </div>

            <div className="flex-1 min-h-0 rounded-lg border border-rail-line bg-rail-panel p-1.5 flex flex-col">
              <TimeSeriesChart
                points={points}
                parameter={parameter}
                loading={seriesLoading}
                stationName={selectedStation?.name ?? null}
              />
              <div className="mt-0.5 flex justify-end flex-shrink-0">
                <DownloadSampleData cityId={cityId} parameter={parameter} points={points} />
              </div>
            </div>
          </div>

          <div className="lg:col-span-1 min-h-0">
            <Sidebar
              exposure={exposure}
              exposureLoading={exposureLoading}
              parameter={parameter}
            />
          </div>
        </div>

        <footer className="mt-0.5 border-t border-rail-line pt-0.5 font-mono text-[8px] text-text-faint flex flex-wrap justify-between items-center flex-shrink-0">
          <span>Real Rails Intelligence Library · Data &amp; Intelligence rail</span>
          <span>Sources: OpenAQ · WorldPop · WHO</span>
        </footer>
      </main>
    </div>
  );
}