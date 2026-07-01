const XLSX = require("xlsx");
const { downloadDriveFile } = require("./drive");
const { loadRingLookup, loadNcrLookup } = require("./lookup");

// Simple in-memory cache. Persists only for the lifetime of a warm serverless
// instance - good enough to avoid re-downloading + re-parsing ~2MB of Excel on
// every single request, while still picking up new data within CACHE_TTL_SECONDS.
let cache = null; // { timestamp, ringLookup, ncrLookup }

function getTtlMs() {
  const seconds = parseInt(process.env.CACHE_TTL_SECONDS || "300", 10);
  return (Number.isFinite(seconds) ? seconds : 300) * 1000;
}

async function getLookups({ forceRefresh = false } = {}) {
  const now = Date.now();
  if (!forceRefresh && cache && now - cache.timestamp < getTtlMs()) {
    return cache;
  }

  const [snBuffer, ncrBuffer] = await Promise.all([
    downloadDriveFile(process.env.DRIVE_SN_FILE_ID),
    downloadDriveFile(process.env.DRIVE_NCR_FILE_ID),
  ]);

  const snWorkbook = XLSX.read(snBuffer, { type: "buffer", cellDates: true });
  const ncrWorkbook = XLSX.read(ncrBuffer, { type: "buffer", cellDates: true });

  const snRows = XLSX.utils.sheet_to_json(snWorkbook.Sheets["SN"], {
    header: 1,
    defval: null,
  });
  const listRows = XLSX.utils.sheet_to_json(ncrWorkbook.Sheets["LIST"], {
    header: 1,
    defval: null,
  });

  const ringLookup = loadRingLookup(snRows);
  const ncrLookup = loadNcrLookup(listRows);

  cache = { timestamp: now, ringLookup, ncrLookup };
  return cache;
}

module.exports = { getLookups };
