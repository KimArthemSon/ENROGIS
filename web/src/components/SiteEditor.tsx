import { useEffect, useState } from "react";
import { distanceMeters, formatDistance, isSelfIntersecting, toDMS, type LatLng } from "../lib/geo";
import { parseCoordinateText, SITE_COLORS, siteStats, STATUSES, type Site } from "../lib/sites";
import type { MapMode } from "./MapView";
import { Icon } from "./Icon";

type Props = {
  site: Site;
  mode: MapMode;
  onModeChange: (m: MapMode) => void;
  onChange: (patch: Partial<Site>) => void;
  onClose: () => void;
  onZoom: () => void;
  onDelete: () => void;
  onExportPdf: () => void;
  onExportExcel: () => void;
  busy: boolean;
};

export default function SiteEditor({ site, mode, onModeChange, onChange, onClose, onZoom, onDelete, onExportPdf, onExportExcel, busy }: Props) {
  const st = siteStats(site);
  const [newLat, setNewLat] = useState("");
  const [newLng, setNewLng] = useState("");
  const [paste, setPaste] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const crossing = isSelfIntersecting(site.points);

  const setPoints = (points: LatLng[]) => onChange({ points });

  const addPoint = () => {
    const lat = parseFloat(newLat);
    const lng = parseFloat(newLng);
    if (isNaN(lat) || isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return;
    setPoints([...site.points, { latitude: lat, longitude: lng }]);
    setNewLat("");
    setNewLng("");
  };

  const applyPaste = (replace: boolean) => {
    const pts = parseCoordinateText(paste);
    if (pts.length === 0) return;
    setPoints(replace ? pts : [...site.points, ...pts]);
    setPaste("");
    setShowPaste(false);
  };

  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= site.points.length) return;
    const next = [...site.points];
    [next[i], next[j]] = [next[j], next[i]];
    setPoints(next);
  };

  const modeBtn = (m: MapMode, label: string, icon: string, hint: string) => (
    <button
      onClick={() => onModeChange(mode === m ? "view" : m)}
      title={hint}
      className={`flex flex-1 flex-col items-center gap-1 rounded-xl border px-2 py-2 text-[11px] font-semibold transition ${
        mode === m ? "border-forest-600 bg-forest-600 text-white shadow" : "border-slate-200 bg-white text-slate-600 hover:border-forest-500 hover:text-forest-700"
      }`}
    >
      <Icon name={icon} className="h-4 w-4" />
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Title row */}
      <div className="flex items-center gap-2">
        <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" title="Back to list">
          <Icon name="back" className="h-5 w-5" />
        </button>
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: site.color }} />
        <h2 className="min-w-0 flex-1 truncate text-lg font-extrabold text-slate-900">{site.name || "Untitled site"}</h2>
        <button onClick={onZoom} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" title="Zoom to site">
          <Icon name="target" className="h-5 w-5" />
        </button>
        <button onClick={onDelete} className="rounded-lg p-1.5 text-red-500 hover:bg-red-50" title="Delete site">
          <Icon name="trash" className="h-5 w-5" />
        </button>
      </div>

      {/* Size */}
      <div className="rounded-2xl bg-forest-700 p-4 text-white shadow-inner">
        <p className="text-[10px] font-bold uppercase tracking-widest text-teal-brand">Polygon size · geodesic</p>
        {site.points.length >= 3 ? (
          <>
            <p className="mt-1 text-3xl font-black">{st.hectares.toFixed(4)} <span className="text-lg font-bold">ha</span></p>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center text-[11px]">
              <Stat label="Area" value={`${Math.round(st.areaSqm).toLocaleString()} m²`} />
              <Stat label="Perimeter" value={formatDistance(st.perimeter)} />
              <Stat label="Vertices" value={String(site.points.length)} />
            </div>
          </>
        ) : (
          <p className="mt-1 text-sm text-white/80">Add at least 3 points to compute the area.</p>
        )}
      </div>

      {crossing && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          ⚠ Boundary lines cross each other. Reorder the points so they go around the edge in sequence.
        </p>
      )}

      {/* Map tools */}
      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Edit on map</p>
        <div className="flex gap-2">
          {modeBtn("edit", "Drag vertices", "vertices", "Drag points to adjust. Drag a middle handle to add a point. Right-click a point to remove it.")}
          {modeBtn("addPoint", "Click to add", "plus-pin", "Click the map to append points to this site")}
          {modeBtn("move", "Move shape", "move", "Drag the whole polygon")}
        </div>
        {mode === "edit" && (
          <p className="mt-2 text-[11px] leading-snug text-slate-500">
            Drag a white handle to move a point · drag a faded middle handle to insert a point · right-click a handle to delete it.
          </p>
        )}
        {mode === "addPoint" && <p className="mt-2 text-[11px] text-slate-500">Click on the map to add points in order. Press the button again to stop.</p>}
      </div>

      {/* Details */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Site name" className="col-span-2">
          <input className="input" value={site.name} onChange={(e) => onChange({ name: e.target.value })} />
        </Field>
        <Field label="Reference no.">
          <input className="input" value={site.refNo} onChange={(e) => onChange({ refNo: e.target.value })} />
        </Field>
        <Field label="Status">
          <select className="input" value={site.status} onChange={(e) => onChange({ status: e.target.value as Site["status"] })}>
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Reforestation area">
          <input className="input" value={site.reforestationArea} onChange={(e) => onChange({ reforestationArea: e.target.value })} />
        </Field>
        <Field label="Barangay">
          <input className="input" value={site.barangay} onChange={(e) => onChange({ barangay: e.target.value })} />
        </Field>
        <Field label="Remarks" className="col-span-2">
          <textarea className="input min-h-16" value={site.remarks} onChange={(e) => onChange({ remarks: e.target.value })} />
        </Field>
        <Field label="Color" className="col-span-2">
          <div className="flex gap-2">
            {SITE_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => onChange({ color: c })}
                className={`h-7 w-7 rounded-full border-2 ${site.color === c ? "border-slate-900 ring-2 ring-white" : "border-white"} shadow`}
                style={{ background: c }}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>
        </Field>
      </div>

      {/* Coordinates */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Boundary coordinates (WGS 84)</p>
          <button onClick={() => setShowPaste((v) => !v)} className="text-xs font-semibold text-forest-600 hover:underline">
            {showPaste ? "Close" : "Paste list"}
          </button>
        </div>

        {showPaste && (
          <div className="mb-3 rounded-xl border border-dashed border-forest-200 bg-forest-50 p-3">
            <p className="mb-1 text-[11px] text-slate-600">One point per line: <code>latitude, longitude</code> (copied from Excel works too).</p>
            <textarea
              className="input min-h-24 font-mono text-xs"
              placeholder={"11.095594, 124.710275\n11.095662, 124.710139\n11.095677, 124.710107"}
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
            />
            <div className="mt-2 flex gap-2">
              <button className="btn-secondary flex-1" onClick={() => applyPaste(false)}>Append ({parseCoordinateText(paste).length})</button>
              <button className="btn-primary flex-1" onClick={() => applyPaste(true)}>Replace all</button>
            </div>
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-xs">
            <thead className="bg-forest-600 text-white">
              <tr>
                <th className="w-8 py-2">#</th>
                <th className="py-2 text-left">Latitude</th>
                <th className="py-2 text-left">Longitude</th>
                <th className="w-16" />
              </tr>
            </thead>
            <tbody>
              {site.points.map((p, i) => (
                <tr key={i} className="border-t border-slate-100 odd:bg-white even:bg-slate-50/60">
                  <td className="text-center font-bold" style={{ color: site.color }}>{i + 1}</td>
                  <td className="py-1 pr-1">
                    <CoordInput value={p.latitude} max={90} onCommit={(v) => setPoints(site.points.map((q, k) => (k === i ? { ...q, latitude: v } : q)))} />
                    <p className="pl-1.5 text-[9.5px] text-slate-400">{toDMS(p.latitude, true)}</p>
                  </td>
                  <td className="py-1 pr-1">
                    <CoordInput value={p.longitude} max={180} onCommit={(v) => setPoints(site.points.map((q, k) => (k === i ? { ...q, longitude: v } : q)))} />
                    <p className="pl-1.5 text-[9.5px] text-slate-400">
                      {toDMS(p.longitude, false)}
                      {i > 0 && <span className="ml-1 text-forest-600">· {formatDistance(distanceMeters(site.points[i - 1], p))}</span>}
                    </p>
                  </td>
                  <td className="pr-1">
                    <div className="flex items-center justify-end">
                      <button className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} title="Move up">▲</button>
                      <button className="icon-btn" disabled={i === site.points.length - 1} onClick={() => move(i, 1)} title="Move down">▼</button>
                      <button className="icon-btn text-red-500" onClick={() => setPoints(site.points.filter((_, k) => k !== i))} title="Remove">✕</button>
                    </div>
                  </td>
                </tr>
              ))}
              <tr className="border-t border-slate-200 bg-forest-50">
                <td className="text-center text-forest-600">+</td>
                <td className="py-1.5 pr-1">
                  <input className="input-sm" placeholder="Latitude" value={newLat} onChange={(e) => setNewLat(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addPoint()} />
                </td>
                <td className="py-1.5 pr-1">
                  <input className="input-sm" placeholder="Longitude" value={newLng} onChange={(e) => setNewLng(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addPoint()} />
                </td>
                <td className="pr-1">
                  <button className="btn-primary w-full !px-2 !py-1.5 text-[11px]" onClick={addPoint}>Add</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Export */}
      <div className="grid grid-cols-2 gap-2">
        <button className="btn-secondary" disabled={busy || site.points.length === 0} onClick={onExportExcel}>
          <Icon name="table" className="h-4 w-4" /> Excel
        </button>
        <button className="btn-primary" disabled={busy || site.points.length === 0} onClick={onExportPdf}>
          <Icon name="file" className="h-4 w-4" /> PDF Report
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/10 px-1 py-1.5">
      <p className="font-bold">{value}</p>
      <p className="text-[10px] text-white/70">{label}</p>
    </div>
  );
}

function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-[11px] font-semibold text-slate-500">{label}</span>
      {children}
    </label>
  );
}

/** Text box for a coordinate that only saves valid numbers (on Enter or leaving the box). */
function CoordInput({ value, max, onCommit }: { value: number; max: number; onCommit: (v: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const v = parseFloat(text);
    if (!isNaN(v) && Math.abs(v) <= max) {
      if (v !== value) onCommit(v);
    } else setText(String(value));
  };
  return (
    <input
      className="input-sm font-mono"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}
