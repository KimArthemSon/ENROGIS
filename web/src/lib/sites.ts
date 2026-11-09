import { polygonAreaSqMeters, polygonCenter, polygonPerimeterMeters, type LatLng } from "./geo";

export const STATUSES = ["Pending", "Surveyed", "Verified", "Approved", "For Revalidation"] as const;
export type SiteStatus = (typeof STATUSES)[number];

export const SITE_COLORS = ["#16a34a", "#0393d6", "#d97706", "#db2777", "#7c3aed", "#0d9488", "#dc2626", "#4c3221"];

export type Site = {
  id: string;
  name: string;
  refNo: string;
  reforestationArea: string;
  barangay: string;
  status: SiteStatus;
  remarks: string;
  color: string;
  visible: boolean;
  points: LatLng[];
  createdAt: string;
  updatedAt: string;
};

export type SiteStats = {
  areaSqm: number;
  hectares: number;
  perimeter: number;
  center: LatLng | null;
};

export function siteStats(site: Pick<Site, "points">): SiteStats {
  const areaSqm = polygonAreaSqMeters(site.points);
  return {
    areaSqm,
    hectares: areaSqm / 10000,
    perimeter: polygonPerimeterMeters(site.points),
    center: polygonCenter(site.points),
  };
}

export function nextRefNo(sites: Site[]): string {
  const year = new Date().getFullYear();
  const prefix = `SITE-${year}-`;
  const max = sites
    .map((s) => (s.refNo.startsWith(prefix) ? parseInt(s.refNo.slice(prefix.length), 10) : 0))
    .reduce((a, b) => Math.max(a, isNaN(b) ? 0 : b), 0);
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

export function newSite(sites: Site[], points: LatLng[] = []): Site {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: `Site ${sites.length + 1}`,
    refNo: nextRefNo(sites),
    reforestationArea: "",
    barangay: "",
    status: "Pending",
    remarks: "",
    color: SITE_COLORS[sites.length % SITE_COLORS.length],
    visible: true,
    points,
    createdAt: now,
    updatedAt: now,
  };
}

// ---------- localStorage ----------

const STORAGE_KEY = "enrogis.sites.v1";

export function loadSites(): Site[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isSite) : [];
  } catch {
    return [];
  }
}

export function saveSites(sites: Site[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sites));
    return true;
  } catch {
    return false;
  }
}

function isSite(v: unknown): v is Site {
  const s = v as Site;
  return !!s && typeof s.id === "string" && Array.isArray(s.points);
}

// ---------- GeoJSON backup ----------

export function toGeoJSON(sites: Site[]) {
  return {
    type: "FeatureCollection",
    features: sites.map((s) => {
      const st = siteStats(s);
      const ring = s.points.map((p) => [p.longitude, p.latitude]);
      if (ring.length) ring.push(ring[0]);
      return {
        type: "Feature",
        properties: {
          name: s.name,
          refNo: s.refNo,
          reforestationArea: s.reforestationArea,
          barangay: s.barangay,
          status: s.status,
          remarks: s.remarks,
          color: s.color,
          area_ha: Number(st.hectares.toFixed(6)),
          perimeter_m: Number(st.perimeter.toFixed(2)),
        },
        geometry: { type: "Polygon", coordinates: [ring] },
      };
    }),
  };
}

/** Reads polygons from a GeoJSON FeatureCollection (ours or from QGIS/Google Earth exports). */
export function fromGeoJSON(json: any, existing: Site[]): Site[] {
  const features: any[] = json?.type === "FeatureCollection" ? json.features : json?.type === "Feature" ? [json] : [];
  const out: Site[] = [];
  for (const f of features) {
    const g = f?.geometry;
    const rings: number[][][] =
      g?.type === "Polygon" ? [g.coordinates[0]] : g?.type === "MultiPolygon" ? g.coordinates.map((p: any) => p[0]) : [];
    for (const ring of rings) {
      const pts = ring.map(([lng, lat]) => ({ latitude: lat, longitude: lng }));
      const first = pts[0];
      const last = pts[pts.length - 1];
      if (pts.length > 1 && first.latitude === last.latitude && first.longitude === last.longitude) pts.pop();
      if (pts.length < 3) continue;
      const site = newSite([...existing, ...out], pts);
      const p = f.properties ?? {};
      if (p.name) site.name = String(p.name);
      if (p.refNo) site.refNo = String(p.refNo);
      if (p.reforestationArea) site.reforestationArea = String(p.reforestationArea);
      if (p.barangay) site.barangay = String(p.barangay);
      if (STATUSES.includes(p.status)) site.status = p.status;
      if (p.remarks) site.remarks = String(p.remarks);
      if (typeof p.color === "string") site.color = p.color;
      out.push(site);
    }
  }
  return out;
}

/** Parses pasted text like "11.0956, 124.7102" (one point per line). Accepts tabs/spaces too. */
export function parseCoordinateText(text: string): LatLng[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/[\s,;\t]+/).map(Number))
    .filter((n) => n.length >= 2 && !isNaN(n[0]) && !isNaN(n[1]) && Math.abs(n[0]) <= 90 && Math.abs(n[1]) <= 180)
    .map(([lat, lng]) => ({ latitude: lat, longitude: lng }));
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const safeFileName = (s: string) => s.replace(/[^\w-]+/g, "_").replace(/_+/g, "_").slice(0, 60);
