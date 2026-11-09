import type { SQLiteDatabase } from "expo-sqlite";
import { deleteLocalPhotoFile } from "@/lib/photos";

export type Project = {
  id: number;
  name: string;
  location: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectWithStats = Project & {
  assessment_count: number;
  total_area_sqm: number;
};

export type Assessment = {
  id: number;
  project_id: number;
  title: string;
  remarks: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  area_sqm: number;
  perimeter_m: number;
  created_at: string;
  updated_at: string;
};

export type AssessmentListItem = Assessment & {
  point_count: number;
  photo_count: number;
};

export type PolygonPoint = {
  id?: number;
  seq: number;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  description: string | null;
};

export type Photo = {
  id?: number;
  uri: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  description: string | null;
  saved_to_gallery: number;
  taken_at: string;
};

const now = () => new Date().toISOString();

// ---------- Projects ----------

export function listProjects(db: SQLiteDatabase) {
  return db.getAllAsync<ProjectWithStats>(`
    SELECT p.*,
      (SELECT COUNT(*) FROM assessments a WHERE a.project_id = p.id) AS assessment_count,
      (SELECT COALESCE(SUM(a.area_sqm), 0) FROM assessments a WHERE a.project_id = p.id) AS total_area_sqm
    FROM projects p
    ORDER BY p.updated_at DESC`);
}

export function getProject(db: SQLiteDatabase, id: number) {
  return db.getFirstAsync<Project>("SELECT * FROM projects WHERE id = ?", id);
}

export async function saveProject(
  db: SQLiteDatabase,
  data: { id?: number; name: string; location: string; description: string },
) {
  const ts = now();
  if (data.id) {
    await db.runAsync(
      "UPDATE projects SET name = ?, location = ?, description = ?, updated_at = ? WHERE id = ?",
      data.name, data.location || null, data.description || null, ts, data.id,
    );
    return data.id;
  }
  const res = await db.runAsync(
    "INSERT INTO projects (name, location, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    data.name, data.location || null, data.description || null, ts, ts,
  );
  return res.lastInsertRowId;
}

export async function deleteProject(db: SQLiteDatabase, id: number) {
  const photos = await db.getAllAsync<{ uri: string }>(
    `SELECT ph.uri FROM photos ph JOIN assessments a ON a.id = ph.assessment_id WHERE a.project_id = ?`,
    id,
  );
  await db.runAsync("DELETE FROM projects WHERE id = ?", id);
  photos.forEach((p) => deleteLocalPhotoFile(p.uri));
}

// ---------- Assessments ----------

export function listAssessments(db: SQLiteDatabase, projectId: number) {
  return db.getAllAsync<AssessmentListItem>(
    `SELECT a.*,
      (SELECT COUNT(*) FROM polygon_points pp WHERE pp.assessment_id = a.id) AS point_count,
      (SELECT COUNT(*) FROM photos ph WHERE ph.assessment_id = a.id) AS photo_count
     FROM assessments a WHERE a.project_id = ? ORDER BY a.updated_at DESC`,
    projectId,
  );
}

export async function getAssessmentFull(db: SQLiteDatabase, id: number) {
  const assessment = await db.getFirstAsync<Assessment>("SELECT * FROM assessments WHERE id = ?", id);
  if (!assessment) return null;
  const points = await db.getAllAsync<PolygonPoint>(
    "SELECT * FROM polygon_points WHERE assessment_id = ? ORDER BY seq", id,
  );
  const photos = await db.getAllAsync<Photo>(
    "SELECT * FROM photos WHERE assessment_id = ? ORDER BY taken_at", id,
  );
  return { assessment, points, photos };
}

export type AssessmentInput = {
  id?: number;
  project_id: number;
  title: string;
  remarks: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  area_sqm: number;
  perimeter_m: number;
  points: PolygonPoint[];
  photos: Photo[];
};

/** Saves the assessment with all its points and photos in one transaction. */
export async function saveAssessment(db: SQLiteDatabase, input: AssessmentInput) {
  const ts = now();
  let id = input.id;
  let removedPhotoUris: string[] = [];

  await db.withTransactionAsync(async () => {
    const fields = [
      input.title, input.remarks || null,
      input.latitude, input.longitude, input.accuracy,
      input.area_sqm, input.perimeter_m,
    ] as const;

    if (id) {
      await db.runAsync(
        `UPDATE assessments SET title = ?, remarks = ?, latitude = ?, longitude = ?,
           accuracy = ?, area_sqm = ?, perimeter_m = ?, updated_at = ? WHERE id = ?`,
        ...fields, ts, id,
      );
    } else {
      const res = await db.runAsync(
        `INSERT INTO assessments (project_id, title, remarks, latitude, longitude,
           accuracy, area_sqm, perimeter_m, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        input.project_id, ...fields, ts, ts,
      );
      id = res.lastInsertRowId;
    }

    // Points: replace the whole list so order stays exactly as shown.
    await db.runAsync("DELETE FROM polygon_points WHERE assessment_id = ?", id);
    for (const [i, p] of input.points.entries()) {
      await db.runAsync(
        `INSERT INTO polygon_points (assessment_id, seq, latitude, longitude, accuracy, description)
         VALUES (?, ?, ?, ?, ?, ?)`,
        id, i + 1, p.latitude, p.longitude, p.accuracy, p.description || null,
      );
    }

    // Photos: keep existing rows, update notes, add new, remove dropped ones.
    const keepIds = input.photos.filter((p) => p.id).map((p) => p.id!);
    const existing = await db.getAllAsync<{ id: number; uri: string }>(
      "SELECT id, uri FROM photos WHERE assessment_id = ?", id,
    );
    const removed = existing.filter((e) => !keepIds.includes(e.id));
    for (const r of removed) await db.runAsync("DELETE FROM photos WHERE id = ?", r.id);
    removedPhotoUris = removed.map((r) => r.uri);

    for (const ph of input.photos) {
      if (ph.id) {
        await db.runAsync("UPDATE photos SET description = ? WHERE id = ?", ph.description || null, ph.id);
      } else {
        await db.runAsync(
          `INSERT INTO photos (assessment_id, uri, latitude, longitude, accuracy, description, saved_to_gallery, taken_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          id, ph.uri, ph.latitude, ph.longitude, ph.accuracy, ph.description || null,
          ph.saved_to_gallery, ph.taken_at,
        );
      }
    }

    await db.runAsync("UPDATE projects SET updated_at = ? WHERE id = ?", ts, input.project_id);
  });

  removedPhotoUris.forEach(deleteLocalPhotoFile);
  return id!;
}

export async function deleteAssessment(db: SQLiteDatabase, id: number) {
  const photos = await db.getAllAsync<{ uri: string }>(
    "SELECT uri FROM photos WHERE assessment_id = ?", id,
  );
  await db.runAsync("DELETE FROM assessments WHERE id = ?", id);
  photos.forEach((p) => deleteLocalPhotoFile(p.uri));
}

export function markPhotoSavedToGallery(db: SQLiteDatabase, id: number) {
  return db.runAsync("UPDATE photos SET saved_to_gallery = 1 WHERE id = ?", id);
}
