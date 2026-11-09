import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import logoUrl from "../assets/logo.png";
import { formatDistance, toDMS, type LatLng } from "./geo";
import { downloadBlob, safeFileName, siteStats, type Site } from "./sites";

type RGB = [number, number, number];
const GREEN: RGB = [27, 107, 58];
const GREEN_LIGHT: RGB = [234, 245, 238];
const FILL: RGB = [185, 227, 195];
const GRAY: RGB = [110, 110, 110];
const TEXT: RGB = [30, 30, 30];

const PAGE_W = 210;
const PAGE_H = 297;
const M = 15; // side margin (mm)
const CONTENT_W = PAGE_W - M * 2;

let logoCache: string | null = null;
async function logoDataUrl() {
  if (logoCache) return logoCache;
  const blob = await (await fetch(logoUrl)).blob();
  logoCache = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
  return logoCache;
}

const fmtDate = (d: Date) =>
  d.toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

function drawHeader(doc: jsPDF, logo: string) {
  doc.addImage(logo, "PNG", M, 10, 27, 27);
  const cx = PAGE_W / 2 + 6;
  doc.setTextColor(...TEXT);
  doc.setFont("helvetica", "normal").setFontSize(9.5);
  doc.text("Republic of the Philippines", cx, 15, { align: "center" });
  doc.setFont("helvetica", "bold").setFontSize(10.5);
  doc.text("CITY GOVERNMENT OF ORMOC", cx, 20, { align: "center" });
  doc.setTextColor(...GREEN).setFontSize(12.5);
  doc.text("CITY ENVIRONMENT AND NATURAL RESOURCES OFFICE", cx, 26.5, { align: "center" });
  doc.setFont("helvetica", "bolditalic").setFontSize(10.5);
  doc.text("ENROGIS", cx, 32, { align: "center" });
  doc.setFont("helvetica", "italic").setFontSize(8.5).setTextColor(...GRAY);
  doc.text("Reforestation Site Mapping & GIS System", cx, 36.5, { align: "center" });

  doc.setDrawColor(...GREEN).setLineWidth(1.1).line(M, 41, PAGE_W - M, 41);
  doc.setLineWidth(0.3).line(M, 42.6, PAGE_W - M, 42.6);
}

function sectionTitle(doc: jsPDF, text: string, y: number) {
  doc.setFillColor(...GREEN).rect(M, y - 4.6, 1.6, 6.2, "F");
  doc.setFont("helvetica", "bold").setFontSize(11.5).setTextColor(...GREEN);
  doc.text(text, M + 4.5, y);
  return y + 4;
}

/** Nice round scale bar length (1, 2, 5 × 10ⁿ meters). */
function niceLength(maxMeters: number) {
  const pow = Math.pow(10, Math.floor(Math.log10(maxMeters)));
  for (const m of [5, 2, 1]) if (m * pow <= maxMeters) return m * pow;
  return pow;
}

