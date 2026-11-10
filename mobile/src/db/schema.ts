import type { SQLiteDatabase } from "expo-sqlite";

const DATABASE_VERSION = 2;

/** Runs once on app start (via SQLiteProvider onInit) and upgrades the schema. */
export async function migrateDb(db: SQLiteDatabase) {
  await db.execAsync("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

  const row = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
  let version = row?.user_version ?? 0;
  if (version >= DATABASE_VERSION) return;

  if (version === 0) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        location TEXT,
        description TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS assessments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        remarks TEXT,
        location_context TEXT,
        latitude REAL,
        longitude REAL,
        accuracy REAL,
        area_sqm REAL NOT NULL DEFAULT 0,
        perimeter_m REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_assessments_project ON assessments(project_id);

      CREATE TABLE IF NOT EXISTS polygon_points (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        assessment_id INTEGER NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
        seq INTEGER NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        accuracy REAL,
        description TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_points_assessment ON polygon_points(assessment_id);

      CREATE TABLE IF NOT EXISTS photos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        assessment_id INTEGER NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
        uri TEXT NOT NULL,
        latitude REAL,
        longitude REAL,
        accuracy REAL,
        description TEXT,
        saved_to_gallery INTEGER NOT NULL DEFAULT 0,
        taken_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_photos_assessment ON photos(assessment_id);
    `);
    version = 1;
  }

  if (version === 1) {
    // Extra GeoJSON properties (refNo, barangay, status, color…) kept so web ↔ mobile round-trips lose nothing.
    await db.execAsync("ALTER TABLE assessments ADD COLUMN meta TEXT;");
    version = 2;
  }

  // Future migrations go here: if (version === 2) { ...; version = 3; }

  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}
