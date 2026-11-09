import { useEffect, useLayoutEffect, useRef, useState } from "react";
import L from "leaflet";
import "@geoman-io/leaflet-geoman-free";
import { distanceMeters, formatDistance, polygonAreaSqMeters, type LatLng } from "../lib/geo";
import { siteStats, type Site } from "../lib/sites";

export type MapMode = "view" | "draw" | "edit" | "addPoint" | "move";

type Props = {
  sites: Site[];
  selectedId: string | null;
  mode: MapMode;
  focus: { id: string; nonce: number } | null;
  flyTo: { lat: number; lng: number; nonce: number } | null;
  onSelect: (id: string | null) => void;
  onCreate: (points: LatLng[]) => void;
  onChangePoints: (id: string, points: LatLng[]) => void;
  onAddPoint: (p: LatLng) => void;
  onModeChange: (m: MapMode) => void;
};

const ORMOC: L.LatLngTuple = [11.0064, 124.6075];

// 7 decimals ≈ 1 cm, plenty for GPS-grade boundaries.
const r7 = (n: number) => Math.round(n * 1e7) / 1e7;
const toPts = (latlngs: L.LatLng[]): LatLng[] => latlngs.map((ll) => ({ latitude: r7(ll.lat), longitude: r7(ll.lng) }));
const toLL = (pts: LatLng[]): L.LatLngTuple[] => pts.map((p) => [p.latitude, p.longitude]);

