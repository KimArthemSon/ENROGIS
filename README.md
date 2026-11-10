# ENROGIS

Reforestation site boundary mapping for the **City Environment and Natural Resources Office (CENRO), Ormoc City**.

ENROGIS has two apps that share one data format (GeoJSON):

| Folder | What it is | Stack |
| --- | --- | --- |
| [`web/`](web) | One-page map tool: draw, edit and measure site polygons, then export them to Excel, PDF reports or GeoJSON | React · TypeScript · Tailwind CSS · Leaflet · Vite |
| [`mobile/`](mobile) | Offline field app: projects, assessments, GPS polygon recording, geotagged photos | React Native · Expo · TypeScript · SQLite · Leaflet |

Both apps calculate area and perimeter the same way **Google Earth / Google Maps** do: geodesic, on a WGS 84 sphere with R = 6,378,137 m.

## Download the Android app

**[Download ERNOGIS.apk](https://github.com/KimArthemSon/ENROGIS/releases/download/ENRO/ERNOGIS.apk)**

The **Download Android app** button on the web page links to the same file.

To install:
1. Open the link on the phone (or copy the `.apk` to it).
2. When Android asks, allow **Install unknown apps** for your browser or Files app.
3. Open the file and tap **Install**. To update, install the new APK over the old one. Your data is kept.

## Typical workflow

1. **In the field (mobile):** create a project, add an assessment, walk the boundary and add a GPS point at each corner. Take geotagged photos.
2. **Export** the project as GeoJSON from the app (Share to Drive / Messenger / Gmail, or save to Downloads).
3. **In the office (web):** *Import GeoJSON*, check and adjust the polygons on satellite imagery, fill in ref no., barangay and status.
4. **Export** a PDF Site Survey Report, an Excel sheet of coordinates, or a GeoJSON backup.
5. GeoJSON edited on the web can be imported back into the mobile app.

## Web app

### Run locally

Needs **Node.js 20+**.

```bash
cd web
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in web/dist
npm run preview    # serve the production build
npm run lint       # oxlint
```

`web/dist` is a static site. Deploy it to any static host (GitHub Pages, Netlify, Vercel, a plain web server).

### Features

- **Basemaps:** satellite (Esri World Imagery), streets (OpenStreetMap) and terrain (OpenTopoMap). "Go to coordinates" and "Show my location".
- **Several polygons (sites)** at once. Each has a name, ref no., reforestation area, barangay, status, remarks and color, and can be hidden.
- **Ways to make a polygon:**
  - **Draw** on the map: click each corner, click the first point to close.
  - **Type** coordinates in the table.
  - **Paste** a list copied from Excel or a GPS (decimal degrees).
- **Editing:** drag vertices, insert points from the middle handles, right-click a point to delete it, click the map to add points, or move the whole shape.
- **Live size:** hectares, m², perimeter and the length of each edge.
- **Statuses:** Pending, Surveyed, Verified, Approved, For Revalidation.
- **Export:**
  - **Excel** – a summary sheet plus coordinates (decimal and DMS) for each site.
  - **PDF** – a Site Survey Report per site.
  - **GeoJSON** – full backup, also used to move data to/from the mobile app.
- **Import GeoJSON** – from ENROGIS, QGIS, Google Earth or other GIS tools.
- **Auto-save** in the browser (`localStorage`, key `enrogis.sites.v1`). Data stays on that computer and browser only, so export GeoJSON to back it up.

See [`web/README.md`](web/README.md) for the code layout.

## Mobile app

### Run in development

```bash
cd mobile
npm install
npx expo start     # scan the QR code with Expo Go
```

### Features (summary)

- Projects → assessments, all stored on the phone in SQLite. Works fully offline.
- Boundary polygon from GPS, typed coordinates, or tapping the map, with warnings for too few points, points too close, and crossing lines.
- Satellite map with numbered vertices, edge lengths, area label, photo pins and live location.
- Geotagged photos saved to an **ENROGIS** album in the gallery.
- GeoJSON export/import, compatible with the web app.

Full details, offline notes and the project layout are in [`mobile/README.md`](mobile/README.md).

### Build and publish a new APK

```bash
cd mobile
npx eas-cli@latest login        # first time only
npm run build:apk               # = eas build -p android --profile preview
```

Then:
1. Raise `version` and `android.versionCode` in `mobile/app.json` **before** building (Android won't install an update with the same or lower `versionCode`).
2. Download the `.apk` from the EAS build page.
3. On GitHub, open the release with tag **`ENRO`** and replace the asset with the new file, keeping the name **`ERNOGIS.apk`**. The web page's download button keeps working with no code change.

If you rename the file or use a different tag, update `APK_URL` in [`web/src/App.tsx`](web/src/App.tsx).

## GeoJSON format

Both apps read and write a `FeatureCollection` of `Polygon` features (coordinates in WGS 84, `[longitude, latitude]`). Properties:

| Property | Meaning |
| --- | --- |
| `name` | Site / assessment name |
| `refNo` | Reference number |
| `reforestationArea` | Project / reforestation area (the mobile app groups polygons into projects by this) |
| `barangay` | Barangay |
| `status` | Pending, Surveyed, Verified, Approved or For Revalidation |
| `remarks` | Free text |
| `color` | Display color (hex) |
| `area_ha` | Area in hectares (computed, for reference) |
| `perimeter_m` | Perimeter in meters (computed, for reference) |

Polygons with fewer than 3 points are skipped on import.

## How area is calculated

Area uses the spherical-excess formula on a sphere of radius 6,378,137 m, and distances use the haversine formula on the same sphere. This matches Google Earth / Google Maps measurements. The code is in [`web/src/lib/geo.ts`](web/src/lib/geo.ts) and [`mobile/src/lib/geo.ts`](mobile/src/lib/geo.ts) (same formulas in both; change them together).

## Repository layout

```
web/       React web map (see web/README.md)
mobile/    Expo / React Native field app (see mobile/README.md)
```
