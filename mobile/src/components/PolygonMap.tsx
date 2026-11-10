import React, { useEffect, useMemo, useRef, useState } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import * as Location from "expo-location";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ToastHost } from "@/components/AlertContext";
import {
  LatLng, distanceMeters, formatArea, formatDistance, polygonAreaSqMeters, polygonCenter, polygonPerimeterMeters,
} from "@/lib/geo";
import { buildMapHtml } from "@/lib/leafletHtml";

export type MapPhoto = { key: string; latitude: number; longitude: number; label: string };

type Props = {
  points: LatLng[];
  photos?: MapPhoto[];
  siteLocation?: LatLng | null;
  /** When given, the full-screen map offers "tap to add points". */
  onAddPoint?: (p: LatLng) => void;
};

type MapLayer = "hybrid" | "satellite" | "standard" | "terrain";
const LAYERS: MapLayer[] = ["hybrid", "satellite", "standard", "terrain"];
const ACCENT = "#0E8A6C";

// Built once; Leaflet is bundled inline so the map works offline.
// react-native-webview's prop types collapse to `never` with React 19.3 types, so we
// describe the props we use ourselves. Runtime behavior is unchanged.
const RNWebView = WebView as unknown as React.ComponentType<
  Record<string, unknown> & { ref?: React.Ref<WebView>; onMessage?: (e: WebViewMessageEvent) => void }
>;

const COMPACT_HTML = buildMapHtml(true);
const FULL_HTML = buildMapHtml(false);

export default function PolygonMap(props: Props) {
  const [fullscreen, setFullscreen] = useState(false);
  return (
    <View>
      <View style={styles.preview}>
        <LeafletCanvas {...props} compact layer="hybrid" />
        {/* Catch taps so the small preview opens the big map instead of panning */}
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setFullscreen(true)} />
        <TouchableOpacity style={styles.expandBtn} onPress={() => setFullscreen(true)}>
          <Ionicons name="expand" size={16} color="#fff" />
          <Text style={styles.expandText}>Open Map</Text>
        </TouchableOpacity>
      </View>
      <Modal visible={fullscreen} animationType="slide" onRequestClose={() => setFullscreen(false)}>
        <FullscreenMap {...props} onClose={() => setFullscreen(false)} />
        <ToastHost />
      </Modal>
    </View>
  );
}

