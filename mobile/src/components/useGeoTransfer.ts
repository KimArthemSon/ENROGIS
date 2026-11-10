import { useState } from "react";
import { Alert, Platform } from "react-native";
import { useSQLiteContext } from "expo-sqlite";
import { useAlert } from "@/components/AlertContext";
import { saveProject } from "@/db/repo";
import {
  FeatureCollection, ImportedPolygon, importPolygons, pickGeoJSONFile, saveGeoJSONToFolder, shareGeoJSON,
} from "@/lib/geojson";

type Built = { fc: FeatureCollection; skipped: number; name: string };

/** Export / import GeoJSON (compatible with the ENROGIS web map). */
export function useGeoTransfer() {
  const db = useSQLiteContext();
  const { success, error, warning } = useAlert();
  const [busy, setBusy] = useState(false);

  const exportGeoJSON = async (build: () => Promise<Built>) => {
    let built: Built;
    try {
      built = await build();
    } catch (e) {
      error("Export Failed", e instanceof Error ? e.message : "Unknown error");
      return;
    }
    const n = built.fc.features.length;
    if (n === 0) {
      warning("Nothing to Export", "Only assessments with at least 3 boundary points can be exported.");
      return;
    }
    const note = built.skipped ? `\n\n${built.skipped} assessment(s) without a complete polygon will be skipped.` : "";

    const run = async (how: "share" | "folder") => {
      setBusy(true);
      try {
        if (how === "share") {
          await shareGeoJSON(built.fc, built.name);
        } else {
          const ok = await saveGeoJSONToFolder(built.fc, built.name);
          if (ok) success("GeoJSON Saved", `${n} polygon(s) saved. Open the ENROGIS web map and use Import.`);
        }
      } catch (e) {
        error("Export Failed", e instanceof Error ? e.message : "Unknown error");
      } finally {
        setBusy(false);
      }
    };

    Alert.alert(
      "Export GeoJSON",
      `${n} polygon(s) ready. This file can be imported in the ENROGIS web map, QGIS or Google Earth.${note}`,
      [
        { text: "Cancel", style: "cancel" },
        ...(Platform.OS === "android" ? [{ text: "Save to folder", onPress: () => run("folder") }] : []),
        { text: "Share…", onPress: () => run("share") },
      ],
    );
  };

  /** Pick a file and add its polygons to one project. */
  const importIntoProject = async (projectId: number, onDone?: () => void) => {
    const picked = await pick();
    if (!picked) return;
    confirmImport(picked.polygons, `into this project`, async () => {
      const n = await importPolygons(db, projectId, picked.polygons);
      success("Imported", `${n} assessment(s) added from ${picked.fileName}.`);
      onDone?.();
    });
  };

  /**
   * Pick a file and create projects from it. Polygons are grouped by their
   * "project" / "reforestationArea" property, or go into one project named after the file.
   */
  const importAsProjects = async (onDone?: (firstProjectId: number) => void) => {
    const picked = await pick();
    if (!picked) return;
    const groups = new Map<string, ImportedPolygon[]>();
    for (const p of picked.polygons) {
      const key = String(p.meta.project || p.meta.reforestationArea || picked.fileName || "Imported").trim();
      groups.set(key, [...(groups.get(key) ?? []), p]);
    }
    confirmImport(picked.polygons, `as ${groups.size} new project(s)`, async () => {
      let first = 0;
      let total = 0;
      for (const [name, polys] of groups) {
        const location = polys.map((p) => p.meta.project_location || p.meta.barangay).find(Boolean);
        const id = await saveProject(db, {
          name,
          location: location ? String(location) : "",
          description: `Imported from ${picked.fileName}.geojson`,
        });
        if (!first) first = id;
        total += await importPolygons(db, id, polys);
      }
      success("Imported", `${total} assessment(s) in ${groups.size} project(s).`);
      onDone?.(first);
    });
  };

  const pick = async () => {
    try {
      const picked = await pickGeoJSONFile();
      if (picked && picked.polygons.length === 0) {
        warning("No Polygons Found", "The file has no polygons with at least 3 points.");
        return null;
      }
      return picked;
    } catch (e) {
      error("Import Failed", e instanceof Error ? e.message : "Could not read the file.");
      return null;
    }
  };

  const confirmImport = (polys: ImportedPolygon[], where: string, action: () => Promise<void>) => {
    Alert.alert("Import GeoJSON", `Add ${polys.length} polygon(s) ${where}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Import",
        onPress: async () => {
          setBusy(true);
          try {
            await action();
          } catch (e) {
            error("Import Failed", e instanceof Error ? e.message : "Unknown error");
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  return { busy, exportGeoJSON, importIntoProject, importAsProjects };
}
