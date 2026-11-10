import { useEffect, useMemo, useRef, useState } from "react";
import logo from "./assets/logo.png";
import MapView, { type MapMode } from "./components/MapView";
import SiteEditor from "./components/SiteEditor";
import { Icon } from "./components/Icon";
import type { LatLng } from "./lib/geo";
import {
  downloadBlob, fromGeoJSON, loadSites, newSite, saveSites, siteStats, toGeoJSON, type Site,
} from "./lib/sites";

const REPO_URL = "https://github.com/KimArthemSon/ENROGIS";
// Direct download of the latest Android build (GitHub release tag "ENRO").
const APK_URL = `${REPO_URL}/releases/download/ENRO/ERNOGIS.apk`;
const YEAR = new Date().getFullYear();

type Toast = { kind: "ok" | "err"; text: string } | null;

export default function App() {
  const [sites, setSites] = useState<Site[]>(() => loadSites());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<MapMode>("view");
  const [focus, setFocus] = useState<{ id: string; nonce: number } | null>(null);
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number; nonce: number } | null>(null);
  const [query, setQuery] = useState("");
  const [gotoText, setGotoText] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const selected = sites.find((s) => s.id === selectedId) ?? null;

  function notify(kind: "ok" | "err", text: string) {
    window.clearTimeout(toastTimer.current);
    setToast({ kind, text });
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }

  // Auto-save to localStorage on every change.
  useEffect(() => {
    if (saveSites(sites)) setSavedAt(new Date());
    else notify("err", "Could not save to browser storage (storage full or blocked).");
  }, [sites]);

  /** Select a site (or none) and leave any edit tool that belonged to the previous one. */
  const selectSite = (id: string | null) => {
    setSelectedId(id);
    setMode((m) => (m === "draw" ? m : "view"));
  };

  const updateSite = (id: string, patch: Partial<Site>) =>
    setSites((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch, updatedAt: new Date().toISOString() } : s)));

  const createSite = (points: LatLng[]) => {
    const site = newSite(sites, points);
    setSites((prev) => [...prev, site]);
    setSelectedId(site.id);
    setMode("view");
    notify("ok", points.length ? `${site.name} created — ${siteStats(site).hectares.toFixed(4)} ha` : `${site.name} created. Add coordinates below.`);
    return site;
  };

  const deleteSite = (s: Site) => {
    if (!confirm(`Delete "${s.name}" (${s.refNo})? This cannot be undone.`)) return;
    setSites((prev) => prev.filter((x) => x.id !== s.id));
    if (selectedId === s.id) selectSite(null);
  };

  const zoomTo = (id: string) => setFocus({ id, nonce: Date.now() });

  const runExport = async (kind: "pdf" | "xlsx", list: Site[]) => {
    const usable = list.filter((s) => s.points.length > 0);
    if (usable.length === 0) return notify("err", "No sites with coordinates to export.");
    setBusy(true);
    try {
      if (kind === "pdf") {
        const { exportSitesToPdf } = await import("./lib/exportPdf");
        await exportSitesToPdf(usable);
      } else {
        const { exportSitesToExcel } = await import("./lib/exportExcel");
        await exportSitesToExcel(usable);
      }
      notify("ok", `${kind === "pdf" ? "PDF report" : "Excel file"} downloaded.`);
    } catch (e) {
      console.error(e);
      notify("err", "Export failed. See the browser console for details.");
    } finally {
      setBusy(false);
    }
  };

  const exportGeoJSON = () => {
    const blob = new Blob([JSON.stringify(toGeoJSON(sites), null, 2)], { type: "application/geo+json" });
    downloadBlob(blob, `ENROGIS_Sites_${new Date().toISOString().slice(0, 10)}.geojson`);
  };

  const importGeoJSON = async (file: File) => {
    try {
      const added = fromGeoJSON(JSON.parse(await file.text()), sites);
      if (added.length === 0) return notify("err", "No polygons found in that file.");
      setSites((prev) => [...prev, ...added]);
      notify("ok", `Imported ${added.length} polygon(s).`);
      zoomTo(added[0].id);
    } catch {
      notify("err", "That file is not valid GeoJSON.");
    }
  };

  const goTo = () => {
    const [lat, lng] = gotoText.split(/[\s,]+/).map(Number);
    if (isNaN(lat) || isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return notify("err", "Enter coordinates like 11.0956, 124.7101");
    setFlyTo({ lat, lng, nonce: Date.now() });
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? sites.filter((s) => [s.name, s.refNo, s.barangay, s.reforestationArea].some((v) => v.toLowerCase().includes(q))) : sites;
  }, [sites, query]);

  const totalHa = sites.reduce((a, s) => a + siteStats(s).hectares, 0);

  return (
    <div className="min-h-screen">
      {/* ---------- Header ---------- */}
      <header className="sticky top-0 z-[1000] border-b border-forest-800 bg-forest-700 text-white shadow-md">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-3 px-4">
          <img src={logo} alt="ENRO Ormoc logo" className="h-11 w-11 rounded-full bg-white p-0.5 shadow" />
          <div className="leading-tight">
            <p className="text-lg font-black tracking-wider">ENROGIS</p>
            <p className="hidden text-[11px] text-white/75 sm:block">City Environment & Natural Resources Office · Ormoc City</p>
          </div>
          <nav className="ml-auto flex items-center gap-1 text-sm font-semibold">
            <a href="#map" className="rounded-lg px-3 py-2 hover:bg-white/10">Map</a>
            <a href="#mobile" className="rounded-lg px-3 py-2 hover:bg-white/10">Mobile App</a>
            <a href="#guide" className="hidden rounded-lg px-3 py-2 hover:bg-white/10 sm:block">Guide</a>
            <a href={REPO_URL} target="_blank" rel="noreferrer" className="rounded-lg p-2 hover:bg-white/10" title="GitHub">
              <Icon name="github" />
            </a>
          </nav>
        </div>
      </header>

      {/* ---------- Map workspace ---------- */}
      <section id="map" className="flex flex-col-reverse lg:h-[calc(100vh-4rem)] lg:min-h-[640px] lg:flex-row">
        <aside className="flex w-full flex-col border-r border-slate-200 bg-white lg:w-[420px] lg:shrink-0">
          <div className="flex-1 overflow-y-auto p-4">
            {selected ? (
              <SiteEditor
                site={selected}
                mode={mode}
                busy={busy}
                onModeChange={setMode}
                onChange={(patch) => updateSite(selected.id, patch)}
                onClose={() => selectSite(null)}
                onZoom={() => zoomTo(selected.id)}
                onDelete={() => deleteSite(selected)}
                onExportPdf={() => runExport("pdf", [selected])}
                onExportExcel={() => runExport("xlsx", [selected])}
              />
            ) : (
              <div className="flex flex-col gap-4">
                {/* Create */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    className={`flex flex-col items-center gap-1 rounded-2xl border-2 p-3 text-sm font-bold transition ${
                      mode === "draw" ? "border-teal-brand bg-teal-brand text-white" : "border-forest-600 bg-forest-600 text-white hover:bg-forest-700"
                    }`}
                    onClick={() => setMode(mode === "draw" ? "view" : "draw")}
                  >
                    <Icon name="draw" className="h-6 w-6" />
                    {mode === "draw" ? "Drawing… (Esc to cancel)" : "Draw polygon"}
                  </button>
                  <button
                    className="flex flex-col items-center gap-1 rounded-2xl border-2 border-forest-600 bg-white p-3 text-sm font-bold text-forest-700 hover:bg-forest-50"
                    onClick={() => createSite([])}
                  >
                    <Icon name="keyboard" className="h-6 w-6" />
                    Enter coordinates
                  </button>
                </div>
                {mode === "draw" && (
                  <p className="-mt-2 rounded-lg bg-teal-brand/10 px-3 py-2 text-xs text-forest-800">
                    Click on the map to place each corner. Click the first point (or double-click) to finish.
                  </p>
                )}

                {/* Totals */}
                <div className="grid grid-cols-3 gap-2 rounded-2xl bg-forest-50 p-3 text-center">
                  <Total label="Sites" value={String(sites.length)} />
                  <Total label="Hectares" value={totalHa.toFixed(2)} />
                  <Total label="Vertices" value={String(sites.reduce((a, s) => a + s.points.length, 0))} />
                </div>

                {/* Go to coordinates */}
                <div className="flex gap-2">
                  <input
                    className="input"
                    placeholder="Go to: 11.0956, 124.7101"
                    value={gotoText}
                    onChange={(e) => setGotoText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && goTo()}
                  />
                  <button className="btn-secondary !px-3" onClick={goTo} title="Fly to coordinates">
                    <Icon name="target" className="h-4 w-4" />
                  </button>
                </div>

                {/* List */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Polygons</p>
                    {sites.length > 3 && (
                      <div className="relative w-40">
                        <Icon name="search" className="absolute left-2 top-1.5 h-3.5 w-3.5 text-slate-400" />
                        <input className="input-sm !pl-7" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
                      </div>
                    )}
                  </div>
                  {sites.length === 0 ? (
                    <div className="rounded-2xl border-2 border-dashed border-slate-200 p-6 text-center">
                      <Icon name="polygon" className="mx-auto h-10 w-10 text-forest-200" />
                      <p className="mt-2 font-bold text-slate-700">No polygons yet</p>
                      <p className="mt-1 text-xs text-slate-500">Draw on the map, enter coordinates, or import a GeoJSON file.</p>
                    </div>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {filtered.map((s) => {
                        const st = siteStats(s);
                        return (
                          <li
                            key={s.id}
                            className="group flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 transition hover:border-forest-500 hover:shadow-sm"
                            onClick={() => {
                              selectSite(s.id);
                              zoomTo(s.id);
                            }}
                          >
                            <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ background: s.color }} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-bold text-slate-900">{s.name}</p>
                              <p className="truncate text-[11px] text-slate-500">
                                {s.refNo}
                                {s.barangay ? ` · Brgy. ${s.barangay}` : ""} · {s.status}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-black text-forest-700">{st.hectares.toFixed(4)}</p>
                              <p className="text-[10px] text-slate-400">ha · {s.points.length} pts</p>
                            </div>
                            <button
                              className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                              title={s.visible ? "Hide on map" : "Show on map"}
                              onClick={(e) => {
                                e.stopPropagation();
                                updateSite(s.id, { visible: !s.visible });
                              }}
                            >
                              <Icon name={s.visible ? "eye" : "eye-off"} className="h-4 w-4" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Bottom bar: export all / import */}
          {!selected && (
            <div className="border-t border-slate-200 bg-slate-50 p-3">
              <div className="grid grid-cols-2 gap-2">
                <button className="btn-secondary !py-2 text-xs" disabled={busy || !sites.length} onClick={() => runExport("xlsx", sites)}>
                  <Icon name="table" className="h-4 w-4" /> Export all · Excel
                </button>
                <button className="btn-primary !py-2 text-xs" disabled={busy || !sites.length} onClick={() => runExport("pdf", sites)}>
                  <Icon name="file" className="h-4 w-4" /> Export all · PDF
                </button>
                <button className="btn-secondary !py-2 text-xs" disabled={!sites.length} onClick={exportGeoJSON}>
                  <Icon name="download" className="h-4 w-4" /> GeoJSON
                </button>
                <button className="btn-secondary !py-2 text-xs" onClick={() => fileInput.current?.click()}>
                  <Icon name="upload" className="h-4 w-4" /> Import
                </button>
              </div>
              <input
                ref={fileInput}
                type="file"
                accept=".geojson,.json,application/geo+json,application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) importGeoJSON(f);
                  e.target.value = "";
                }}
              />
              <p className="mt-2 flex items-center justify-center gap-1 text-[10.5px] text-slate-500">
                <Icon name="check" className="h-3 w-3 text-leaf" />
                Auto-saved in this browser{savedAt ? ` · ${savedAt.toLocaleTimeString()}` : ""}
              </p>
            </div>
          )}
        </aside>

        <div className="relative h-[65vh] shrink-0 lg:h-auto lg:flex-1">
          <MapView
            sites={sites}
            selectedId={selectedId}
            mode={mode}
            focus={focus}
            flyTo={flyTo}
            onSelect={selectSite}
            onCreate={createSite}
            onChangePoints={(id, points) => updateSite(id, { points })}
            onAddPoint={(p) => selected && updateSite(selected.id, { points: [...selected.points, p] })}
            onModeChange={setMode}
          />
          {mode !== "view" && (
            <div className="pointer-events-none absolute left-1/2 top-3 z-[600] -translate-x-1/2 rounded-full bg-forest-800/90 px-4 py-2 text-xs font-semibold text-white shadow-lg">
              {mode === "draw" && "Draw mode — click corners, click the first point to finish"}
              {mode === "edit" && "Editing vertices — drag handles to adjust"}
              {mode === "addPoint" && "Click the map to add points"}
              {mode === "move" && "Drag the polygon to move it"}
            </div>
          )}
        </div>
      </section>

      {/* ---------- Mobile app ---------- */}
      <section id="mobile" className="relative overflow-hidden bg-forest-700 text-white">
        <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-teal-brand/15" />
        <div className="absolute -bottom-20 -left-16 h-60 w-60 rounded-full bg-leaf/15" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-6 py-16 md:grid-cols-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-brand">ENROGIS Mobile</p>
            <h2 className="mt-2 text-3xl font-black leading-tight md:text-4xl">Record boundaries in the field — even without signal.</h2>
            <p className="mt-4 text-white/80">
              The ENROGIS mobile app works fully offline. Walk the site boundary and record GPS corners, see the polygon size
              instantly, and take geotagged photos that are saved straight to your phone.
            </p>
            <ul className="mt-6 grid gap-2 text-sm">
              {[
                "Projects and assessments stored on the phone (SQLite)",
                "GPS polygon recording with live hectare & perimeter",
                "Satellite map with numbered boundary points",
                "Geotagged photos saved to your gallery",
                "GeoJSON export/import to sync with this web map",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-teal-brand text-forest-900">
                    <Icon name="check" className="h-3 w-3" />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href={APK_URL} download rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 font-bold text-forest-700 shadow-lg hover:bg-forest-50">
                <Icon name="download" className="h-5 w-5" /> Download Android app
              </a>
              <a href={`${REPO_URL}/tree/main/mobile`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-white/40 px-5 py-3 font-bold hover:bg-white/10">
                <Icon name="github" className="h-5 w-5" /> Source code
              </a>
            </div>
          </div>

          {/* Phone mock */}
          <div className="mx-auto w-64 rounded-[2.5rem] border-[10px] border-forest-900 bg-slate-50 shadow-2xl">
            <div className="rounded-t-[1.8rem] bg-forest-700 px-4 pb-6 pt-5 text-white">
              <div className="flex items-center gap-2">
                <img src={logo} alt="" className="h-9 w-9 rounded-full bg-white p-0.5" />
                <div>
                  <p className="text-sm font-black tracking-wider">ENROGIS</p>
                  <p className="text-[9px] text-white/70">ENRO · Ormoc City</p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 rounded-xl bg-white/10 py-2 text-center">
                <Mini v="3" l="Projects" />
                <Mini v="10" l="Assess." />
                <Mini v="7.49" l="Hectares" />
              </div>
            </div>
            <div className="space-y-2 p-3">
              {["Janagdan Reforestation", "Cabintan Watershed", "Mangrove Rehab"].map((n, i) => (
                <div key={n} className="rounded-xl bg-white p-2.5 shadow-sm">
                  <p className="text-[11px] font-bold text-slate-800">{n}</p>
                  <p className="text-[9px] text-forest-600">{[3, 5, 2][i]} assessments · {[2.31, 4.06, 1.12][i]} ha</p>
                </div>
              ))}
              <div className="ml-auto w-fit rounded-full bg-forest-700 px-3 py-1.5 text-[10px] font-bold text-white">+ New Project</div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Guide ---------- */}
      <section id="guide" className="mx-auto max-w-6xl px-6 py-14">
        <h2 className="text-2xl font-black text-slate-900">How to use the map</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["draw", "Draw", "Press “Draw polygon” and click each corner on the map. Click the first point to close it."],
            ["keyboard", "Type or paste", "Use “Enter coordinates”, then type points or paste a list copied from Excel or a GPS."],
            ["vertices", "Adjust", "Select a site and use “Drag vertices” to move, insert or delete corners. Size updates live."],
            ["file", "Export", "Download a PDF Site Survey Report, an Excel sheet of coordinates, or a GeoJSON backup."],
          ].map(([icon, title, text]) => (
            <div key={title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-forest-50 text-forest-700">
                <Icon name={icon} className="h-6 w-6" />
              </span>
              <p className="mt-3 font-bold text-slate-900">{title}</p>
              <p className="mt-1 text-sm text-slate-600">{text}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 text-xs text-slate-500">
          Area and perimeter are geodesic (WGS 84 sphere, R = 6,378,137 m) — the same method Google Earth and Google Maps use.
          Polygons are saved in this browser only; use GeoJSON export to back them up or move them to another computer. GeoJSON files exported from the ENROGIS mobile app can be imported here, and the other way around.
        </p>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-6 py-6 text-center text-xs text-slate-500 sm:flex-row sm:justify-between sm:text-left">
          <div className="flex items-center gap-2">
            <img src={logo} alt="" className="h-7 w-7" />
            <span>ENROGIS · City Environment and Natural Resources Office, Ormoc City</span>
          </div>
          <span>© {YEAR} City Government of Ormoc</span>
        </div>
      </footer>

      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 z-[2000] -translate-x-1/2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-xl ${
            toast.kind === "ok" ? "bg-forest-700" : "bg-red-600"
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-lg font-black text-forest-700">{value}</p>
      <p className="text-[10.5px] font-semibold text-slate-500">{label}</p>
    </div>
  );
}

function Mini({ v, l }: { v: string; l: string }) {
  return (
    <div>
      <p className="text-xs font-black">{v}</p>
      <p className="text-[8px] text-white/70">{l}</p>
    </div>
  );
}
