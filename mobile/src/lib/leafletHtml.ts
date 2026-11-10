import { LEAFLET_CSS, LEAFLET_JS } from "./leafletBundle";

/**
 * A self-contained Leaflet page for the in-app WebView. No Google key needed:
 * imagery comes from Esri World Imagery (same as the ENROGIS web map).
 *
 * React Native → page:  window.__set(state)
 * Page → React Native:  { type: "ready" } | { type: "tap", lat, lng }
 */
export function buildMapHtml(compact: boolean) {
  return `<!doctype html>
<html><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<style>${LEAFLET_CSS}</style>
<style>
  html, body, #map { margin: 0; padding: 0; height: 100%; width: 100%; background: #cbd5e1; }
  .leaflet-control-attribution { font-size: 9px; }
  .vtx { width: 22px; height: 22px; border-radius: 11px; background: #0E8A6C; border: 2px solid #fff;
         color: #fff; font: 800 11px/18px system-ui, sans-serif; text-align: center; box-sizing: border-box;
         box-shadow: 0 1px 3px rgba(0,0,0,.4); }
  .photo { width: 18px; height: 18px; border-radius: 9px; background: #0393D6; border: 2px solid #fff;
           box-sizing: border-box; box-shadow: 0 1px 3px rgba(0,0,0,.4); }
  .site { width: 16px; height: 16px; border-radius: 8px; background: #0B5D45; border: 3px solid #FACC15; box-sizing: border-box; }
  .me { width: 16px; height: 16px; border-radius: 8px; background: #2563eb; border: 3px solid #fff; box-sizing: border-box;
        box-shadow: 0 0 0 6px rgba(37,99,235,.25); }
  .area { transform: translate(-50%, -50%); display: inline-block; white-space: nowrap; background: rgba(15,23,42,.85);
          color: #FACC15; border: 1px solid #FACC15; border-radius: 8px; padding: 4px 9px;
          font: 800 13px system-ui, sans-serif; }
  .edge { transform: translate(-50%, -50%); display: inline-block; white-space: nowrap; background: rgba(255,255,255,.92);
          color: #0B5D45; border-radius: 6px; padding: 1px 5px; font: 700 10px system-ui, sans-serif; }
</style>
</head><body>
<div id="map"></div>
<script>${LEAFLET_JS}</script>
<script>
(function () {
  var COMPACT = ${compact ? "true" : "false"};
  var post = function (m) { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(m)); };

  var map = L.map("map", {
    zoomControl: !COMPACT, attributionControl: true, dragging: !COMPACT, touchZoom: !COMPACT,
    doubleClickZoom: !COMPACT, scrollWheelZoom: false, boxZoom: false, keyboard: false, maxZoom: 21,
  }).setView([11.0064, 124.6075], 12);
  if (!COMPACT) { map.zoomControl.setPosition("bottomright"); L.control.scale({ imperial: false, position: "bottomleft" }).addTo(map); }

  var esri = "https://server.arcgisonline.com/ArcGIS/rest/services/";
  var opt = { maxZoom: 21, maxNativeZoom: 18 };
  function imagery() { return L.tileLayer(esri + "World_Imagery/MapServer/tile/{z}/{y}/{x}", Object.assign({ attribution: "Esri, Maxar" }, opt)); }
  var layers = {
    hybrid: L.layerGroup([imagery(), L.tileLayer(esri + "Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", opt)]),
    satellite: imagery(),
    standard: L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 21, maxNativeZoom: 19, attribution: "© OpenStreetMap" }),
    terrain: L.tileLayer("https://tile.opentopomap.org/{z}/{x}/{y}.png", { maxZoom: 21, maxNativeZoom: 17, attribution: "© OpenTopoMap" }),
  };
  var currentLayer = null;
  var shapes = L.featureGroup().addTo(map);
  var meLayer = L.layerGroup().addTo(map);
  var addMode = false;
  var first = true;

  function icon(cls, html, size) { return L.divIcon({ className: "", html: '<div class="' + cls + '">' + (html || "") + "</div>", iconSize: size, iconAnchor: size ? [size[0] / 2, size[1] / 2] : undefined }); }

  window.__set = function (s) {
    // Base layer
    var next = layers[s.layer] || layers.hybrid;
    if (next !== currentLayer) { if (currentLayer) map.removeLayer(currentLayer); next.addTo(map); currentLayer = next; }
    addMode = !!s.addMode;
    map.getContainer().style.cursor = addMode ? "crosshair" : "";

    // Shapes
    shapes.clearLayers();
    var pts = (s.points || []).map(function (p) { return [p.latitude, p.longitude]; });
    if (pts.length >= 3) L.polygon(pts, { color: "#FACC15", weight: 3, fillColor: "#05C89C", fillOpacity: 0.28, interactive: false }).addTo(shapes);
    else if (pts.length === 2) L.polyline(pts, { color: "#FACC15", weight: 3, dashArray: "6,6", interactive: false }).addTo(shapes);
    (s.edges || []).forEach(function (e) { L.marker([e.lat, e.lng], { icon: L.divIcon({ className: "", html: '<div class="edge">' + e.text + "</div>", iconSize: [0, 0] }), interactive: false }).addTo(shapes); });
    pts.forEach(function (p, i) { L.marker(p, { icon: icon("vtx", String(i + 1), [22, 22]), interactive: false }).addTo(shapes); });
    (s.photos || []).forEach(function (p) { L.marker([p.latitude, p.longitude], { icon: icon("photo", "", [18, 18]), interactive: false }).addTo(shapes); });
    if (s.site) L.marker([s.site.latitude, s.site.longitude], { icon: icon("site", "", [16, 16]), interactive: false }).addTo(shapes);
    if (s.areaLabel && s.center) L.marker([s.center.latitude, s.center.longitude], { icon: L.divIcon({ className: "", html: '<div class="area">' + s.areaLabel + "</div>", iconSize: [0, 0] }), interactive: false }).addTo(shapes);

    // My location
    meLayer.clearLayers();
    if (s.me) {
      if (s.me.accuracy) L.circle([s.me.latitude, s.me.longitude], { radius: s.me.accuracy, color: "#2563eb", weight: 1, fillOpacity: 0.08, interactive: false }).addTo(meLayer);
      L.marker([s.me.latitude, s.me.longitude], { icon: icon("me", "", [16, 16]), interactive: false }).addTo(meLayer);
    }

    if (s.fit || first) fit(s.me);
    first = false;
  };

  function fit(me) {
    var b = shapes.getBounds();
    if (b.isValid()) {
      var sw = b.getSouthWest(), ne = b.getNorthEast();
      if (sw.equals(ne)) map.setView(sw, 18);
      else if (COMPACT) map.fitBounds(b, { padding: [24, 24], maxZoom: 20 });
      // Leave room for the top buttons and the bottom size card in the full-screen map.
      else map.fitBounds(b, { paddingTopLeft: [50, 120], paddingBottomRight: [60, 240], maxZoom: 20 });
    } else if (me) {
      map.setView([me.latitude, me.longitude], 17);
    }
  }
  window.__fit = function () { fit(null); };
  window.__center = function (lat, lng) { map.setView([lat, lng], Math.max(map.getZoom(), 17)); };

  map.on("click", function (e) { if (addMode) post({ type: "tap", lat: e.latlng.lat, lng: e.latlng.lng }); });
  post({ type: "ready" });
})();
</script>
</body></html>`;
}
