import ExcelJS from "exceljs";
import { toDMS } from "./geo";
import { downloadBlob, safeFileName, siteStats, type Site } from "./sites";

const GREEN = "FF1B6B3A";
const LIGHT = "FFEAF5EE";

function styleHeader(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: "FFCCCCCC" } } };
  });
  row.height = 22;
}

function zebra(sheet: ExcelJS.Worksheet, fromRow: number) {
  for (let r = fromRow; r <= sheet.rowCount; r++) {
    if ((r - fromRow) % 2 === 1) {
      sheet.getRow(r).eachCell((c) => {
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF6F9F7" } };
      });
    }
  }
}

/** One sheet name must be unique and ≤ 31 chars without []:*?/\ */
function sheetName(base: string, used: Set<string>) {
  let name = base.replace(/[[\]:*?/\\]/g, " ").slice(0, 28) || "Site";
  let n = 2;
  const original = name;
  while (used.has(name.toLowerCase())) name = `${original.slice(0, 25)} (${n++})`;
  used.add(name.toLowerCase());
  return name;
}

export async function exportSitesToExcel(sites: Site[]) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "ENROGIS";
  wb.created = new Date();
  const used = new Set<string>(["summary"]);

  // ---- Summary sheet ----
  const sum = wb.addWorksheet("Summary", { views: [{ state: "frozen", ySplit: 4 }] });
  sum.mergeCells("A1:L1");
  sum.getCell("A1").value = "ENROGIS – Reforestation Site Boundaries";
  sum.getCell("A1").font = { bold: true, size: 14, color: { argb: GREEN } };
  sum.mergeCells("A2:L2");
  sum.getCell("A2").value = `City Environment and Natural Resources Office, Ormoc City · Exported ${new Date().toLocaleString("en-PH")} · WGS 84`;
  sum.getCell("A2").font = { italic: true, size: 9, color: { argb: "FF666666" } };

  sum.getRow(4).values = [
    "Reference No.", "Site Name", "Reforestation Area", "Barangay", "Status", "Vertices",
    "Area (ha)", "Area (m²)", "Perimeter (m)", "Center Lat", "Center Lng", "Remarks",
  ];
  styleHeader(sum.getRow(4));
  for (const s of sites) {
    const st = siteStats(s);
    sum.addRow([
      s.refNo, s.name, s.reforestationArea, s.barangay, s.status, s.points.length,
      Number(st.hectares.toFixed(4)), Number(st.areaSqm.toFixed(2)), Number(st.perimeter.toFixed(2)),
      st.center ? Number(st.center.latitude.toFixed(6)) : null,
      st.center ? Number(st.center.longitude.toFixed(6)) : null,
      s.remarks,
    ]);
  }
  const totalRow = sum.addRow([
    "TOTAL", `${sites.length} site(s)`, "", "", "", sites.reduce((a, s) => a + s.points.length, 0),
    Number(sites.reduce((a, s) => a + siteStats(s).hectares, 0).toFixed(4)),
    Number(sites.reduce((a, s) => a + siteStats(s).areaSqm, 0).toFixed(2)),
  ]);
  totalRow.font = { bold: true };
  totalRow.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT } }));
  zebra(sum, 5);
  [16, 24, 24, 16, 14, 9, 11, 12, 13, 12, 12, 40].forEach((w, i) => (sum.getColumn(i + 1).width = w));
  sum.getColumn(7).numFmt = "0.0000";
  sum.getColumn(8).numFmt = "#,##0.00";
  sum.getColumn(9).numFmt = "#,##0.00";
  sum.getColumn(10).numFmt = "0.000000";
  sum.getColumn(11).numFmt = "0.000000";

  // ---- Coordinates of every site in one sheet (easy for GIS import) ----
  const all = wb.addWorksheet("All Coordinates", { views: [{ state: "frozen", ySplit: 1 }] });
  all.getRow(1).values = ["Reference No.", "Site Name", "Point", "Latitude", "Longitude", "Latitude (DMS)", "Longitude (DMS)"];
  styleHeader(all.getRow(1));
  sites.forEach((s) =>
    s.points.forEach((p, i) =>
      all.addRow([s.refNo, s.name, i + 1, p.latitude, p.longitude, toDMS(p.latitude, true), toDMS(p.longitude, false)]),
    ),
  );
  zebra(all, 2);
  [16, 24, 8, 14, 14, 18, 18].forEach((w, i) => (all.getColumn(i + 1).width = w));
  all.getColumn(4).numFmt = "0.000000";
  all.getColumn(5).numFmt = "0.000000";

  // ---- One sheet per site ----
  for (const s of sites) {
    const st = siteStats(s);
    const ws = wb.addWorksheet(sheetName(s.refNo || s.name, used));
    const info: [string, string | number][] = [
      ["Site Name", s.name],
      ["Reference No.", s.refNo],
      ["Reforestation Area", s.reforestationArea],
      ["Barangay", s.barangay],
      ["Status", s.status],
      ["Total Area (ha)", Number(st.hectares.toFixed(4))],
      ["Total Area (m²)", Number(st.areaSqm.toFixed(2))],
      ["Perimeter (m)", Number(st.perimeter.toFixed(2))],
      ["Center Point", st.center ? `${st.center.latitude.toFixed(6)}, ${st.center.longitude.toFixed(6)}` : ""],
      ["Remarks", s.remarks],
    ];
    info.forEach(([k, v]) => {
      const r = ws.addRow([k, v]);
      r.getCell(1).font = { bold: true };
      r.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT } };
    });
    ws.addRow([]);
    const hdr = ws.addRow(["Point", "Latitude", "Longitude", "Latitude (DMS)", "Longitude (DMS)"]);
    styleHeader(hdr);
    const start = ws.rowCount + 1;
    s.points.forEach((p, i) => ws.addRow([i + 1, p.latitude, p.longitude, toDMS(p.latitude, true), toDMS(p.longitude, false)]));
    zebra(ws, start);
    [20, 16, 16, 18, 18].forEach((w, i) => (ws.getColumn(i + 1).width = w));
    for (let r = start; r <= ws.rowCount; r++) {
      ws.getCell(r, 2).numFmt = "0.000000";
      ws.getCell(r, 3).numFmt = "0.000000";
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  const name = sites.length === 1 ? `${safeFileName(sites[0].refNo)}_${safeFileName(sites[0].name)}` : `ENROGIS_Sites_${new Date().toISOString().slice(0, 10)}`;
  downloadBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${name}.xlsx`);
}
