/**
 * Standalone test: runs the pure lookup logic (lib/lookup.js) directly against local
 * copies of the two xlsx files (no Google Drive involved) to confirm it reproduces the
 * same result as check_ncr_status.py. Usage:
 *   node scripts/test-lookup.js "<path to SN file>" "<path to NCR file>" "<assySn1>" "<assySn2>" ...
 */
const fs = require("fs");
const XLSX = require("xlsx");
const { loadRingLookup, loadNcrLookup, checkBearingSet } = require("../lib/lookup");

const [snPath, ncrPath, ...assySns] = process.argv.slice(2);

if (!snPath || !ncrPath || assySns.length === 0) {
  console.error(
    'Usage: node scripts/test-lookup.js "<SN file>" "<NCR file>" "<assySn1>" ["<assySn2>" ...]'
  );
  process.exit(1);
}

const snBuffer = fs.readFileSync(snPath);
const ncrBuffer = fs.readFileSync(ncrPath);

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

console.log(`Loaded ${ringLookup.size} bearing set rows, ${ncrLookup.size} NCR ring records.\n`);

for (const assySn of assySns) {
  const result = checkBearingSet(assySn, ringLookup, ncrLookup);
  console.log(`=== Bearing Set S/N: ${assySn} ===`);
  if (!result.found) {
    console.log("  !! Not found in ring lookup file.\n");
    continue;
  }
  for (const r of result.rings) {
    console.log(`  [${r.label}] Ring S/N: ${r.ringSn}`);
    if (!r.record) {
      console.log("      -> No NCR/SR record. OK.");
    } else {
      console.log(`      Issue No.: ${r.record.issueNo}`);
      console.log(`      Processing Results: ${r.record.processingResults} -> ${r.status}`);
    }
  }
  console.log(`  ==> overallOk = ${result.overallOk}\n`);
}
