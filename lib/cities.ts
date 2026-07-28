import { CityDef } from "./types";

// A small, deliberately global starter set — mixes cities with dense
// reference-grade monitoring (skews wealthy, Global North) against cities
// with sparser coverage, so the "Who controls the rail" panel has real
// examples to point at rather than an abstract claim.
export const CITIES: CityDef[] = [
  { id: "delhi", name: "Delhi", country: "IN", lat: 28.6139, lon: 77.209, bbox: [76.84, 28.4, 77.35, 28.88] },
  { id: "los-angeles", name: "Los Angeles", country: "US", lat: 34.0522, lon: -118.2437, bbox: [-118.67, 33.7, -118.15, 34.34] },
  { id: "london", name: "London", country: "GB", lat: 51.5072, lon: -0.1276, bbox: [-0.51, 51.29, 0.33, 51.69] },
  { id: "jakarta", name: "Jakarta", country: "ID", lat: -6.2088, lon: 106.8456, bbox: [106.68, -6.37, 106.97, -6.08] },
  { id: "lagos", name: "Lagos", country: "NG", lat: 6.5244, lon: 3.3792, bbox: [3.05, 6.35, 3.68, 6.7] },
  { id: "warsaw", name: "Warsaw", country: "PL", lat: 52.2297, lon: 21.0122, bbox: [20.85, 52.1, 21.27, 52.37] },
  { id: "sao-paulo", name: "São Paulo", country: "BR", lat: -23.5505, lon: -46.6333, bbox: [-46.83, -23.73, -46.36, -23.36] },
  { id: "beijing", name: "Beijing", country: "CN", lat: 39.9042, lon: 116.4074, bbox: [116.0, 39.65, 116.8, 40.2] },
];

export function getCity(id: string): CityDef | undefined {
  return CITIES.find((c) => c.id === id);
}
