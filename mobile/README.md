# ENROGIS

Offline field app for reforestation sites. Record project boundaries as GPS polygons,
see them on a map with their size, and take geotagged photos. Everything is stored on
the phone in SQLite. No internet or server is needed.

## Features

- **Projects** – create, edit, delete, search. Shows the number of assessments and total area.
- **Assessments** (inside a project) – title, remarks, location context, assessment GPS location.
- **Boundary polygon** – add points by GPS, by typing coordinates, or by tapping the map.
  Reorder, edit and delete points. Warnings for too few points, points very close together,
  and lines that cross each other.
- **Size** – area (ha and m²) and perimeter, using the same geodesic formula as Google Maps /
  Google Earth (sphere with radius 6,378,137 m).
- **Map** – preview in the form, plus a full-screen map with satellite/hybrid/terrain layers,
  numbered vertices, the area label in the middle of the polygon, and photo pins.
- **Geotagged photos** – the camera writes GPS into the photo's EXIF. Every photo you keep is
  saved to the phone's Gallery in an **ENROGIS** album (a private copy stays in the app too).
  Tap a photo to **Save to Device** again or **Share** it (Drive, Files, Messenger…), or use
  **Save all to device** for any that weren't saved yet. A green ✓ on a thumbnail means it's on the device.

> `.npmrc` sets `legacy-peer-deps=true` to get past a web-only `react-dom` peer-version
> mismatch in expo-router. It doesn't affect the phone app.

## Run it

```bash
npm install
npx expo start
```

Scan the QR code with **Expo Go** on your phone. All modules used are included in Expo Go.

For a standalone APK (needed for a real install, and recommended for gallery saving on Android):

```bash
npx eas-cli@latest build -p android --profile preview
```

## Offline notes

- GPS, the database, the camera and saving photos all work without internet.
- **Map tiles need internet** the first time an area is viewed. Google Maps caches recently viewed
  tiles, so open the site on the map once while online before going to the field. The polygon,
  points and size label still draw without tiles.
- The yellow/red "GPS" banner shows how fresh the phone's last GPS fix is. If it says *cold*,
  stand in the open for a minute before recording points.

## Google Maps key (release builds only)

Expo Go needs no key. For an Android release build, add a Maps SDK for Android key in `app.json`:

```json
["react-native-maps", { "androidGoogleMapsApiKey": "YOUR_KEY" }]
```

## Project layout

```
src/app/                       screens (Expo Router)
  index.tsx                    project list
  project/[projectId].tsx      project details + its assessments
  assessment/[assessmentId].tsx  assessment form ("new" creates one)
src/components/                camera, map, modals, shared UI
src/db/schema.ts               SQLite tables and migrations
src/db/repo.ts                 all database reads/writes
src/lib/geo.ts                 area, perimeter, distance, self-intersection
src/lib/gps.ts                 offline GPS fix with fallback
src/lib/photos.ts              app storage + gallery saving + EXIF tags
```
