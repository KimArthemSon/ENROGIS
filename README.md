# ENROGIS

Reforestation site boundary mapping for the **City Environment and Natural Resources Office (CENRO), Ormoc City**.

| Folder | What it is | Stack |
| --- | --- | --- |
| [`web/`](web) | One-page map tool: draw, edit and measure site polygons, then export them to Excel, PDF reports or GeoJSON | React · TypeScript · Tailwind CSS · Leaflet · Vite |
| [`mobile/`](mobile) | Offline field app: projects, assessments, GPS polygon recording, geotagged photos | React Native · Expo · TypeScript · SQLite |

Both apps calculate area and perimeter the same way **Google Earth / Google Maps** do: geodesic, on a WGS 84 sphere with R = 6,378,137 m.

## Web

```bash
cd web
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in web/dist
```

Features:
- Satellite, streets and terrain basemaps. "Go to coordinates" and "show my location".
- Make several polygons: **draw** on the map, **type** coordinates, or **paste** a list from Excel or a GPS.
- **Drag vertices** to adjust a shape, insert points from the middle handles, right-click to delete a point, **click to add** points, or **move** the whole shape.
- Live size: hectares, m², perimeter, and the length of each edge.
- **Export:** Excel (summary + coordinates with DMS), a **PDF Site Survey Report**, and GeoJSON. Import GeoJSON.
- Auto-saves in the browser (localStorage).

## Mobile

```bash
cd mobile
npm install
npx expo start     # scan the QR code with Expo Go
```

See [`mobile/README.md`](mobile/README.md) for offline notes and building an APK.
