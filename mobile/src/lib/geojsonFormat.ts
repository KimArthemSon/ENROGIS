// Pure GeoJSON conversion (no Expo imports) so it can be unit-tested in Node.
// Property names match web/src/lib/sites.ts.

import type { Assessment, PolygonPoint, Project } from "../db/repo";
import type { LatLng } from "./geo";

export type Feature = {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: { type: "Polygon"; coordinates: number[][][] };
};
export type FeatureCollection = { type: "FeatureCollection"; features: Feature[] };

const round7 = (n: number) => Math.round(n * 1e7) / 1e7;

function parseMeta(meta: string | null): Record<string, unknown> {
  try {
    return meta ? JSON.parse(meta) : {};
  } catch {
    return {};
  }
}

export function toFeature(project: Project, a: Assessment, points: PolygonPoint[]): Feature | null {
  if (points.length < 3) return null; // not a polygon yet
  const ring = points.map((p) => [round7(p.longitude), round7(p.latitude)]);
  ring.push(ring[0]);
  const meta = parseMeta(a.meta);
  return {
    type: "Feature",
    properties: {
      // Fields the web app reads
      name: a.title,
      refNo: (meta.refNo as string) ?? "",
      reforestationArea: (meta.reforestationArea as string) || project.name,
      barangay: (meta.barangay as string) ?? "",
      status: (meta.status as string) ?? "Surveyed",
      remarks: a.remarks ?? "",
      ...(meta.color ? { color: meta.color } : {}),
      // Extra info
      area_ha: Number((a.area_sqm / 10000).toFixed(6)),
      perimeter_m: Number(a.perimeter_m.toFixed(2)),
      project: project.name,
      project_location: project.location ?? "",
      source: "ENROGIS Mobile",
      recorded_at: a.created_at,
      updated_at: a.updated_at,
    },
    geometry: { type: "Polygon", coordinates: [ring] },
  };
}


export type ImportedPolygon = {
  title: string;
  remarks: string;
  points: LatLng[];
  meta: Record<string, unknown>;
};

/** Reads polygons from a GeoJSON FeatureCollection, Feature, or bare Polygon/MultiPolygon. */
export function parseGeoJSON(json: any): ImportedPolygon[] {
  const features: any[] =
    json?.type === "FeatureCollection"
      ? json.features ?? []
      : json?.type === "Feature"
        ? [json]
        : json?.type === "Polygon" || json?.type === "MultiPolygon"
          ? [{ type: "Feature", properties: {}, geometry: json }]
          : [];

  const out: ImportedPolygon[] = [];
  features.forEach((f, fi) => {
    const g = f?.geometry;
    const rings: number[][][] =
      g?.type === "Polygon" ? [g.coordinates?.[0]] : g?.type === "MultiPolygon" ? g.coordinates.map((p: any) => p?.[0]) : [];
    rings.forEach((ring, ri) => {
      if (!Array.isArray(ring)) return;
      const pts: LatLng[] = ring
        .filter((c) => Array.isArray(c) && isFinite(c[0]) && isFinite(c[1]))
        .map(([lng, lat]) => ({ latitude: lat, longitude: lng }));
      const first = pts[0];
      const last = pts[pts.length - 1];
      if (pts.length > 1 && first.latitude === last.latitude && first.longitude === last.longitude) pts.pop();
      if (pts.length < 3) return;

      const p = f.properties ?? {};
      const baseName = String(p.name ?? p.title ?? p.Name ?? `Imported polygon ${fi + 1}`);
      const { name, title, Name, remarks, area_ha, perimeter_m, source, ...rest } = p;
      out.push({
        title: rings.length > 1 ? `${baseName} (${ri + 1})` : baseName,
        remarks: typeof remarks === "string" ? remarks : "",
        points: pts,
        meta: rest,
      });
    });
  });
  return out;
}

