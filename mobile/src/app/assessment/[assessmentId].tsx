import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Image, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
} from "react-native";
import { Stack, useLocalSearchParams, useNavigation, usePreventRemove, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { deleteAssessment, getAssessmentFull, markPhotoSavedToGallery, saveAssessment } from "@/db/repo";
import { FieldLabel, HintBox, Input, SectionCard, colors } from "@/components/ui";
import { ToastHost, useAlert } from "@/components/AlertContext";
import GeoCamera from "@/components/GeoCamera";
import PolygonMap, { MapPhoto } from "@/components/PolygonMap";
import {
  LatLng, distanceMeters, formatArea, formatDistance, isSelfIntersecting, polygonAreaSqMeters,
  polygonPerimeterMeters,
} from "@/lib/geo";
import {
  GpsFix, GpsReadiness, checkGpsReadiness, formatAge, getGpsFix, gpsErrorMessage, GPS_LIVE_TIMEOUT_MS,
} from "@/lib/gps";
import { deleteLocalPhotoFile, persistPhoto, saveToGallery, sharePhoto } from "@/lib/photos";

const MAX_POLYGON_POINTS = 100;
const MIN_POLYGON_POINTS = 3;
const CLOSE_PROXIMITY_METERS = 3;

type FormPoint = {
  key: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  description: string;
};

type FormPhoto = {
  key: string;
  id?: number;
  uri: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  description: string;
  saved_to_gallery: number;
  taken_at: string;
};

type PointInput = { latitude: string; longitude: string; accuracy: string; description: string };

const newKey = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const numOrNull = (s: string) => (s.trim() === "" || isNaN(parseFloat(s)) ? null : parseFloat(s));

export default function AssessmentForm() {
  const params = useLocalSearchParams<{ assessmentId: string; projectId: string }>();
  const projectId = Number(params.projectId);
  const db = useSQLiteContext();
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { success, error: showError, warning, confirm } = useAlert();

  const [assessmentId, setAssessmentId] = useState<number | null>(
    params.assessmentId === "new" ? null : Number(params.assessmentId),
  );
  const [loading, setLoading] = useState(assessmentId !== null);
  const [saving, setSaving] = useState(false);

  // Form fields
  const [title, setTitle] = useState("");
  const [remarks, setRemarks] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [acc, setAcc] = useState("");
  const [points, setPoints] = useState<FormPoint[]>([]);
  const [photos, setPhotos] = useState<FormPhoto[]>([]);

  // UI state
  const [gettingLocation, setGettingLocation] = useState(false);
  const [gpsCountdown, setGpsCountdown] = useState(30);
  const [gpsReadiness, setGpsReadiness] = useState<GpsReadiness>("checking");
  const [gpsAge, setGpsAge] = useState<number | null>(null);
  const [capturingPoint, setCapturingPoint] = useState(false);
  const [pointModal, setPointModal] = useState<{ editingKey: string | null } | null>(null);
  const [pointForm, setPointForm] = useState<PointInput>({ latitude: "", longitude: "", accuracy: "", description: "" });
  const [showCamera, setShowCamera] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState<{ uri: string; fix: GpsFix | null } | null>(null);
  const [pendingNote, setPendingNote] = useState("");
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const [preview, setPreview] = useState<FormPhoto | null>(null);

  // ---------- Load ----------
  useEffect(() => {
    if (assessmentId === null) return;
    (async () => {
      const data = await getAssessmentFull(db, assessmentId);
      if (!data) {
        showError("Not Found", "This assessment no longer exists.");
        router.back();
        return;
      }
      const a = data.assessment;
      setTitle(a.title);
      setRemarks(a.remarks ?? "");
      setLat(a.latitude?.toString() ?? "");
      setLng(a.longitude?.toString() ?? "");
      setAcc(a.accuracy?.toString() ?? "");
      setPoints(
        data.points.map((p) => ({
          key: newKey(), latitude: p.latitude, longitude: p.longitude,
          accuracy: p.accuracy, description: p.description ?? "",
        })),
      );
      setPhotos(
        data.photos.map((p) => ({
          ...p, key: `db-${p.id}`, description: p.description ?? "",
        })),
      );
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!loading) refreshReadiness();
  }, [loading]);

  const refreshReadiness = async () => {
    const r = await checkGpsReadiness();
    setGpsReadiness(r.readiness);
    setGpsAge(r.ageHours);
  };

  // ---------- Derived values ----------
  const path: LatLng[] = points;
  const areaSqm = polygonAreaSqMeters(path);
  const perimeter = polygonPerimeterMeters(path);
  const areaFmt = formatArea(areaSqm);

  const polygonWarnings = useMemo(() => {
    const w: string[] = [];
    if (points.length > 0 && points.length < MIN_POLYGON_POINTS) {
      w.push(`Need ${MIN_POLYGON_POINTS - points.length} more point(s) for a valid polygon`);
    }
    if (points.length > MAX_POLYGON_POINTS - 5) {
      w.push(`Approaching max limit (${MAX_POLYGON_POINTS - points.length} remaining)`);
    }
    if (isSelfIntersecting(points)) {
      w.push("Boundary lines cross each other. Reorder the points so they go around the edge in sequence.");
    }
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const d = distanceMeters(points[i], points[j]);
        if (d < CLOSE_PROXIMITY_METERS) w.push(`Points ${i + 1} and ${j + 1} are very close (${d.toFixed(1)} m apart)`);
      }
    }
    return w;
  }, [points]);

  const siteLocation: LatLng | null = useMemo(() => {
    const la = numOrNull(lat);
    const lo = numOrNull(lng);
    return la !== null && lo !== null ? { latitude: la, longitude: lo } : null;
  }, [lat, lng]);

  const mapPhotos: MapPhoto[] = useMemo(
    () =>
      photos
        .filter((p) => p.latitude != null && p.longitude != null)
        .map((p, i) => ({ key: p.key, latitude: p.latitude!, longitude: p.longitude!, label: p.description || `Photo ${i + 1}` })),
    [photos],
  );

  // ---------- Unsaved-changes guard ----------
  const snapshot = JSON.stringify([
    title, remarks, lat, lng, acc,
    points.map((p) => [p.latitude, p.longitude, p.accuracy, p.description]),
    photos.map((p) => [p.key, p.description]),
  ]);
  const savedSnapshot = useRef<string | null>(null);
  useEffect(() => {
    if (!loading && savedSnapshot.current === null) savedSnapshot.current = snapshot;
  }, [loading]);
  const dirty = !loading && savedSnapshot.current !== null && savedSnapshot.current !== snapshot;

  // Set after deleting, so the screen can close without the discard prompt.
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (leaving) router.back();
  }, [leaving]);

  usePreventRemove(dirty && !leaving, ({ data }) => {
    confirm(
      "Discard changes?",
      "You have unsaved changes. Leave without saving?",
      () => {
        // Photos taken but never saved would be orphaned in app storage.
        photos.filter((p) => !p.id).forEach((p) => deleteLocalPhotoFile(p.uri));
        navigation.dispatch(data.action);
      },
      { type: "error", confirmText: "Discard", cancelText: "Keep editing" },
    );
  });

  // ---------- Assessment location ----------
  const handleUseCurrentLocation = async () => {
    setGettingLocation(true);
    setGpsCountdown(GPS_LIVE_TIMEOUT_MS / 1000);
    const interval = setInterval(() => setGpsCountdown((s) => Math.max(0, s - 1)), 1000);
    const res = await getGpsFix();
    clearInterval(interval);
    setGettingLocation(false);
    if (!res.ok) {
      showError("GPS Error", gpsErrorMessage[res.reason]);
      return;
    }
    setLat(res.fix.latitude.toFixed(6));
    setLng(res.fix.longitude.toFixed(6));
    setAcc(res.fix.accuracy?.toFixed(1) ?? "");
    if (res.fix.isFallback) warning("Using Last Known Location", "Live GPS unavailable. Your last known position was used.");
    else success("Location Captured", "GPS coordinates updated.");
    refreshReadiness();
  };

  // ---------- Polygon points ----------
  const openPointModal = (form: PointInput, editingKey: string | null) => {
    setPointForm(form);
    setPointModal({ editingKey });
  };

  const handleAddPointGPS = async () => {
    if (points.length >= MAX_POLYGON_POINTS) return;
    setCapturingPoint(true);
    const res = await getGpsFix();
    setCapturingPoint(false);
    if (!res.ok) {
      showError("GPS Error", gpsErrorMessage[res.reason]);
      return;
    }
    openPointModal(
      {
        latitude: res.fix.latitude.toFixed(7),
        longitude: res.fix.longitude.toFixed(7),
        accuracy: res.fix.accuracy?.toFixed(1) ?? "",
        description: "",
      },
      null,
    );
    if (res.fix.isFallback) warning("Using Cached Location", "Live GPS unavailable. Last known coordinates were used.");
  };

  const handleAddPointFromMap = useCallback((p: LatLng) => {
    setPoints((prev) =>
      prev.length >= MAX_POLYGON_POINTS
        ? prev
        : [...prev, { key: newKey(), latitude: p.latitude, longitude: p.longitude, accuracy: null, description: "Added on map" }],
    );
  }, []);

  const handleSavePoint = () => {
    const la = parseFloat(pointForm.latitude);
    const lo = parseFloat(pointForm.longitude);
    if (isNaN(la) || isNaN(lo)) return warning("Invalid Coordinates", "Please enter a valid latitude and longitude.");
    if (la < -90 || la > 90) return warning("Invalid Latitude", "Latitude must be between -90 and 90.");
    if (lo < -180 || lo > 180) return warning("Invalid Longitude", "Longitude must be between -180 and 180.");

    const editingKey = pointModal?.editingKey ?? null;
    if (!editingKey && points.length >= MAX_POLYGON_POINTS) {
      return warning("Max Points Reached", `Cannot add more than ${MAX_POLYGON_POINTS} points.`);
    }
    const pt: FormPoint = {
      key: editingKey ?? newKey(),
      latitude: la,
      longitude: lo,
      accuracy: numOrNull(pointForm.accuracy),
      description: pointForm.description.trim(),
    };
    setPoints((prev) => (editingKey ? prev.map((p) => (p.key === editingKey ? pt : p)) : [...prev, pt]));
    success(editingKey ? "Point Updated" : "Point Added");
    setPointModal(null);
  };

  const handleDeletePoint = (key: string) =>
    confirm("Delete Point", "Remove this boundary point?", () => setPoints((prev) => prev.filter((p) => p.key !== key)), {
      type: "error", confirmText: "Delete",
    });

  const movePoint = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= points.length) return;
    const next = [...points];
    [next[index], next[j]] = [next[j], next[index]];
    setPoints(next);
  };

  // ---------- Photos ----------
  const handlePhotoCaptured = (uri: string, fix: GpsFix | null) => {
    setShowCamera(false);
    setPendingPhoto({ uri, fix });
    setPendingNote(fix?.isFallback ? "Note: live GPS unavailable, cached coordinates used." : "");
  };

  const handleKeepPhoto = async (note: string) => {
    if (!pendingPhoto) return;
    setProcessingPhoto(true);
    try {
      const localUri = await persistPhoto(pendingPhoto.uri);
      const gallery = await saveToGallery(localUri);
      const inGallery = gallery.ok;
      const f = pendingPhoto.fix;
      setPhotos((prev) => [
        ...prev,
        {
          key: newKey(),
          uri: localUri,
          latitude: f?.latitude ?? null,
          longitude: f?.longitude ?? null,
          accuracy: f?.accuracy ?? null,
          description: note.trim(),
          saved_to_gallery: inGallery ? 1 : 0,
          taken_at: new Date().toISOString(),
        },
      ]);
      if (gallery.ok) success("Saved to Device", f ? "Geotagged photo saved to your Gallery › ENROGIS album." : "Photo saved to your Gallery › ENROGIS album.");
      else warning("Not Saved to Gallery", `${gallery.message} You can tap the photo and choose "Save to Device" later.`);
    } catch (e) {
      console.error(e);
      showError("Error", "Could not save the photo.");
    } finally {
      setProcessingPhoto(false);
      setPendingPhoto(null);
      setPendingNote("");
    }
  };

  const [downloading, setDownloading] = useState(false);

  const markDownloaded = (keys: string[]) => {
    setPhotos((prev) => prev.map((x) => (keys.includes(x.key) ? { ...x, saved_to_gallery: 1 } : x)));
    setPreview((cur) => (cur && keys.includes(cur.key) ? { ...cur, saved_to_gallery: 1 } : cur));
  };

  /** Saves one photo to the phone's Gallery (ENROGIS album). */
  const handleDownloadPhoto = async (p: FormPhoto) => {
    setDownloading(true);
    const res = await saveToGallery(p.uri);
    setDownloading(false);
    if (!res.ok) return showError("Could Not Save", res.message);
    if (p.id) await markPhotoSavedToGallery(db, p.id);
    markDownloaded([p.key]);
    success("Saved to Device", "Find it in your Gallery › ENROGIS album.");
  };

  /** Saves every photo not yet on the device. */
  const handleDownloadAll = async () => {
    const todo = photos.filter((p) => !p.saved_to_gallery);
    if (todo.length === 0) return;
    setDownloading(true);
    const done: string[] = [];
    let lastError = "";
    for (const p of todo) {
      const res = await saveToGallery(p.uri);
      if (res.ok) {
        done.push(p.key);
        if (p.id) await markPhotoSavedToGallery(db, p.id);
      } else lastError = res.message;
    }
    setDownloading(false);
    markDownloaded(done);
    if (done.length === todo.length) success("Saved to Device", `${done.length} photo(s) saved to Gallery › ENROGIS.`);
    else showError("Some Photos Not Saved", `${done.length} of ${todo.length} saved. ${lastError}`);
  };

  const handleSharePhoto = async (p: FormPhoto) => {
    const ok = await sharePhoto(p.uri).catch(() => false);
    if (!ok) warning("Sharing Unavailable", "This device can't open the share menu.");
  };

  const handleRemovePhoto = (p: FormPhoto) =>
    confirm(
      "Remove Photo",
      "Remove this photo from the assessment? The copy in your gallery is kept.",
      () => {
        setPhotos((prev) => prev.filter((x) => x.key !== p.key));
        if (!p.id) deleteLocalPhotoFile(p.uri); // never saved to the database
        setPreview(null);
      },
      { type: "error", confirmText: "Remove" },
    );

  // ---------- Save / delete ----------
  const handleSave = async () => {
    if (!title.trim()) return warning("Missing Title", "Please enter a descriptive title for this assessment.");
    if (points.length > 0 && points.length < MIN_POLYGON_POINTS) {
      return warning("Incomplete Polygon", `Add at least ${MIN_POLYGON_POINTS} boundary points, or remove them all.`);
    }
    setSaving(true);
    try {
      const id = await saveAssessment(db, {
        id: assessmentId ?? undefined,
        project_id: projectId,
        title: title.trim(),
        remarks: remarks.trim(),
        latitude: numOrNull(lat),
        longitude: numOrNull(lng),
        accuracy: numOrNull(acc),
        area_sqm: areaSqm,
        perimeter_m: perimeter,
        points: points.map((p, i) => ({ ...p, seq: i + 1 })),
        photos: photos.map(({ key, ...p }) => p),
      });
      // Reload photos so new ones get their database ids.
      const fresh = await getAssessmentFull(db, id);
      const freshPhotos = fresh?.photos.map((p) => ({ ...p, key: `db-${p.id}`, description: p.description ?? "" })) ?? [];
      setPhotos(freshPhotos);
      setAssessmentId(id);
      savedSnapshot.current = JSON.stringify([
        title, remarks, lat, lng, acc,
        points.map((p) => [p.latitude, p.longitude, p.accuracy, p.description]),
        freshPhotos.map((p) => [p.key, p.description]),
      ]);
      success("Saved", "Assessment saved on this device.");
    } catch (e) {
      console.error(e);
      showError("Error", "Could not save the assessment.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (assessmentId === null) return;
    confirm(
      "Delete Assessment",
      "Delete this assessment, its polygon and photos? Gallery copies are kept.",
      async () => {
        await deleteAssessment(db, assessmentId);
        success("Assessment Deleted");
        setLeaving(true);
      },
      { type: "error", confirmText: "Delete" },
    );
  };

  // ---------- Render ----------
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ color: colors.muted, marginTop: 10 }}>Loading assessment…</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Stack.Screen
        options={{
          title: assessmentId ? "Edit Assessment" : "New Assessment",
          headerRight: assessmentId
            ? () => (
                <TouchableOpacity onPress={handleDelete} hitSlop={8}>
                  <Ionicons name="trash-outline" size={20} color="#FCA5A5" />
                </TouchableOpacity>
              )
            : undefined,
        }}
      />

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {gpsReadiness !== "checking" && (
          <GpsReadinessBanner readiness={gpsReadiness} ageText={formatAge(gpsAge)} onRefresh={refreshReadiness} />
        )}

        {/* 1. Title & remarks */}
        <SectionCard title="Assessment Details" subtitle="Title and remarks for this record" iconName="pricetag-outline" accentColor={colors.primary} accentSoft={colors.tealSoft} step={1}>
          <FieldLabel label="Title" />
          <Input value={title} onChangeText={setTitle} placeholder="e.g., Boundary Survey – Sector A" />
          <FieldLabel label="Remarks" optional />
          <Input
            value={remarks}
            onChangeText={setRemarks}
            multiline
            placeholder="e.g., All boundary markers intact, minor deviation at northwest corner."
          />
        </SectionCard>

        {/* 2. Assessment location */}
        <SectionCard title="Assessment Location" subtitle="Your GPS position during this assessment" iconName="locate-outline" accentColor={colors.leaf} accentSoft={colors.leafSoft} step={2}>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <FieldLabel label="Latitude" optional />
              <Input value={lat} onChangeText={setLat} keyboardType="decimal-pad" placeholder="e.g. 11.0064" />
            </View>
            <View style={{ flex: 1 }}>
              <FieldLabel label="Longitude" optional />
              <Input value={lng} onChangeText={setLng} keyboardType="decimal-pad" placeholder="e.g. 124.6075" />
            </View>
          </View>
          <FieldLabel label="GPS Accuracy (meters)" optional />
          <Input value={acc} onChangeText={setAcc} keyboardType="decimal-pad" placeholder="e.g. 3.5" />
          <TouchableOpacity
            style={[styles.gpsBtn, gettingLocation && { opacity: 0.8 }]}
            onPress={handleUseCurrentLocation}
            disabled={gettingLocation}
          >
            {gettingLocation ? (
              <>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={styles.gpsBtnText}>Acquiring GPS ({gpsCountdown}s)…</Text>
              </>
            ) : (
              <>
                <MaterialCommunityIcons name="crosshairs-gps" size={16} color="#fff" />
                <Text style={styles.gpsBtnText}>Use Current Location</Text>
              </>
            )}
          </TouchableOpacity>
          <HintBox text="GPS works without internet. Leave blank if the assessment was done remotely." />
        </SectionCard>

        {/* 3. Boundary polygon */}
        <SectionCard
          title="Boundary Polygon"
          subtitle={`${points.length} point${points.length !== 1 ? "s" : ""} · add vertices in order around the edge`}
          iconName="vector-polygon"
          iconLib="mci"
          accentColor={colors.polygon}
          accentSoft={colors.tealSoft}
          step={3}
        >
          {polygonWarnings.length > 0 && (
            <View style={{ gap: 6 }}>
              {polygonWarnings.map((w, i) => (
                <View key={i} style={styles.warningItem}>
                  <Ionicons name="warning" size={12} color={colors.amber} />
                  <Text style={styles.warningText}>{w}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.sizeBox}>
            <View style={styles.sizeIcon}><MaterialCommunityIcons name="ruler-square" size={24} color={colors.teal} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sizeLabel}>Polygon Size (geodesic)</Text>
              {points.length >= MIN_POLYGON_POINTS ? (
                <>
                  <Text style={styles.sizeValue}>{areaFmt.hectares}</Text>
                  <Text style={styles.sizeSub}>
                    {areaFmt.sqm}  ·  Perimeter {formatDistance(perimeter)}
                  </Text>
                </>
              ) : (
                <Text style={styles.sizeSub}>Add at least {MIN_POLYGON_POINTS} points to see the size</Text>
              )}
            </View>
          </View>

          <PolygonMap points={path} photos={mapPhotos} siteLocation={siteLocation} onAddPoint={handleAddPointFromMap} />

          {points.length > 0 ? (
            <View style={{ gap: 10 }}>
              {points.map((p, i) => (
                <View key={p.key} style={styles.pointItem}>
                  <View style={styles.pointHeader}>
                    <View style={styles.pointNum}>
                      <Text style={styles.pointNumText}>{i + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pointCoords}>
                        {p.latitude.toFixed(6)}°, {p.longitude.toFixed(6)}°
                      </Text>
                      <Text style={styles.pointMeta}>
                        {p.accuracy != null ? `±${p.accuracy} m` : "accuracy n/a"}
                        {i > 0 ? `  ·  ${formatDistance(distanceMeters(points[i - 1], p))} from #${i}` : ""}
                      </Text>
                    </View>
                  </View>
                  <Text style={p.description ? styles.pointDesc : styles.pointNoDesc} numberOfLines={2}>
                    {p.description || "No description"}
                  </Text>
                  <View style={styles.pointActions}>
                    <TouchableOpacity style={[styles.smallBtn, i === 0 && { opacity: 0.3 }]} disabled={i === 0} onPress={() => movePoint(i, -1)}>
                      <Ionicons name="chevron-up" size={16} color={colors.polygon} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.smallBtn, i === points.length - 1 && { opacity: 0.3 }]}
                      disabled={i === points.length - 1}
                      onPress={() => movePoint(i, 1)}
                    >
                      <Ionicons name="chevron-down" size={16} color={colors.polygon} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.smallBtn, { backgroundColor: colors.polygon, marginLeft: "auto" }]}
                      onPress={() =>
                        openPointModal(
                          {
                            latitude: String(p.latitude),
                            longitude: String(p.longitude),
                            accuracy: p.accuracy?.toString() ?? "",
                            description: p.description,
                          },
                          p.key,
                        )
                      }
                    >
                      <Ionicons name="pencil" size={14} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.smallBtn, { backgroundColor: colors.danger }]} onPress={() => handleDeletePoint(p.key)}>
                      <Ionicons name="trash" size={14} color="#fff" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.polyEmpty}>
              <MaterialCommunityIcons name="vector-polygon" size={44} color="#B7EBDD" />
              <Text style={styles.polyEmptyText}>No boundary points yet</Text>
            </View>
          )}

          {points.length < MAX_POLYGON_POINTS && (
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity style={styles.addGpsBtn} onPress={handleAddPointGPS} disabled={capturingPoint}>
                {capturingPoint ? (
                  <ActivityIndicator size="small" color={colors.polygon} />
                ) : (
                  <>
                    <Ionicons name="locate" size={18} color={colors.polygon} />
                    <Text style={styles.addGpsText}>Use GPS</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.addManualBtn}
                onPress={() => openPointModal({ latitude: "", longitude: "", accuracy: "", description: "" }, null)}
              >
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={styles.addManualText}>Manual Entry</Text>
              </TouchableOpacity>
            </View>
          )}

          <HintBox
            color={colors.polygon}
            text="Walk the boundary and add a GPS point at each corner, in order. The polygon closes automatically. Size uses the same geodesic method as Google Earth / Google Maps."
          />
        </SectionCard>

        {/* 4. Photos */}
        <SectionCard
          title="Site Photos"
          subtitle={`${photos.length} photo${photos.length !== 1 ? "s" : ""} · ${photos.filter((p) => p.saved_to_gallery).length} on device`}
          iconName="camera-outline"
          accentColor={colors.water}
          accentSoft={colors.waterSoft}
          step={4}
        >
          {photos.some((p) => !p.saved_to_gallery) && (
            <TouchableOpacity style={styles.downloadAllBtn} onPress={handleDownloadAll} disabled={downloading}>
              {downloading ? (
                <ActivityIndicator size="small" color={colors.water} />
              ) : (
                <>
                  <Ionicons name="download-outline" size={17} color={colors.water} />
                  <Text style={styles.downloadAllText}>
                    Save {photos.filter((p) => !p.saved_to_gallery).length} photo(s) to device
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 4 }}>
            {photos.map((p) => (
              <View key={p.key} style={{ width: 92 }}>
                <TouchableOpacity onPress={() => setPreview(p)} activeOpacity={0.85}>
                  <Image source={{ uri: p.uri }} style={styles.thumb} />
                  {p.latitude != null && p.longitude != null ? (
                    <View style={styles.thumbCoords}>
                      <Text style={styles.thumbCoordsText}>
                        {p.latitude.toFixed(4)},{p.longitude.toFixed(4)}
                      </Text>
                    </View>
                  ) : (
                    <View style={[styles.thumbCoords, { backgroundColor: "rgba(180,83,9,0.85)" }]}>
                      <Text style={[styles.thumbCoordsText, { color: "#fff" }]}>No GPS</Text>
                    </View>
                  )}
                  {!p.id && (
                    <View style={styles.unsavedTag}>
                      <Text style={styles.unsavedTagText}>unsaved</Text>
                    </View>
                  )}
                  <View style={[styles.deviceBadge, { backgroundColor: p.saved_to_gallery ? colors.leaf : "rgba(0,0,0,0.55)" }]}>
                    <Ionicons name={p.saved_to_gallery ? "checkmark" : "phone-portrait-outline"} size={10} color="#fff" />
                  </View>
                </TouchableOpacity>
                <Text style={styles.thumbNote} numberOfLines={1}>
                  {p.description || "No note"}
                </Text>
                <TouchableOpacity style={styles.removePhoto} onPress={() => handleRemovePhoto(p)} hitSlop={6}>
                  <Ionicons name="close" size={11} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity style={styles.addPhoto} onPress={() => setShowCamera(true)}>
              <Ionicons name="camera" size={26} color={colors.water} />
              <Text style={styles.addPhotoText}>Add Photo</Text>
            </TouchableOpacity>
          </ScrollView>
          <HintBox
            color={colors.water}
            bg={colors.waterSoft}
            text={`Every photo you keep is saved to your phone's Gallery › ENROGIS album. "GPS Photo" also writes the coordinates into the photo. Tap a photo to save it again or share it.`}
          />
        </SectionCard>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.footerStatus}>{dirty ? "● Unsaved changes" : assessmentId ? "✓ All changes saved" : "New assessment"}</Text>
          <Text style={styles.footerSub}>Stored offline on this device</Text>
        </View>
        <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <MaterialCommunityIcons name="content-save-outline" size={18} color="#fff" />
              <Text style={styles.saveText}>Save</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Camera */}
      <Modal visible={showCamera} animationType="slide" onRequestClose={() => setShowCamera(false)}>
        <GeoCamera onCapture={handlePhotoCaptured} onClose={() => setShowCamera(false)} />
        <ToastHost />
      </Modal>

      {/* Note for a new photo */}
      <Modal visible={!!pendingPhoto} transparent animationType="fade" onRequestClose={() => handleKeepPhoto("")}>
        <View style={modal.overlay}>
          <View style={modal.box}>
            {pendingPhoto && <Image source={{ uri: pendingPhoto.uri }} style={modal.photo} />}
            <Text style={modal.title}>{pendingPhoto?.fix ? "Add Note for GPS Photo" : "Add Note for Photo"}</Text>
            <Text style={modal.subtitle}>
              {pendingPhoto?.fix
                ? `${pendingPhoto.fix.latitude.toFixed(6)}, ${pendingPhoto.fix.longitude.toFixed(6)}${pendingPhoto.fix.accuracy != null ? `  ±${Math.round(pendingPhoto.fix.accuracy)} m` : ""}`
                : "This photo has no GPS coordinates"}
            </Text>
            <Input value={pendingNote} onChangeText={setPendingNote} placeholder="e.g., BM-01 concrete post, intact" multiline style={{ minHeight: 70 }} />
            <View style={modal.buttons}>
              <TouchableOpacity
                style={modal.cancel}
                disabled={processingPhoto}
                onPress={() => {
                  setPendingPhoto(null);
                  setPendingNote("");
                }}
              >
                <Text style={modal.cancelText}>Discard</Text>
              </TouchableOpacity>
              <TouchableOpacity style={modal.save} onPress={() => handleKeepPhoto(pendingNote)} disabled={processingPhoto}>
                {processingPhoto ? <ActivityIndicator color="#fff" size="small" /> : <Text style={modal.saveText}>Keep Photo</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
        <ToastHost />
      </Modal>

      {/* Add / edit point */}
      <Modal visible={!!pointModal} transparent animationType="fade" onRequestClose={() => setPointModal(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={modal.overlay}>
          <View style={modal.box}>
            <Text style={modal.title}>{pointModal?.editingKey ? "Edit Boundary Point" : "Add Boundary Point"}</Text>
            <Text style={modal.subtitle}>
              {pointForm.latitude && pointForm.longitude ? "Coordinates filled · edit if needed" : "Enter coordinates in decimal degrees"}
            </Text>
            <FieldLabel label="Latitude" />
            <Input
              keyboardType="numbers-and-punctuation"
              value={pointForm.latitude}
              onChangeText={(t) => setPointForm((f) => ({ ...f, latitude: t }))}
              placeholder="e.g., 11.123456"
            />
            <FieldLabel label="Longitude" />
            <Input
              keyboardType="numbers-and-punctuation"
              value={pointForm.longitude}
              onChangeText={(t) => setPointForm((f) => ({ ...f, longitude: t }))}
              placeholder="e.g., 124.654321"
            />
            <FieldLabel label="Accuracy (meters)" optional />
            <Input
              keyboardType="decimal-pad"
              value={pointForm.accuracy}
              onChangeText={(t) => setPointForm((f) => ({ ...f, accuracy: t }))}
              placeholder="e.g., 3.5"
            />
            <FieldLabel label="Description" optional />
            <Input
              value={pointForm.description}
              onChangeText={(t) => setPointForm((f) => ({ ...f, description: t }))}
              placeholder="e.g., Northwest corner – concrete post"
              multiline
              style={{ minHeight: 60 }}
            />
            <View style={modal.buttons}>
              <TouchableOpacity style={modal.cancel} onPress={() => setPointModal(null)}>
                <Text style={modal.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[modal.save, { backgroundColor: colors.polygon }]} onPress={handleSavePoint}>
                <Text style={modal.saveText}>{pointModal?.editingKey ? "Update" : "Add Point"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
        <ToastHost />
      </Modal>

      {/* Photo preview */}
      <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <View style={styles.previewBg}>
          <TouchableOpacity style={[styles.previewClose, { top: insets.top + 12 }]} onPress={() => setPreview(null)}>
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
          {preview && (
            <>
              <Image source={{ uri: preview.uri }} style={{ width: "100%", height: "70%" }} resizeMode="contain" />
              <View style={styles.previewInfo}>
                <Text style={styles.previewText}>{preview.description || "No note"}</Text>
                <Text style={styles.previewMeta}>
                  {preview.latitude != null ? `${preview.latitude.toFixed(6)}, ${preview.longitude!.toFixed(6)}` : "No GPS"}
                  {"  ·  "}
                  {new Date(preview.taken_at).toLocaleString("en-PH")}
                </Text>
                <Text style={styles.previewMeta}>
                  {preview.saved_to_gallery ? "✓ Saved on device (Gallery › ENROGIS)" : "Stored in app only"}
                </Text>
                <View style={styles.previewActions}>
                  <TouchableOpacity
                    style={[styles.previewBtn, { backgroundColor: colors.leaf }]}
                    onPress={() => handleDownloadPhoto(preview)}
                    disabled={downloading}
                  >
                    {downloading ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="download-outline" size={18} color="#fff" />
                        <Text style={styles.previewBtnText}>{preview.saved_to_gallery ? "Save Again" : "Save to Device"}</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.previewBtn, { backgroundColor: "rgba(255,255,255,0.15)" }]} onPress={() => handleSharePhoto(preview)}>
                    <Ionicons name="share-social-outline" size={18} color="#fff" />
                    <Text style={styles.previewBtnText}>Share</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.previewIconBtn]} onPress={() => handleRemovePhoto(preview)}>
                    <Ionicons name="trash-outline" size={18} color="#FCA5A5" />
                  </TouchableOpacity>
                </View>
              </View>
            </>
          )}
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function GpsReadinessBanner({ readiness, ageText, onRefresh }: { readiness: GpsReadiness; ageText: string; onRefresh: () => void }) {
  if (readiness === "checking") return null;
  const c = {
    ready: { bg: "#DCFCE7", border: "#86EFAC", icon: "checkmark-circle", color: "#15803D", title: "GPS Ready", msg: `Last fix: ${ageText}. Safe to work offline.` },
    aging: { bg: "#FEF3C7", border: "#FCD34D", icon: "time-outline", color: "#92400E", title: "GPS Cache Aging", msg: `Last fix: ${ageText}. First lock may take longer.` },
    cold: { bg: "#FEE2E2", border: "#FCA5A5", icon: "snow-outline", color: "#991B1B", title: "GPS Cold", msg: "No recent fix. Stand in the open for a minute before recording points." },
  }[readiness];
  return (
    <View style={[styles.banner, { backgroundColor: c.bg, borderColor: c.border }]}>
      <Ionicons name={c.icon as any} size={18} color={c.color} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.bannerTitle, { color: c.color }]}>{c.title}</Text>
        <Text style={[styles.bannerMsg, { color: c.color }]}>{c.msg}</Text>
      </View>
      <TouchableOpacity onPress={onRefresh} style={styles.bannerRefresh}>
        <Ionicons name="refresh-outline" size={18} color={c.color} />
      </TouchableOpacity>
    </View>
  );
}

const mono = Platform.OS === "ios" ? "Menlo" : "monospace";

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  scroll: { padding: 16, paddingTop: 12 },
  banner: {
    flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 14, marginBottom: 14, borderWidth: 1,
  },
  bannerTitle: { fontSize: 12, fontWeight: "700" },
  bannerMsg: { fontSize: 11, marginTop: 1, opacity: 0.85 },
  bannerRefresh: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: "rgba(0,0,0,0.05)", justifyContent: "center", alignItems: "center",
  },
  gpsBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: colors.primary,
    paddingVertical: 13, borderRadius: 12, gap: 8, marginTop: 4,
  },
  gpsBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  warningItem: {
    flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#FEF3C7",
    paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6,
  },
  warningText: { fontSize: 11, color: "#92400E", fontWeight: "500", flex: 1 },
  sizeBox: {
    flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderRadius: 14,
    backgroundColor: colors.primary,
  },
  sizeLabel: { fontSize: 10.5, fontWeight: "800", color: colors.teal, textTransform: "uppercase", letterSpacing: 0.4 },
  sizeValue: { fontSize: 24, fontWeight: "900", color: "#fff", marginTop: 2 },
  sizeSub: { fontSize: 12, fontWeight: "600", color: "rgba(255,255,255,0.75)", marginTop: 2 },
  sizeIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.12)", justifyContent: "center", alignItems: "center" },
  pointItem: { backgroundColor: colors.inputBg, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: colors.border },
  pointHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  pointNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.polygon, justifyContent: "center", alignItems: "center" },
  pointNumText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  pointCoords: { fontSize: 12, fontWeight: "600", color: colors.text, fontFamily: mono },
  pointMeta: { fontSize: 10, color: colors.muted, marginTop: 1 },
  pointDesc: { fontSize: 11, color: "#475569" },
  pointNoDesc: { fontSize: 11, color: colors.faint, fontStyle: "italic" },
  pointActions: {
    flexDirection: "row", gap: 6, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border,
  },
  smallBtn: { width: 32, height: 32, borderRadius: 9, backgroundColor: colors.tealSoft, justifyContent: "center", alignItems: "center" },
  polyEmpty: { alignItems: "center", paddingVertical: 16, gap: 6 },
  polyEmptyText: { fontSize: 13, color: colors.muted, fontWeight: "600" },
  addGpsBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.tealSoft,
    borderWidth: 1.5, borderColor: colors.polygon, paddingVertical: 12, borderRadius: 12,
  },
  addGpsText: { color: colors.polygon, fontWeight: "700", fontSize: 13 },
  addManualBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: colors.polygon, paddingVertical: 12, borderRadius: 12,
  },
  addManualText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  thumb: { width: 92, height: 92, borderRadius: 12, backgroundColor: colors.border },
  thumbCoords: {
    position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "rgba(0,0,0,0.7)",
    paddingVertical: 2, borderBottomLeftRadius: 12, borderBottomRightRadius: 12,
  },
  thumbCoordsText: { fontSize: 9, color: "#4ADE80", fontWeight: "600", textAlign: "center" },
  unsavedTag: { position: "absolute", top: 4, left: 4, backgroundColor: colors.amber, borderRadius: 4, paddingHorizontal: 4 },
  unsavedTagText: { fontSize: 8, color: "#fff", fontWeight: "800" },
  thumbNote: { fontSize: 9, color: colors.muted, textAlign: "center", marginTop: 4 },
  removePhoto: {
    position: "absolute", top: -5, right: -5, backgroundColor: colors.danger, borderRadius: 10, width: 20, height: 20,
    justifyContent: "center", alignItems: "center", borderWidth: 1.5, borderColor: "#fff",
  },
  addPhoto: {
    width: 92, height: 92, borderRadius: 12, borderWidth: 1.5, borderColor: colors.water, borderStyle: "dashed",
    justifyContent: "center", alignItems: "center", gap: 4, backgroundColor: colors.waterSoft,
  },
  addPhotoText: { fontSize: 10.5, color: colors.water, fontWeight: "800" },
  footer: {
    position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "#fff", paddingHorizontal: 16, paddingTop: 12,
    borderTopLeftRadius: 22, borderTopRightRadius: 22, flexDirection: "row", alignItems: "center", gap: 12, elevation: 16,
    shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: -4 },
  },
  footerStatus: { fontSize: 12, fontWeight: "700", color: colors.text },
  footerSub: { fontSize: 10, color: colors.faint, marginTop: 2 },
  saveBtn: {
    flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.primary,
    paddingHorizontal: 30, paddingVertical: 14, borderRadius: 14,
  },
  saveText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  previewBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.94)", justifyContent: "center", alignItems: "center" },
  previewClose: {
    position: "absolute", right: 20, zIndex: 10, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 20, padding: 9,
  },
  previewInfo: { padding: 16, alignSelf: "stretch", gap: 4 },
  previewActions: { flexDirection: "row", gap: 10, marginTop: 14 },
  previewBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 13, borderRadius: 12,
  },
  previewBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  previewIconBtn: {
    width: 48, borderRadius: 12, backgroundColor: "rgba(220,38,38,0.25)", justifyContent: "center", alignItems: "center",
  },
  downloadAllBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10,
    borderRadius: 10, borderWidth: 1.5, borderColor: colors.water, backgroundColor: colors.waterSoft,
  },
  downloadAllText: { color: colors.water, fontWeight: "800", fontSize: 13 },
  deviceBadge: {
    position: "absolute", top: 4, right: 4, width: 18, height: 18, borderRadius: 9,
    justifyContent: "center", alignItems: "center", borderWidth: 1.5, borderColor: "#fff",
  },
  previewText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  previewMeta: { color: "rgba(255,255,255,0.6)", fontSize: 12 },
});

const modal = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 20 },
  box: { backgroundColor: "#fff", borderRadius: 22, padding: 20, gap: 8 },
  photo: { width: "100%", height: 180, borderRadius: 10, marginBottom: 6 },
  title: { fontSize: 16, fontWeight: "700", color: "#0F2D1C" },
  subtitle: { fontSize: 12, color: "#6B7280", marginBottom: 6 },
  buttons: { flexDirection: "row", justifyContent: "flex-end", gap: 12, marginTop: 8 },
  cancel: { paddingVertical: 10, paddingHorizontal: 16 },
  cancelText: { color: "#6B7280", fontWeight: "600", fontSize: 14 },
  save: { backgroundColor: colors.primary, paddingVertical: 11, paddingHorizontal: 20, borderRadius: 12, minWidth: 90, alignItems: "center" },
  saveText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
