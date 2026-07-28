"use client";

import dynamic from "next/dynamic";
import { CityDef, StationLocation } from "@/lib/types";

const CityMapLeaflet = dynamic(() => import("./CityMapLeaflet"), { ssr: false });

export default function CityMap({
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
  return (
    <div className="h-full w-full relative rounded-lg border border-rail-line bg-rail-panel overflow-hidden">
      <CityMapLeaflet
        city={city}
        stations={stations}
        selectedStationId={selectedStationId}
        onSelectStation={onSelectStation}
        loading={loading}
      />
      <div className="absolute bottom-2 left-2 z-[1000] rounded-md border border-rail-line bg-rail-panel/90 px-2 py-0.5 font-mono text-[8px] text-text-faint backdrop-blur">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-signal-warn" /> station markers
        </span>
      </div>
    </div>
  );
}