function labelHtml(name: string, sqm: number) {
  return `<div class="site-label"><b>${escapeHtml(name)}</b><span>${(sqm / 10000).toFixed(4)} ha · ${Math.round(sqm).toLocaleString()} m²</span></div>`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export default function MapView(props: Props) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const groupRef = useRef<L.LayerGroup | null>(null);
  // Latest props for Leaflet event handlers that were attached once.
  const cb = useRef(props);
  useLayoutEffect(() => {
    cb.current = props;
  });
  const [cursor, setCursor] = useState<L.LatLng | null>(null);

  // ---------- Create the map once ----------
  useEffect(() => {
    if (!el.current) return;
    const map = L.map(el.current, { zoomControl: false, maxZoom: 21 }).setView(ORMOC, 13);
    mapRef.current = map;

    const satellite = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 21, maxNativeZoom: 18, attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
    });
    const labels = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 21, maxNativeZoom: 18 },
    );
    const hybrid = L.layerGroup([satellite, labels]);
    const streets = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 21, maxNativeZoom: 19, attribution: "© OpenStreetMap contributors",
    });
    const topo = L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
      maxZoom: 21, maxNativeZoom: 17, attribution: "© OpenTopoMap (CC-BY-SA)",
    });
    hybrid.addTo(map);
    L.control.layers({ "Satellite + Labels": hybrid, Satellite: satellite, Streets: streets, Terrain: topo }, undefined, { position: "topright" }).addTo(map);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.control.scale({ imperial: false, position: "bottomleft" }).addTo(map);

    // Vertex number labels sit below Geoman's drag handles so they never block them.
    map.createPane("labels");
    map.getPane("labels")!.style.zIndex = "450";
    map.getPane("labels")!.style.pointerEvents = "none";

    map.pm.setGlobalOptions({
      allowSelfIntersection: true,
      snappable: true,
      snapDistance: 15,
      templineStyle: { color: "#05C89C" },
      hintlineStyle: { color: "#05C89C", dashArray: "5,5" },
      pathOptions: { color: "#05C89C", fillOpacity: 0.25 },
    });

    groupRef.current = L.layerGroup().addTo(map);

    map.on("pm:create", (e: any) => {
      const layer = e.layer as L.Polygon;
      const latlngs = layer.getLatLngs()[0] as L.LatLng[];
      map.removeLayer(layer);
      cb.current.onCreate(toPts(latlngs));
    });
    map.on("pm:drawend", () => {
      if (cb.current.mode === "draw") cb.current.onModeChange("view");
    });
    map.on("click", (e: L.LeafletMouseEvent) => {
      if (cb.current.mode === "addPoint") cb.current.onAddPoint({ latitude: r7(e.latlng.lat), longitude: r7(e.latlng.lng) });
    });
    map.on("mousemove", (e: L.LeafletMouseEvent) => setCursor(e.latlng));
    map.on("mouseout", () => setCursor(null));

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // ---------- Draw mode ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (props.mode === "draw") {
      map.pm.enableDraw("Polygon", { snappable: true, finishOn: "dblclick" as any });
    } else if (map.pm.globalDrawModeEnabled()) {
      map.pm.disableDraw();
    }
    el.current!.style.cursor = props.mode === "addPoint" ? "crosshair" : "";
  }, [props.mode]);

  // ---------- Render polygons ----------
  useEffect(() => {
    const map = mapRef.current;
    const group = groupRef.current;
    if (!map || !group) return;
    group.clearLayers();

    for (const site of props.sites) {
      if (!site.visible || site.points.length === 0) continue;
      const selected = site.id === props.selectedId;
      const latlngs = toLL(site.points);
      const st = siteStats(site);

      if (site.points.length >= 3) {
        const poly = L.polygon(latlngs, {
          color: selected ? "#FACC15" : site.color,
          fillColor: site.color,
          weight: selected ? 3.5 : 2.5,
          fillOpacity: selected ? 0.32 : 0.2,
        });
        poly.on("click", (e) => {
          if (cb.current.mode === "view" || cb.current.mode === "edit" || cb.current.mode === "move") {
            L.DomEvent.stopPropagation(e);
            cb.current.onSelect(site.id);
          }
        });
        poly.addTo(group);

        const label = L.tooltip({ permanent: true, direction: "center", className: "site-tooltip", interactive: false })
          .setLatLng(poly.getCenter())
          .setContent(labelHtml(site.name, st.areaSqm));
        group.addLayer(label);

        if (selected && props.mode === "edit") {
          poly.pm.enable({ allowSelfIntersection: true, snappable: true });
          // Live size while a vertex is being dragged
          poly.on("pm:markerdrag", () => {
            const pts = toPts(poly.getLatLngs()[0] as L.LatLng[]);
            label.setContent(labelHtml(site.name, polygonAreaSqMeters(pts)));
          });
          poly.on("pm:edit", () => cb.current.onChangePoints(site.id, toPts(poly.getLatLngs()[0] as L.LatLng[])));
        }
        if (selected && props.mode === "move") {
          poly.pm.enableLayerDrag();
          poly.on("pm:dragend", () => cb.current.onChangePoints(site.id, toPts(poly.getLatLngs()[0] as L.LatLng[])));
        }
      } else if (site.points.length === 2) {
        L.polyline(latlngs, { color: selected ? "#FACC15" : site.color, weight: 3, dashArray: "6,6" }).addTo(group);
      }

      if (selected) {
        // Numbered vertices
        site.points.forEach((p, i) => {
          L.marker([p.latitude, p.longitude], {
            pane: "labels",
            interactive: false,
            icon: L.divIcon({
              className: "",
              html: `<div class="vertex-num" style="background:${site.color}">${i + 1}</div>`,
              iconSize: [22, 22],
              iconAnchor: props.mode === "edit" ? [-4, 26] : [11, 11],
            }),
          }).addTo(group);
        });
        // Edge lengths
        if (site.points.length >= 2 && props.mode !== "edit") {
          const n = site.points.length;
          const edges = n >= 3 ? n : 1;
          for (let i = 0; i < edges; i++) {
            const a = site.points[i];
            const b = site.points[(i + 1) % n];
            L.marker([(a.latitude + b.latitude) / 2, (a.longitude + b.longitude) / 2], {
              pane: "labels",
              interactive: false,
              icon: L.divIcon({ className: "", html: `<div class="edge-len">${formatDistance(distanceMeters(a, b))}</div>`, iconSize: [0, 0] }),
            }).addTo(group);
          }
        }
      }
    }
  }, [props.sites, props.selectedId, props.mode]);

  // ---------- Zoom to a site ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !props.focus) return;
    const site = props.sites.find((s) => s.id === props.focus!.id);
    if (!site || site.points.length === 0) return;
    if (site.points.length === 1) map.flyTo([site.points[0].latitude, site.points[0].longitude], 18);
    else map.flyToBounds(L.latLngBounds(toLL(site.points)), { padding: [60, 60], maxZoom: 20 });
  }, [props.focus?.nonce]);

  useEffect(() => {
    if (mapRef.current && props.flyTo) mapRef.current.flyTo([props.flyTo.lat, props.flyTo.lng], 18);
  }, [props.flyTo?.nonce]);

  const locateMe = () => {
    const map = mapRef.current;
    if (!map) return;
    map.locate({ setView: true, maxZoom: 18, enableHighAccuracy: true });
    map.once("locationfound", (e: L.LocationEvent) => {
      L.circle(e.latlng, { radius: e.accuracy, color: "#0393d6", weight: 1, fillOpacity: 0.1 }).addTo(groupRef.current!);
      L.circleMarker(e.latlng, { radius: 6, color: "#fff", weight: 2, fillColor: "#0393d6", fillOpacity: 1 }).addTo(groupRef.current!);
    });
  };

  return (
    <div className="relative h-full w-full">
      <div ref={el} className="h-full w-full" />

      <button
        onClick={locateMe}
        title="Show my location"
        className="absolute bottom-24 right-2.5 z-[500] grid h-[34px] w-[34px] place-items-center rounded-md border-2 border-black/20 bg-white text-forest-700 shadow hover:bg-forest-50"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
          <circle cx="12" cy="12" r="7" />
        </svg>
      </button>

      {cursor && (
        <div className="pointer-events-none absolute bottom-2 left-1/2 z-[500] -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 font-mono text-[11px] text-white">
          {cursor.lat.toFixed(6)}, {cursor.lng.toFixed(6)}
        </div>
      )}
    </div>
  );
}
