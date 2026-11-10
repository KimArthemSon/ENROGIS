# ENROGIS Mobile

Offline field app for reforestation sites. Record project boundaries as GPS polygons,
see them on a map with their size, and take geotagged photos. Everything is stored on
the phone in SQLite. No internet, server or API key is needed.

## Features

- **Projects** – create, edit, delete, search. Shows the number of assessments and total area.
- **Assessments** (inside a project) – title, remarks, assessment GPS location.
- **Boundary polygon** – add points by GPS, by typing coordinates, or by tapping the map.
  Reorder, edit and delete points. Warnings for too few points, points very close together,
  and lines that cross each other.
- **Size** – area (ha and m²) and perimeter, using the same geodesic formula as Google Maps /
  Google Earth (sphere with radius 6,378,137 m).
- **Map** – Leaflet with Esri satellite imagery (same as the web map, **no Google key**). Preview in
  the form, plus a full-screen map with hybrid/satellite/streets/terrain layers, numbered vertices,
  edge lengths, the area label, photo pins, your live location, and tap-to-add points.
- **Geotagged photos** – the camera writes GPS into the photo's EXIF. Every photo you keep is
  saved to the phone's Gallery in an **ENROGIS** album (a private copy stays in the app too).
  Tap a photo to **Save to Device** again or **Share** it, or use **Save all to device**.
- **GeoJSON sync with the web map** – *Export GeoJSON* from the home screen (all projects), a project,
  or a single assessment (header icon). Choose **Share…** (Drive, Messenger, Gmail) or, on Android,
  **Save to folder** (e.g. Downloads). *Import GeoJSON* from the home screen creates projects
  (grouped by each polygon's project / reforestation area), or from a project screen adds the
  polygons as assessments. Ref no., barangay, status and color are kept when files go back and
  forth. Polygons with fewer than 3 points are skipped.

## Run in development

```bash
npm install
npx expo start
```

Scan the QR code with **Expo Go**. All modules used are included in Expo Go.

## Build the Android APK

One-time setup (needs a free Expo account at https://expo.dev):

```bash
npx eas-cli@latest login
npx eas-cli@latest init      # links this app to your Expo account (adds extra.eas.projectId to app.json)
```

Build an installable APK (profile `preview` in `eas.json`):

```bash
npx eas-cli@latest build -p android --profile preview
# or: npm run build:apk
```

The build runs on Expo's servers (about 10–20 minutes). When it finishes you get a link and a
QR code to download the `.apk`. On the phone, allow "Install unknown apps" for your browser/Files app.
Upload it to the GitHub release with tag `ENRO` as **`ERNOGIS.apk`** (replace the old file). The web page's
**Download Android app** button links straight to
https://github.com/KimArthemSon/ENROGIS/releases/download/ENRO/ERNOGIS.apk.

For Google Play, use `--profile production` (builds an `.aab`).

**Before each new release**, raise `version` (e.g. `1.0.1`) and `android.versionCode` (e.g. `2`)
in `app.json` — Android won't install an update with the same or lower versionCode.

## Offline notes

- GPS, the database, the camera, the map engine and saving photos all work without internet.
- **Satellite imagery needs internet** the first time an area is viewed. Viewed tiles are cached,
  so open the site on the map once while online before going to the field. The polygon, points
  and size label always draw, even without imagery.
- The GPS banner shows how fresh the phone's last GPS fix is. If it says *cold*, stand in the
  open for a minute before recording points.

## Notes

- `.npmrc` sets `legacy-peer-deps=true` to get past a web-only `react-dom` peer-version
  mismatch in expo-router. It doesn't affect the phone app (EAS uses it too).
- `src/lib/leafletBundle.ts` is generated from the `leaflet` package so the map works offline.
  Re-run `npm run gen:leaflet` after upgrading Leaflet.

## Project layout

```
src/app/                         screens (Expo Router)
  index.tsx                      project list (+ GeoJSON import / export all)
  project/[projectId].tsx        project details + its assessments (+ GeoJSON)
  assessment/[assessmentId].tsx  assessment form ("new" creates one)
src/components/                  camera, map (WebView + Leaflet), modals, shared UI
src/db/schema.ts                 SQLite tables and migrations
src/db/repo.ts                   all database reads/writes
src/lib/geo.ts                   area, perimeter, distance, self-intersection
src/lib/geojson*.ts              GeoJSON export/import (same format as the web app)
src/lib/leafletHtml.ts           the in-app map page
src/lib/gps.ts                   offline GPS fix with fallback
src/lib/photos.ts                app storage + gallery saving + EXIF tags
```
