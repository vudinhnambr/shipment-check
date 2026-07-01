/**
 * Core lookup logic - ported 1:1 from check_ncr_status.py so results match exactly.
 *
 * Ring type is NOT reliable from column position in the "SN" sheet of
 * "Check SN ring from SN bearing set.xlsx": some bearing series only have a single
 * "INNER" ring (no upper/lower split) and it can land in either the B or C column
 * depending on the row. The ring S/N prefix (first 6 chars) reliably identifies the
 * ring type instead.
 */

const PREFIX_LABELS = {
  GEEPIB: "INNER UPPER",
  GEEPIC: "INNER LOWER",
  GEEPIA: "INNER",
  GEEPOA: "OUTER",
  GEEYIA: "INNER",
  GEEYOA: "OUTER",
};

function labelForRingSn(ringSn) {
  const prefix = ringSn.slice(0, 6).toUpperCase();
  return PREFIX_LABELS[prefix] || `RING (${prefix})`;
}

/**
 * @param {Array<Array<any>>} rows - raw rows from sheet_to_json(sheet, {header:1}) of the "SN" sheet
 * @returns {Map<string, Array<{label: string, ringSn: string}>>}
 */
function loadRingLookup(rows) {
  const lookup = new Map();
  for (const row of rows) {
    const assySn = row[0];
    if (typeof assySn !== "string" || !assySn.trim()) continue;
    const rings = [];
    for (const colIdx of [1, 2, 3, 4]) {
      const val = row[colIdx];
      if (typeof val === "string" && val.trim()) {
        const ringSn = val.trim();
        rings.push({ label: labelForRingSn(ringSn), ringSn });
      }
    }
    if (rings.length) {
      lookup.set(assySn.trim().toUpperCase(), rings);
    }
  }
  return lookup;
}

/**
 * @param {Array<Array<any>>} rows - raw rows from sheet_to_json(sheet, {header:1}) of the "LIST" sheet
 *   Header is on row 5 (1-indexed) => index 4. Data starts row 6 (1-indexed) => index 5.
 * @returns {Map<string, object>}
 */
function loadNcrLookup(rows) {
  const lookup = new Map();
  for (let i = 5; i < rows.length; i++) {
    const row = rows[i];
    const ringSn = row[5];
    if (typeof ringSn !== "string" || !ringSn.trim()) continue;
    const record = {
      issueNo: row[2] ?? null,
      issueDate: row[3] ?? null,
      productName: row[19] ?? null,
      defectDescription: row[23] ?? null,
      processingResults: row[24] ?? null,
      closingDate: row[30] ?? null,
    };
    lookup.set(ringSn.trim().toUpperCase(), record);
  }
  return lookup;
}

function classify(processingResults) {
  if (!processingResults) return "UNKNOWN";
  const text = String(processingResults).trim().toLowerCase();
  if (text.includes("closed")) return "CLOSED";
  return "OPEN_REVIEW";
}

/**
 * @param {string} assySn
 * @param {Map} ringLookup
 * @param {Map} ncrLookup
 * @returns {{found: boolean, assySn: string, rings: Array, overallOk: (boolean|null)}}
 */
function checkBearingSet(assySn, ringLookup, ncrLookup) {
  const key = assySn.trim().toUpperCase();
  const rings = ringLookup.get(key);
  if (!rings) {
    return { found: false, assySn, rings: [], overallOk: null };
  }

  let overallOk = true;
  const results = rings.map(({ label, ringSn }) => {
    const record = ncrLookup.get(ringSn.trim().toUpperCase());
    if (!record) {
      return { label, ringSn, record: null, status: "NO_RECORD" };
    }
    const status = classify(record.processingResults);
    if (status !== "CLOSED") overallOk = false;
    return { label, ringSn, record, status };
  });

  return { found: true, assySn, rings: results, overallOk };
}

module.exports = {
  PREFIX_LABELS,
  labelForRingSn,
  loadRingLookup,
  loadNcrLookup,
  classify,
  checkBearingSet,
};
