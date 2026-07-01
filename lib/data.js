const XLSX = require("xlsx");
const { downloadDriveFile } = require("./drive");
const { loadRingLookup, loadNcrLookup, loadPartsList } = require("./lookup");

// Simple in-memory cache. Persists only for the lifetime of a warm serverless
// instance - good enough to avoid re-downloading + re-parsing ~2MB of Excel on
// every single request, while still picking up new data within CACHE_TTL_SECONDS.
let cache = null; // { timestamp, ringLookup, ncrLookup, parts }

function getTtlMs() {
  const seconds = parseInt(process.env.CACHE_TTL_SECONDS || "300", 10);
  return (Number.isFinite(seconds) ? seconds : 300) * 1000;
}

function sheetToRows(workbook, preferredSheetName) {
  const sheet =
    workbook.Sheets[preferredSheetName] ||
    workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
}

async function getLookups({ forceRefresh = false } = {}) {
  const now = Date.now();
  if (!forceRefresh && cache && now - cache.timestamp < getTtlMs()) {
    return cache;
  }

  const partsFileId = process.env.DRIVE_PARTS_FILE_ID;

  const downloads = [
    downloadDriveFile(process.env.DRIVE_SN_FILE_ID),
    downloadDriveFile(process.env.DRIVE_NCR_FILE_ID),
  ];
  if (partsFileId) {
    downloads.push(downloadDriveFile(partsFileId));
  }

  const results = await Promise.all(downloads);
  const [snBuffer, ncrBuffer, partsBuffer] = results;

  const snWorkbook = XLSX.read(snBuffer, { type: "buffer", cellDates: true });
  const ncrWorkbook = XLSX.read(ncrBuffer, { type: "buffer", cellDates: true });

  const snRows = sheetToRows(snWorkbook, "SN");
  const listRows = sheetToRows(ncrWorkbook, "LIST");

  const ringLookup = loadRingLookup(snRows);
  const ncrLookup = loadNcrLookup(listRows);

  let parts = [];
  if (partsBuffer) {
    const partsWorkbook = XLSX.read(partsBuffer, { type: "buffer" });
    const partsRows = sheetToRows(partsWorkbook, "Sheet2");
    parts = loadPartsList(partsRows);
  }

  cache = { timestamp: now, ringLookup, ncrLookup, parts };
  return cache;
}

module.exports = { getLookups };
