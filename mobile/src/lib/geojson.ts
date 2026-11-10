// GeoJSON exchange with the ENROGIS web app.
// The property names below match web/src/lib/sites.ts (toGeoJSON / fromGeoJSON),
// so a file exported on one side imports cleanly on the other.

import type { SQLiteDatabase } from "expo-sqlite";
import { Directory, File, Paths } from "expo-file-system";
import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { Project, getProject, listAssessmentsWithPoints, listProjects, saveAssessment } from "@/db/repo";
import { polygonAreaSqMeters, polygonPerimeterMeters } from "@/lib/geo";
import { Feature, FeatureCollection, ImportedPolygon, parseGeoJSON, toFeature } from "./geojsonFormat";

export type { FeatureCollection, ImportedPolygon } from "./geojsonFormat";

async function projectFeatures(db: SQLiteDatabase, project: Project) {
  const rows = await listAssessmentsWithPoints(db, project.id);
  const features = rows.map((r) => toFeature(project, r.assessment, r.points));
  return {
    features: features.filter((f): f is Feature => f !== null),
    skipped: features.filter((f) => f === null).length,
  };
}

export async function buildProjectGeoJSON(db: SQLiteDatabase, projectId: number) {
  const project = await getProject(db, projectId);
  if (!project) throw new Error("Project not found");
  const { features, skipped } = await projectFeatures(db, project);
  return { fc: { type: "FeatureCollection", features } as FeatureCollection, skipped, name: project.name };
}

export async function buildAllGeoJSON(db: SQLiteDatabase) {
  const projects = await listProjects(db);
  const all: Feature[] = [];
  let skipped = 0;
  for (const p of projects) {
    const r = await projectFeatures(db, p);
    all.push(...r.features);
    skipped += r.skipped;
  }
  return { fc: { type: "FeatureCollection", features: all } as FeatureCollection, skipped, name: "All_Projects" };
}

export async function buildAssessmentGeoJSON(db: SQLiteDatabase, projectId: number, assessmentId: number) {
  const project = await getProject(db, projectId);
  const rows = await listAssessmentsWithPoints(db, projectId);
  const row = rows.find((r) => r.assessment.id === assessmentId);
  if (!project || !row) throw new Error("Assessment not found");
  const f = toFeature(project, row.assessment, row.points);
  return { fc: { type: "FeatureCollection", features: f ? [f] : [] } as FeatureCollection, skipped: f ? 0 : 1, name: row.assessment.title };
}

const fileNameFor = (name: string) =>
  `ENROGIS_${name.replace(/[^\w-]+/g, "_").replace(/_+/g, "_").slice(0, 40)}_${new Date().toISOString().slice(0, 10)}.geojson`;

/** Writes the file to the cache and opens the share sheet (Drive, Messenger, Gmail, Files…). */
export async function shareGeoJSON(fc: FeatureCollection, name: string) {
  const file = new File(Paths.cache, fileNameFor(name));
  if (file.exists) file.delete();
  file.create();
  await file.write(JSON.stringify(fc, null, 2));
  await Sharing.shareAsync(file.uri, {
    mimeType: "application/geo+json",
    UTI: "public.json",
    dialogTitle: "Export GeoJSON",
  });
}

/**
 * Android only: lets the user pick a folder (e.g. Downloads) and saves the file there.
 * Returns false if the user cancelled.
 */
export async function saveGeoJSONToFolder(fc: FeatureCollection, name: string): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  let dir: Directory;
  try {
    dir = await Directory.pickDirectoryAsync();
  } catch {
    return false; // cancelled
  }
  const file = dir.createFile(fileNameFor(name), "application/geo+json");
  await file.write(JSON.stringify(fc, null, 2));
  return true;
}

/** Opens the file picker. Returns the parsed polygons, or null if the user cancelled. */
export async function pickGeoJSONFile(): Promise<{ polygons: ImportedPolygon[]; fileName: string } | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: ["application/geo+json", "application/json", "application/octet-stream", "text/plain", "*/*"],
    copyToCacheDirectory: true,
  });
  if (res.canceled || !res.assets?.[0]) return null;
  const asset = res.assets[0];
  const text = await new File(asset.uri).text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("This file is not valid GeoJSON / JSON.");
  }
  return { polygons: parseGeoJSON(json), fileName: asset.name.replace(/\.(geo)?json$/i, "") };
}

/** Adds each polygon as a new assessment in the project. Returns how many were added. */
export async function importPolygons(db: SQLiteDatabase, projectId: number, polygons: ImportedPolygon[]) {
  let count = 0;
  for (const poly of polygons) {
    await saveAssessment(db, {
      project_id: projectId,
      title: poly.title,
      remarks: poly.remarks,
      latitude: null,
      longitude: null,
      accuracy: null,
      area_sqm: polygonAreaSqMeters(poly.points),
      perimeter_m: polygonPerimeterMeters(poly.points),
      points: poly.points.map((p, i) => ({
        seq: i + 1, latitude: p.latitude, longitude: p.longitude, accuracy: null, description: null,
      })),
      photos: [],
      meta: Object.keys(poly.meta).length ? JSON.stringify(poly.meta) : null,
    });
    count++;
  }
  return count;
}