function drawBoundaryMap(doc: jsPDF, points: LatLng[], x: number, y: number, w: number, h: number) {
  // Frame + light grid
  doc.setFillColor(250, 250, 250).setDrawColor(200, 200, 200).setLineWidth(0.3).rect(x, y, w, h, "FD");
  doc.setDrawColor(232, 232, 232).setLineWidth(0.15);
  for (let gx = x + 10; gx < x + w; gx += 10) doc.line(gx, y, gx, y + h);
  for (let gy = y + 10; gy < y + h; gy += 10) doc.line(x, gy, x + w, gy);

  if (points.length === 0) {
    doc.setFont("helvetica", "italic").setFontSize(10).setTextColor(...GRAY);
    doc.text("No boundary points recorded.", x + w / 2, y + h / 2, { align: "center" });
    return;
  }

  // Local flat projection in meters (fine for site-sized areas).
  const lat0 = points.reduce((a, p) => a + p.latitude, 0) / points.length;
  const lng0 = points.reduce((a, p) => a + p.longitude, 0) / points.length;
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110574;
  const xy = points.map((p) => ({ mx: (p.longitude - lng0) * kx, my: (p.latitude - lat0) * ky }));
  const minX = Math.min(...xy.map((p) => p.mx));
  const maxX = Math.max(...xy.map((p) => p.mx));
  const minY = Math.min(...xy.map((p) => p.my));
  const maxY = Math.max(...xy.map((p) => p.my));
  const pad = 14;
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);
  const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanY); // mm per meter
  const offX = x + (w - spanX * scale) / 2;
  const offY = y + (h - spanY * scale) / 2;
  const pts = xy.map((p) => ({ px: offX + (p.mx - minX) * scale, py: offY + (maxY - p.my) * scale }));

  // Polygon
  if (pts.length >= 2) {
    const deltas = pts.slice(1).map((p, i) => [p.px - pts[i].px, p.py - pts[i].py]);
    doc.setFillColor(...FILL).setDrawColor(...GREEN).setLineWidth(0.7);
    doc.lines(deltas, pts[0].px, pts[0].py, [1, 1], pts.length >= 3 ? "FD" : "S", pts.length >= 3);
  }

  // Numbered vertices
  pts.forEach((p, i) => {
    doc.setFillColor(...GREEN).setDrawColor(255, 255, 255).setLineWidth(0.5).circle(p.px, p.py, 2.3, "FD");
    doc.setFont("helvetica", "bold").setFontSize(6.5).setTextColor(255, 255, 255);
    doc.text(String(i + 1), p.px, p.py + 0.8, { align: "center" });
  });

  // North arrow
  const nx = x + w - 12;
  const ny = y + 8;
  doc.setFillColor(30, 30, 30).setDrawColor(30, 30, 30).setLineWidth(0.3);
  doc.triangle(nx, ny, nx - 2.6, ny + 9, nx, ny + 6.5, "F");
  doc.setFillColor(255, 255, 255);
  doc.triangle(nx, ny, nx + 2.6, ny + 9, nx, ny + 6.5, "FD");
  doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(30, 30, 30);
  doc.text("N", nx, ny + 13.5, { align: "center" });

  // Scale bar
  const meters = niceLength((w * 0.22) / scale);
  const barW = meters * scale;
  const bx = x + 8;
  const by = y + h - 9;
  doc.setDrawColor(30, 30, 30).setLineWidth(0.3);
  doc.setFillColor(30, 30, 30).rect(bx, by, barW / 2, 1.6, "FD");
  doc.setFillColor(255, 255, 255).rect(bx + barW / 2, by, barW / 2, 1.6, "FD");
  doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(30, 30, 30);
  doc.text("0", bx, by - 1.5, { align: "center" });
  doc.text(meters >= 1000 ? `${meters / 1000} km` : `${meters} m`, bx + barW, by - 1.5, { align: "center" });
}

