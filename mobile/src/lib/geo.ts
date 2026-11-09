// Geodesic math on the same sphere Google Maps / Google Earth use for
// measuring (radius 6,378,137 m). The area formula is the one in Google's
// `google.maps.geometry.spherical.computeArea`, so results match theirs.

export const EARTH_RADIUS_M = 6378137;

export type LatLng = { latitude: number; longitude: number };

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle (haversine) distance in meters. */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const φ1 = toRad(a.latitude);
  const φ2 = toRad(b.latitude);
  const Δφ = toRad(b.latitude - a.latitude);
  const Δλ = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// Signed area of the spherical triangle formed by the pole and two points.
function polarTriangleArea(tan1: number, lng1: number, tan2: number, lng2: number) {
  const deltaLng = lng1 - lng2;
  const t = tan1 * tan2;
  return 2 * Math.atan2(t * Math.sin(deltaLng), 1 + t * Math.cos(deltaLng));
}

/** Polygon area in square meters. The polygon closes itself (last → first). */
export function polygonAreaSqMeters(path: LatLng[]): number {
  if (path.length < 3) return 0;
  let total = 0;
  const prev = path[path.length - 1];
  let prevTanLat = Math.tan((Math.PI / 2 - toRad(prev.latitude)) / 2);
  let prevLng = toRad(prev.longitude);
  for (const p of path) {
    const tanLat = Math.tan((Math.PI / 2 - toRad(p.latitude)) / 2);
    const lng = toRad(p.longitude);
    total += polarTriangleArea(tanLat, lng, prevTanLat, prevLng);
    prevTanLat = tanLat;
    prevLng = lng;
  }
  return Math.abs(total * EARTH_RADIUS_M * EARTH_RADIUS_M);
}

export const polygonAreaHectares = (path: LatLng[]) => polygonAreaSqMeters(path) / 10000;

/** Perimeter of the closed polygon in meters. */
export function polygonPerimeterMeters(path: LatLng[]): number {
  if (path.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < path.length; i++) {
    total += distanceMeters(path[i], path[(i + 1) % path.length]);
  }
  return path.length === 2 ? total / 2 : total;
}

/** Simple average of the vertices — good enough to place a label. */
export function polygonCenter(path: LatLng[]): LatLng | null {
  if (path.length === 0) return null;
  const sum = path.reduce(
    (acc, p) => ({ latitude: acc.latitude + p.latitude, longitude: acc.longitude + p.longitude }),
    { latitude: 0, longitude: 0 },
  );
  return { latitude: sum.latitude / path.length, longitude: sum.longitude / path.length };
}

function segmentsCross(a: LatLng, b: LatLng, c: LatLng, d: LatLng) {
  const cross = (o: LatLng, p: LatLng, q: LatLng) =>
    (p.longitude - o.longitude) * (q.latitude - o.latitude) -
    (p.latitude - o.latitude) * (q.longitude - o.longitude);
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** True when two non-adjacent edges cross (a "bow-tie" shape, area will be wrong). */
export function isSelfIntersecting(path: LatLng[]): boolean {
  const n = path.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    const a = path[i];
    const b = path[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // these edges share the closing vertex
      if (segmentsCross(a, b, path[j], path[(j + 1) % n])) return true;
    }
  }
  return false;
}

export function formatArea(sqm: number) {
  return {
    hectares: `${(sqm / 10000).toFixed(4)} ha`,
    sqm: `${Math.round(sqm).toLocaleString()} m²`,
  };
}

export function formatDistance(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${m.toFixed(1)} m`;
}
