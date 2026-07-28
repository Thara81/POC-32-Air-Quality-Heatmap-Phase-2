"use client";

import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import { CityDef, StationLocation } from "@/lib/types";

export default function CityMapLeaflet({
  city,
  stations,
  selectedStationId,
  onSelectStation,
  loading,
}: {
  city: CityDef;
  stations: StationLocation[];
  selectedStationId: number | null;
  onSelectStation: (id: number) => void;
  loading: boolean;
}) {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const stationLayerRef = useRef<L.LayerGroup | null>(null);
  const frameLayerRef = useRef<L.LayerGroup | null>(null);

  const bounds = useMemo(
    () =>
      L.latLngBounds(
        [city.bbox[1], city.bbox[0]],
        [city.bbox[3], city.bbox[2]]
      ),
    [city.bbox]
  );

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) return;

    const map = L.map(mapElementRef.current, {
      zoomControl: true,
      scrollWheelZoom: true,
      doubleClickZoom: true,
      touchZoom: true,
      maxZoom: 16,
      minZoom: 8,
      attributionControl: true,
      zoomSnap: 0.5,
    });

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    }).addTo(map);

    stationLayerRef.current = L.layerGroup().addTo(map);
    frameLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    map.fitBounds(bounds, { padding: [20, 20], animate: false });
    window.setTimeout(() => map.invalidateSize(), 100);

    return () => {
      map.remove();
      mapRef.current = null;
      stationLayerRef.current = null;
      frameLayerRef.current = null;
    };
  }, [bounds]);

  useEffect(() => {
    const map = mapRef.current;
    const frameLayer = frameLayerRef.current;
    if (!map || !frameLayer) return;

    frameLayer.clearLayers();

    L.rectangle(bounds, {
      color: "#33414A",
      weight: 1,
      fillColor: "#0F1317",
      fillOpacity: 0.08,
    }).addTo(frameLayer);

    map.fitBounds(bounds, { padding: [20, 20], animate: false });
  }, [bounds, city.lat, city.lon, city.name]);

  useEffect(() => {
    const stationLayer = stationLayerRef.current;
    if (!stationLayer) return;

    stationLayer.clearLayers();

    stations.forEach((station) => {
      const isSelected = station.id === selectedStationId;

      // Fix #5: Highlight selected marker
      const marker = L.circleMarker([station.lat, station.lon], {
        radius: isSelected ? 8 : 4,
        color: isSelected ? "#3FE0C5" : "#F5A623",
        weight: isSelected ? 3 : 1.5,
        fillColor: isSelected ? "#3FE0C5" : "#F5A623",
        fillOpacity: isSelected ? 1 : 0.9,
      });

      marker
        .bindTooltip(
          `<div style="max-width:200px;font-size:10px;line-height:1.3">
            <div style="font-weight:600;color:#E8EDF0">${station.name}</div>
            <div style="color:#7C8994">${station.provider}</div>
            ${isSelected ? '<div style="color:#3FE0C5;font-weight:600;">● Selected</div>' : ''}
          </div>`,
          { direction: "top", offset: [0, -4], opacity: 1, sticky: true }
        )
        .on("click", () => onSelectStation(station.id))
        .addTo(stationLayer);
    });
  }, [stations, selectedStationId, onSelectStation]);

  return (
    <div className="relative h-full w-full">
      <div ref={mapElementRef} className="h-full w-full" />

      {loading && (
        <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-rail-panel/70 font-mono text-xs text-text-muted">
          Loading stations…
        </div>
      )}

      <div className="absolute left-2 top-2 z-[1000] rounded-md border border-rail-line bg-rail-panel/90 px-2 py-0.5 font-mono text-[8px] uppercase tracking-[0.15em] text-text-faint backdrop-blur">
        Dark tile map
      </div>

      {/* Legend */}
      <div className="absolute bottom-2 left-2 z-[1000] rounded-md border border-rail-line bg-rail-panel/90 px-2 py-0.5 font-mono text-[7px] text-text-faint backdrop-blur flex items-center gap-2">
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-[#F5A623]" />
          Station
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-[#3FE0C5]" />
          Selected
        </span>
      </div>
    </div>
  );
}