function drawSiteReport(doc: jsPDF, site: Site, logo: string, generated: Date) {
  const st = siteStats(site);
  drawHeader(doc, logo);

  doc.setFont("helvetica", "bold").setFontSize(18).setTextColor(...TEXT);
  doc.text("SITE SURVEY REPORT", PAGE_W / 2, 53, { align: "center" });
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...GRAY);
  doc.text("Reforestation Site Boundary & Assessment Summary", PAGE_W / 2, 58.5, { align: "center" });

  // I. Site information
  let y = sectionTitle(doc, "I. SITE INFORMATION", 69);
  const L = (s: string) => ({ content: s, styles: { fontStyle: "bold" as const, fillColor: GREEN_LIGHT } });
  const body: any[] = [
    [L("Site Name"), site.name || "—", L("Reference No."), site.refNo || "—"],
    [L("Reforestation Area"), site.reforestationArea || "—", L("Barangay"), site.barangay || "—"],
    [L("Total Area"), `${st.hectares.toFixed(4)} hectares\n(${Math.round(st.areaSqm).toLocaleString()} m²)`, L("Perimeter"), formatDistance(st.perimeter)],
    [L("Status"), site.status, L("No. of Vertices"), String(site.points.length)],
    [
      L("Center Point"),
      st.center ? `${st.center.latitude.toFixed(6)}, ${st.center.longitude.toFixed(6)}` : "—",
      L("Date Generated"),
      fmtDate(generated),
    ],
  ];
  if (site.remarks.trim()) body.push([L("Remarks"), { content: site.remarks, colSpan: 3 }]);

  autoTable(doc, {
    startY: y,
    body,
    theme: "grid",
    margin: { left: M, right: M },
    styles: { fontSize: 9, cellPadding: 2.6, textColor: TEXT, lineColor: [220, 220, 220], lineWidth: 0.2, valign: "middle" },
    columnStyles: { 0: { cellWidth: 34 }, 1: { cellWidth: 56 }, 2: { cellWidth: 34 }, 3: { cellWidth: 56 } },
  });
  y = (doc as any).lastAutoTable.finalY + 10;

  // II. Map — shrink it (down to 62 mm) so the coordinates table can stay on the same page.
  const bottom = PAGE_H - 24;
  const ROW_H = 7.6;
  const tableH = 14 + ROW_H * (site.points.length + 1);
  let mapH = Math.min(92, Math.max(62, bottom - (y + 4) - 12 - tableH));
  if (y + 4 + mapH + 12 > bottom) {
    doc.addPage();
    y = 20;
    mapH = 92;
  }
  y = sectionTitle(doc, "II. SITE BOUNDARY MAP", y);
  drawBoundaryMap(doc, site.points, M, y, CONTENT_W, mapH);
  doc.setFont("helvetica", "italic").setFontSize(7.5).setTextColor(...GRAY);
  doc.text("Schematic representation, north-up. Coordinates referenced to WGS 84.", M, y + mapH + 4.5);
  y += mapH + 12;

  // III. Coordinates (start on a new page only if not even the header + 2 rows fit)
  if (y + 4 + ROW_H * 3 > bottom) {
    doc.addPage();
    y = 20;
  }
  y = sectionTitle(doc, "III. BOUNDARY COORDINATES (WGS 84)", y);
  autoTable(doc, {
    startY: y,
    head: [["Point", "Latitude", "Longitude", "Latitude (DMS)", "Longitude (DMS)"]],
    body: site.points.map((p, i) => [
      String(i + 1), p.latitude.toFixed(6), p.longitude.toFixed(6), toDMS(p.latitude, true), toDMS(p.longitude, false),
    ]),
    theme: "grid",
    margin: { left: M, right: M, top: 20, bottom: 24 },
    headStyles: { fillColor: GREEN, textColor: 255, fontStyle: "bold", halign: "center" },
    bodyStyles: { halign: "center", textColor: TEXT },
    alternateRowStyles: { fillColor: [247, 250, 248] },
    styles: { fontSize: 9, cellPadding: 2.2, minCellHeight: ROW_H, valign: "middle", lineColor: [220, 220, 220], lineWidth: 0.2 },
    columnStyles: { 0: { cellWidth: 18 } },
  });
}

function drawFooters(doc: jsPDF, pageRefs: string[], generated: Date) {
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    const y = PAGE_H - 16;
    doc.setDrawColor(...GREEN).setLineWidth(0.5).line(M, y, PAGE_W - M, y);
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...GRAY);
    doc.text("ENROGIS  •  City Environment and Natural Resources Office, Ormoc City", M, y + 5);
    doc.text(`${pageRefs[i - 1] ?? ""}  •  Page ${i} of ${total}`, PAGE_W - M, y + 5, { align: "right" });
    doc.setFont("helvetica", "italic");
    doc.text(`System-generated report  •  ${fmtDate(generated)}`, M, y + 9.5);
  }
}

/** Builds one Site Survey Report per site (in one PDF) and downloads it. */
export async function exportSitesToPdf(sites: Site[]) {
  const logo = await logoDataUrl();
  const generated = new Date();
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageRefs: string[] = [];

  sites.forEach((site, idx) => {
    if (idx > 0) doc.addPage();
    const startPage = doc.getNumberOfPages();
    drawSiteReport(doc, site, logo, generated);
    for (let p = startPage; p <= doc.getNumberOfPages(); p++) pageRefs[p - 1] = site.refNo;
  });
  drawFooters(doc, pageRefs, generated);

  const name =
    sites.length === 1
      ? `${safeFileName(sites[0].refNo)}_${safeFileName(sites[0].name)}`
      : `ENROGIS_Site_Reports_${generated.toISOString().slice(0, 10)}`;
  downloadBlob(doc.output("blob"), `${name}.pdf`);
}