function FullscreenMap(props: Props & { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [addMode, setAddMode] = useState(false);
  const [layer, setLayer] = useState<MapLayer>("hybrid");
  const [me, setMe] = useState<(LatLng & { accuracy: number | null }) | null>(null);
  const canvas = useRef<CanvasHandle>(null);
  const area = polygonAreaSqMeters(props.points);
  const perim = polygonPerimeterMeters(props.points);
  const f = formatArea(area);

  // Live "my location" dot while the big map is open (works offline).
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    (async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== "granted" || cancelled) return;
      sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, distanceInterval: 2 }, (l) =>
        setMe({ latitude: l.coords.latitude, longitude: l.coords.longitude, accuracy: l.coords.accuracy ?? null }),
      );
      if (cancelled) sub.remove();
    })().catch(() => {});
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: "#0F172A" }}>
      <LeafletCanvas
        ref={canvas}
        {...props}
        layer={layer}
        me={me}
        addMode={addMode && !!props.onAddPoint}
        onTap={props.onAddPoint}
      />

      <View style={[styles.topBar, { top: insets.top + 10 }]}>
        <TouchableOpacity style={styles.roundBtn} onPress={props.onClose}>
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.typeBtn} onPress={() => setLayer(LAYERS[(LAYERS.indexOf(layer) + 1) % LAYERS.length])}>
          <Ionicons name="layers" size={16} color="#fff" />
          <Text style={styles.typeText}>{layer}</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.sideBtns, { top: insets.top + 64 }]}>
        <TouchableOpacity style={styles.roundBtn} onPress={() => canvas.current?.fit()}>
          <MaterialCommunityIcons name="fit-to-screen-outline" size={20} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.roundBtn, !me && { opacity: 0.5 }]} disabled={!me} onPress={() => me && canvas.current?.center(me)}>
          <MaterialCommunityIcons name="crosshairs-gps" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={[styles.infoCard, { bottom: insets.bottom + 16 }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <MaterialCommunityIcons name="vector-polygon" size={26} color={ACCENT} />
          <View style={{ flex: 1 }}>
            <Text style={styles.infoLabel}>POLYGON SIZE · {props.points.length} POINTS</Text>
            {props.points.length >= 3 ? (
              <>
                <Text style={styles.infoValue}>{f.hectares}</Text>
                <Text style={styles.infoSub}>{f.sqm}  ·  Perimeter {formatDistance(perim)}</Text>
              </>
            ) : (
              <Text style={styles.infoSub}>Add at least 3 points to see the size</Text>
            )}
          </View>
        </View>
        {props.onAddPoint && (
          <TouchableOpacity style={[styles.addModeBtn, addMode && styles.addModeBtnOn]} onPress={() => setAddMode((v) => !v)}>
            <Ionicons name={addMode ? "hand-left" : "add-circle-outline"} size={16} color={addMode ? "#fff" : ACCENT} />
            <Text style={[styles.addModeText, addMode && { color: "#fff" }]}>
              {addMode ? "Tap the map to add points · Tap here to stop" : "Tap map to add points"}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ---------- WebView wrapper ----------

type CanvasHandle = { fit: () => void; center: (p: LatLng) => void };

type CanvasProps = Props & {
  compact?: boolean;
  layer: MapLayer;
  me?: (LatLng & { accuracy: number | null }) | null;
  addMode?: boolean;
  onTap?: (p: LatLng) => void;
};

const LeafletCanvas = React.forwardRef<CanvasHandle, CanvasProps>(function LeafletCanvas(
  { points, photos = [], siteLocation, compact, layer, me, addMode, onTap },
  ref,
) {
  const web = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const onTapRef = useRef(onTap);
  onTapRef.current = onTap;

  // Shape changes re-fit the view in the preview; the big map keeps the user's zoom.
  const shapeKey = JSON.stringify([points, photos.map((p) => p.key), siteLocation]);
  const lastShape = useRef<string | null>(null);

  const state = useMemo(() => {
    const center = polygonCenter(points);
    const n = points.length;
    const edges =
      !compact && n >= 2
        ? Array.from({ length: n >= 3 ? n : 1 }, (_, i) => {
            const a = points[i];
            const b = points[(i + 1) % n];
            return { lat: (a.latitude + b.latitude) / 2, lng: (a.longitude + b.longitude) / 2, text: formatDistance(distanceMeters(a, b)) };
          })
        : [];
    return {
      points,
      photos: photos.map((p) => ({ latitude: p.latitude, longitude: p.longitude })),
      site: siteLocation ?? null,
      layer,
      addMode: !!addMode,
      me: me ?? null,
      center,
      edges,
      areaLabel: n >= 3 ? formatArea(polygonAreaSqMeters(points)).hectares : null,
    };
  }, [points, photos, siteLocation, layer, addMode, me, compact]);

  useEffect(() => {
    if (!ready) return;
    const fit = compact ? lastShape.current !== shapeKey : lastShape.current === null;
    lastShape.current = shapeKey;
    web.current?.injectJavaScript(`window.__set(${JSON.stringify({ ...state, fit })}); true;`);
  }, [ready, state, shapeKey, compact]);

  React.useImperativeHandle(ref, () => ({
    fit: () => web.current?.injectJavaScript("window.__fit(); true;"),
    center: (p) => web.current?.injectJavaScript(`window.__center(${p.latitude}, ${p.longitude}); true;`),
  }));

  const onMessage = (e: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === "ready") setReady(true);
      else if (msg.type === "tap") onTapRef.current?.({ latitude: Math.round(msg.lat * 1e7) / 1e7, longitude: Math.round(msg.lng * 1e7) / 1e7 });
    } catch {}
  };

  return (
    <RNWebView
      ref={web}
      style={StyleSheet.absoluteFill}
      originWhitelist={["*"]}
      source={{ html: compact ? COMPACT_HTML : FULL_HTML, baseUrl: "https://enrogis.local/" }}
      onMessage={onMessage}
      javaScriptEnabled
      domStorageEnabled
      // Reuse map tiles already downloaded, so previously viewed areas show offline.
      cacheEnabled
      cacheMode="LOAD_CACHE_ELSE_NETWORK"
      scrollEnabled={false}
      overScrollMode="never"
      setSupportMultipleWindows={false}
      onContentProcessDidTerminate={() => web.current?.reload()}
      onRenderProcessGone={() => web.current?.reload()}
    />
  );
});

const styles = StyleSheet.create({
  preview: { height: 240, borderRadius: 14, overflow: "hidden", backgroundColor: "#CBD5E1" },
  expandBtn: {
    position: "absolute", right: 10, bottom: 10, flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(15,23,42,0.8)", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
  },
  expandText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  topBar: { position: "absolute", left: 16, right: 16, flexDirection: "row", justifyContent: "space-between" },
  sideBtns: { position: "absolute", right: 16, gap: 10 },
  roundBtn: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(15,23,42,0.8)", justifyContent: "center", alignItems: "center",
  },
  typeBtn: {
    flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(15,23,42,0.8)", paddingHorizontal: 14, borderRadius: 21,
  },
  typeText: { color: "#fff", fontWeight: "700", fontSize: 12, textTransform: "capitalize" },
  infoCard: {
    position: "absolute", left: 16, right: 16, backgroundColor: "#fff", borderRadius: 16, padding: 14, gap: 12,
    shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 10, elevation: 8,
  },
  infoLabel: { fontSize: 10, fontWeight: "700", color: "#6B7280", letterSpacing: 0.4 },
  infoValue: { fontSize: 22, fontWeight: "800", color: ACCENT },
  infoSub: { fontSize: 12, color: "#6B7280", fontWeight: "600" },
  addModeBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1.5,
    borderColor: ACCENT, borderRadius: 10, paddingVertical: 10,
  },
  addModeBtnOn: { backgroundColor: ACCENT },
  addModeText: { color: ACCENT, fontWeight: "700", fontSize: 12 },
});
