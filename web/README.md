# ENROGIS Web

One-page reforestation site mapper (React + TypeScript + Tailwind + Leaflet).

```bash
npm install
npm run dev
npm run build
```

## Code layout

```
src/App.tsx                 page layout: header, map workspace, mobile app section, guide
src/components/MapView.tsx  Leaflet map + Geoman (draw / drag vertices / move / click-to-add)
src/components/SiteEditor.tsx  site details, coordinates table, paste list, per-site export
src/lib/geo.ts              geodesic area, perimeter, distance, DMS (same as the mobile app)
src/lib/sites.ts            site model, localStorage, GeoJSON import/export, coordinate parsing
src/lib/exportExcel.ts      Excel export (ExcelJS)
src/lib/exportPdf.ts        PDF Site Survey Report (jsPDF + autotable)
```

Polygons are stored in the browser's localStorage (`enrogis.sites.v1`). Use **GeoJSON** export
to back them up or move them to another computer.

Map tiles: Esri World Imagery, OpenStreetMap and OpenTopoMap (they need internet).
