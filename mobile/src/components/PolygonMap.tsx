import React, { useEffect, useMemo, useRef, useState } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import MapView, { MapType, Marker, Polygon, Polyline } from "react-native-maps";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ToastHost } from "@/components/AlertContext";
import {
  LatLng, formatArea, formatDistance, polygonAreaSqMeters, polygonCenter, polygonPerimeterMeters,
} from "@/lib/geo";

export type MapPhoto = { key: string; latitude: number; longitude: number; label: string };

type Props = {
  points: LatLng[];
  photos?: MapPhoto[];
  siteLocation?: LatLng | null;
  /** When given, the full-screen map offers "tap to add point". */
  onAddPoint?: (p: LatLng) => void;
};

const ACCENT = "#0E8A6C";
const PH_REGION = { latitude: 12.8797, longitude: 121.774, latitudeDelta: 12, longitudeDelta: 12 };
const MAP_TYPES: MapType[] = ["hybrid", "satellite", "standard", "terrain"];

export default function PolygonMap(props: Props) {
  const [fullscreen, setFullscreen] = useState(false);
  return (
    <View>
      <View style={styles.preview}>
        <MapCanvas {...props} compact />
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
  const [mapType, setMapType] = useState<MapType>("hybrid");
  const area = polygonAreaSqMeters(props.points);
  const perim = polygonPerimeterMeters(props.points);
  const f = formatArea(area);

  return (
    <View style={{ flex: 1 }}>
      <MapCanvas
        {...props}
        mapType={mapType}
        onMapPress={addMode && props.onAddPoint ? props.onAddPoint : undefined}
      />

      <View style={[styles.topBar, { top: insets.top + 10 }]}>
        <TouchableOpacity style={styles.roundBtn} onPress={props.onClose}>
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.typeBtn}
          onPress={() => setMapType(MAP_TYPES[(MAP_TYPES.indexOf(mapType) + 1) % MAP_TYPES.length])}
        >
          <Ionicons name="layers" size={16} color="#fff" />
          <Text style={styles.typeText}>{mapType}</Text>
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
          <TouchableOpacity
            style={[styles.addModeBtn, addMode && styles.addModeBtnOn]}
            onPress={() => setAddMode((v) => !v)}
          >
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

function MapCanvas({
  points, photos = [], siteLocation, compact, mapType = "hybrid", onMapPress,
}: Props & { compact?: boolean; mapType?: MapType; onMapPress?: (p: LatLng) => void }) {
  const mapRef = useRef<MapView>(null);
  const [ready, setReady] = useState(false);

  const allCoords = useMemo(() => {
    const c: LatLng[] = [...points];
    if (siteLocation) c.push(siteLocation);
    photos.forEach((p) => c.push(p));
    return c;
  }, [points, photos, siteLocation]);

  // Zoom to fit everything whenever the shape changes.
  useEffect(() => {
    if (!ready || allCoords.length === 0) return;
    if (allCoords.length === 1) {
      mapRef.current?.animateToRegion({ ...allCoords[0], latitudeDelta: 0.004, longitudeDelta: 0.004 }, 300);
    } else {
      mapRef.current?.fitToCoordinates(allCoords, {
        edgePadding: compact
          ? { top: 30, right: 30, bottom: 30, left: 30 }
          : { top: 120, right: 60, bottom: 220, left: 60 },
        animated: true,
      });
    }
  }, [ready, allCoords, compact]);

  const center = polygonCenter(points);
  const area = polygonAreaSqMeters(points);

  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      initialRegion={PH_REGION}
      mapType={mapType}
      showsUserLocation
      showsMyLocationButton={!compact}
      scrollEnabled={!compact}
      zoomEnabled={!compact}
      rotateEnabled={!compact}
      pitchEnabled={false}
      toolbarEnabled={false}
      onMapReady={() => setReady(true)}
      onPress={(e) => onMapPress?.(e.nativeEvent.coordinate)}
    >
      {points.length >= 3 && (
        <Polygon coordinates={points} strokeColor="#FACC15" strokeWidth={3} fillColor="rgba(5,200,156,0.25)" />
      )}
      {points.length === 2 && <Polyline coordinates={points} strokeColor="#FACC15" strokeWidth={3} />}

      {points.map((p, i) => (
        <Marker key={`v-${i}-${p.latitude}-${p.longitude}`} coordinate={p} anchor={{ x: 0.5, y: 0.5 }} title={`Point ${i + 1}`}>
          <View style={styles.vertex}>
            <Text style={styles.vertexText}>{i + 1}</Text>
          </View>
        </Marker>
      ))}

      {photos.map((p) => (
        <Marker key={p.key} coordinate={p} title={p.label} anchor={{ x: 0.5, y: 0.5 }}>
          <View style={styles.photoPin}>
            <Ionicons name="camera" size={11} color="#fff" />
          </View>
        </Marker>
      ))}

      {siteLocation && (
        <Marker coordinate={siteLocation} title="Assessment location" pinColor="#0F4A2F" />
      )}

      {center && points.length >= 3 && (
        <Marker coordinate={center} anchor={{ x: 0.5, y: 0.5 }} tappable={false}>
          <View style={styles.areaLabel}>
            <Text style={styles.areaLabelText}>{formatArea(area).hectares}</Text>
          </View>
        </Marker>
      )}
    </MapView>
  );
}

const styles = StyleSheet.create({
  preview: { height: 240, borderRadius: 14, overflow: "hidden", backgroundColor: "#CBD5E1" },
  expandBtn: {
    position: "absolute", right: 10, bottom: 10, flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(15,23,42,0.8)", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
  },
  expandText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  topBar: {
    position: "absolute", left: 16, right: 16, flexDirection: "row", justifyContent: "space-between",
  },
  roundBtn: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(15,23,42,0.8)",
    justifyContent: "center", alignItems: "center",
  },
  typeBtn: {
    flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(15,23,42,0.8)",
    paddingHorizontal: 14, borderRadius: 21,
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
  vertex: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: ACCENT, borderWidth: 2, borderColor: "#fff",
    justifyContent: "center", alignItems: "center",
  },
  vertexText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  photoPin: {
    width: 20, height: 20, borderRadius: 10, backgroundColor: "#0369A1", borderWidth: 2, borderColor: "#fff",
    justifyContent: "center", alignItems: "center",
  },
  areaLabel: {
    backgroundColor: "rgba(15,23,42,0.85)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
    borderWidth: 1, borderColor: "#FACC15",
  },
  areaLabelText: { color: "#FACC15", fontWeight: "800", fontSize: 13 },
});
