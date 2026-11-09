import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAlert } from "@/components/AlertContext";
import { GpsFix } from "@/lib/gps";
import { gpsExif } from "@/lib/photos";

type Props = {
  /** `fix` is null when the user chose "Photo Only". */
  onCapture: (tempUri: string, fix: GpsFix | null) => void;
  onClose: () => void;
};

export default function GeoCamera({ onCapture, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [camPerm, requestCamPerm] = useCameraPermissions();
  const [locPerm, requestLocPerm] = Location.useForegroundPermissions();
  const [fix, setFix] = useState<GpsFix | null>(null);
  const [capturing, setCapturing] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const { warning, error } = useAlert();

  // Keep a live GPS fix while the camera is open. Works fully offline.
  useEffect(() => {
    if (!locPerm?.granted) return;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    (async () => {
      const last = await Location.getLastKnownPositionAsync().catch(() => null);
      if (last && !cancelled) setFix(toFix(last, true));
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Highest, timeInterval: 1000, distanceInterval: 0 },
        (loc) => setFix(toFix(loc, false)),
      );
      if (cancelled) sub.remove();
    })().catch((e) => console.warn("watchPosition failed", e));
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [locPerm?.granted]);

  const take = async (withGps: boolean) => {
    if (!cameraRef.current || capturing) return;
    if (withGps && !fix) {
      warning("GPS Required", "No GPS position yet. Wait a moment or use 'Photo Only'.");
      return;
    }
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.9,
        exif: withGps,
        additionalExif: withGps && fix ? gpsExif(fix.latitude, fix.longitude, fix.altitude) : undefined,
      });
      if (!photo?.uri) {
        error("Error", "Failed to capture photo.");
        return;
      }
      if (withGps && fix?.isFallback) {
        warning("Using Cached Location", "Live GPS not locked yet. Last known coordinates were used.");
      }
      onCapture(photo.uri, withGps ? fix : null);
    } catch (e) {
      error("Error", `Failed to capture photo: ${e instanceof Error ? e.message : "Unknown error"}`);
    } finally {
      setCapturing(false);
    }
  };

  if (!camPerm || !locPerm) {
    return (
      <View style={s.centerFill}>
        <ActivityIndicator size="large" color="#0F4A2F" />
        <Text style={s.permText}>Requesting permissions…</Text>
      </View>
    );
  }

  if (!camPerm.granted || !locPerm.granted) {
    return (
      <View style={s.centerFill}>
        <View style={s.permIconWrap}>
          <Ionicons name="camera-outline" size={36} color="#0F4A2F" />
        </View>
        <Text style={s.permTitle}>Permissions Required</Text>
        <Text style={s.permText}>Camera and location access are needed to take geotagged photos.</Text>
        <TouchableOpacity
          style={s.permBtn}
          onPress={async () => {
            await requestCamPerm();
            await requestLocPerm();
          }}
        >
          <Text style={s.permBtnText}>Grant Permissions</Text>
        </TouchableOpacity>
        <TouchableOpacity style={{ paddingVertical: 10 }} onPress={onClose}>
          <Text style={s.permCancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const hasGps = !!fix;
  const acc = fix?.accuracy;
  const signal = acc == null ? 0 : acc < 5 ? 5 : acc < 10 ? 4 : acc < 20 ? 3 : acc < 40 ? 2 : 1;

  return (
    <View style={s.root}>
      <CameraView ref={cameraRef} style={s.camera} facing="back" />

      <View style={[s.topBar, { top: insets.top + 12 }]}>
        <TouchableOpacity style={s.iconBtn} onPress={onClose}>
          <Ionicons name="close" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={s.locationPill}>
          <View style={[s.dot, { backgroundColor: hasGps ? (fix!.isFallback ? "#F59E0B" : "#4ADE80") : "#EF4444" }]} />
          <Text style={s.locationPillText}>
            {hasGps ? (fix!.isFallback ? "Cached GPS" : "GPS Locked") : "Searching GPS…"}
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <View style={s.reticle} pointerEvents="none">
        <View style={[s.bracket, s.bTL]} />
        <View style={[s.bracket, s.bTR]} />
        <View style={[s.bracket, s.bBL]} />
        <View style={[s.bracket, s.bBR]} />
      </View>

      <View style={[s.gpsCard, { bottom: 160 + insets.bottom }]}>
        <View style={s.gpsCardHeader}>
          <Text style={s.gpsCardLabel}>
            {hasGps ? (fix!.isFallback ? "GPS (CACHED)" : "GPS ACTIVE") : "NO GPS SIGNAL"}
          </Text>
          <View style={s.signalBars}>
            {[1, 2, 3, 4, 5].map((n) => (
              <View key={n} style={[s.signalBar, { height: 4 + n * 3, opacity: n <= signal ? 1 : 0.2 }]} />
            ))}
          </View>
        </View>
        {hasGps ? (
          <>
            <Text style={s.gpsCoords}>
              {fix!.latitude.toFixed(6)}°  {fix!.longitude.toFixed(6)}°
            </Text>
            <View style={s.gpsFooter}>
              <Text style={s.gpsTimestamp}>{new Date(fix!.timestamp).toLocaleTimeString()}</Text>
              {acc != null && <Text style={s.gpsPill}>±{Math.round(acc)} m</Text>}
            </View>
          </>
        ) : (
          <Text style={s.gpsWaiting}>Waiting for satellites… or use "Photo Only"</Text>
        )}
      </View>

      <View style={[s.captureArea, { bottom: 28 + insets.bottom }]}>
        <View style={s.captureCol}>
          <TouchableOpacity
            style={[s.gpsRing, !hasGps && { opacity: 0.4 }]}
            onPress={() => take(true)}
            disabled={capturing || !hasGps}
          >
            {capturing ? (
              <ActivityIndicator color="#0F4A2F" size="large" />
            ) : (
              <View style={s.gpsCore}>
                <Ionicons name="location" size={22} color="#0F4A2F" />
              </View>
            )}
          </TouchableOpacity>
          <Text style={s.captureHint}>GPS Photo</Text>
        </View>
        <View style={s.captureCol}>
          <TouchableOpacity style={s.plainRing} onPress={() => take(false)} disabled={capturing}>
            <View style={s.plainCore}>
              <Ionicons name="camera" size={20} color="#fff" />
            </View>
          </TouchableOpacity>
          <Text style={s.captureHint}>Photo Only</Text>
        </View>
      </View>
    </View>
  );
}

function toFix(loc: Location.LocationObject, isFallback: boolean): GpsFix {
  return {
    latitude: loc.coords.latitude,
    longitude: loc.coords.longitude,
    accuracy: loc.coords.accuracy ?? null,
    altitude: loc.coords.altitude ?? null,
    isFallback,
    timestamp: loc.timestamp,
  };
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  camera: { flex: 1 },
  centerFill: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F4F7F5", padding: 24 },
  permIconWrap: {
    width: 72, height: 72, borderRadius: 20, backgroundColor: "#E6F4EC",
    justifyContent: "center", alignItems: "center", marginBottom: 16,
  },
  permTitle: { fontSize: 18, fontWeight: "800", color: "#0F2D1C", marginBottom: 8 },
  permText: { fontSize: 14, color: "#6B7280", textAlign: "center", lineHeight: 20, marginBottom: 20 },
  permBtn: { backgroundColor: "#0F4A2F", paddingVertical: 13, paddingHorizontal: 32, borderRadius: 12, marginBottom: 10 },
  permBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  permCancelText: { color: "#9CA3AF", fontWeight: "600", fontSize: 14 },
  topBar: {
    position: "absolute", left: 0, right: 0, flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", paddingHorizontal: 16, zIndex: 10,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center", alignItems: "center",
  },
  locationPill: {
    flexDirection: "row", alignItems: "center", backgroundColor: "#fff", paddingHorizontal: 14,
    paddingVertical: 8, borderRadius: 20, gap: 6, elevation: 6,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  locationPillText: { color: "#0F2D1C", fontWeight: "700", fontSize: 13 },
  reticle: {
    position: "absolute", top: "35%", left: "50%", width: 160, height: 160,
    marginLeft: -80, marginTop: -80,
  },
  bracket: { position: "absolute", width: 28, height: 28, borderColor: "rgba(255,255,255,0.85)" },
  bTL: { top: 0, left: 0, borderTopWidth: 2.5, borderLeftWidth: 2.5 },
  bTR: { top: 0, right: 0, borderTopWidth: 2.5, borderRightWidth: 2.5 },
  bBL: { bottom: 0, left: 0, borderBottomWidth: 2.5, borderLeftWidth: 2.5 },
  bBR: { bottom: 0, right: 0, borderBottomWidth: 2.5, borderRightWidth: 2.5 },
  gpsCard: {
    position: "absolute", left: 12, right: 12, backgroundColor: "rgba(0,0,0,0.78)",
    borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", padding: 14, zIndex: 10,
  },
  gpsCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  gpsCardLabel: { fontSize: 11, fontWeight: "700", color: "rgba(255,255,255,0.7)", letterSpacing: 0.5 },
  signalBars: { flexDirection: "row", alignItems: "flex-end", gap: 3 },
  signalBar: { width: 4, borderRadius: 2, backgroundColor: "#4ADE80" },
  gpsCoords: {
    fontSize: 15, fontWeight: "700", color: "#4ADE80", marginBottom: 6,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  gpsFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  gpsTimestamp: { fontSize: 11, color: "rgba(255,255,255,0.5)" },
  gpsPill: {
    fontSize: 11, color: "#4ADE80", fontWeight: "700", backgroundColor: "rgba(74,222,128,0.2)",
    borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, overflow: "hidden",
  },
  gpsWaiting: { fontSize: 13, color: "rgba(255,255,255,0.5)", fontStyle: "italic" },
  captureArea: {
    position: "absolute", left: 0, right: 0, flexDirection: "row",
    justifyContent: "center", alignItems: "center", gap: 32, zIndex: 10,
  },
  captureCol: { alignItems: "center", gap: 8 },
  gpsRing: {
    width: 80, height: 80, borderRadius: 40, borderWidth: 3, borderColor: "#4ADE80",
    justifyContent: "center", alignItems: "center", backgroundColor: "rgba(74,222,128,0.15)",
  },
  gpsCore: { width: 58, height: 58, borderRadius: 29, backgroundColor: "#fff", justifyContent: "center", alignItems: "center" },
  plainRing: {
    width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: "rgba(255,255,255,0.6)",
    justifyContent: "center", alignItems: "center", backgroundColor: "rgba(255,255,255,0.15)",
  },
  plainCore: { width: 50, height: 50, borderRadius: 25, backgroundColor: "#0F4A2F", justifyContent: "center", alignItems: "center" },
  captureHint: { color: "rgba(255,255,255,0.75)", fontSize: 11, fontWeight: "600" },
});
