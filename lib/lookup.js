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

// Minimum length required before we attempt a "suffix" match (e.g. inspector typed
// only the last few digits of the bearing set S/N). Too short and almost everything
// would match, which is useless.
const MIN_SUFFIX_LENGTH = 4;
// Cap how many candidates we collect for an ambiguous suffix match, just so a
// pathological very-short input can't scan-and-return thousands of rows.
const MAX_SUFFIX_CANDIDATES = 25;

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
 * A single ring S/N can appear on MULTIPLE rows in the "LIST" sheet - i.e. it can
 * have more than one Issue No. / non-conformity notice raised against it over time.
 * So this returns an ARRAY of records per ring S/N, not just one - dropping earlier
 * notices when a ring has 2+ rows would silently hide open issues.
 *
 * @param {Array<Array<any>>} rows - raw rows from sheet_to_json(sheet, {header:1}) of the "LIST" sheet
 *   Header is on row 5 (1-indexed) => index 4. Data starts row 6 (1-indexed) => index 5.
 * @returns {Map<string, Array<object>>}
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
    const key = ringSn.trim().toUpperCase();
    if (!lookup.has(key)) {
      lookup.set(key, []);
    }
    lookup.get(key).push(record);
  }
  return lookup;
}

/**
 * Parses the "Standard Part Name" sheet: columns Client(0), Current Auto MT(1),
 * Standard(2), Assembly code(3). Header is row 1. Rows with no Assembly code
 * (e.g. "3.x-103 Pitch Bearing", "6MW") are skipped - they can't be used to build
 * a full bearing set S/N so they wouldn't be useful in the part picker.
 * @param {Array<Array<any>>} rows
 * @returns {Array<{label: string, code: string, client: string}>}
 */
function loadPartsList(rows) {
  const parts = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const client = row[0];
    const standard = row[2];
    const code = row[3];
    if (typeof code !== "string" || !code.trim()) continue;
    if (typeof standard !== "string" || !standard.trim()) continue;
    parts.push({
      label: standard.trim(),
      code: code.trim().toUpperCase(),
      client: typeof client === "string" ? client.trim() : "",
    });
  }
  parts.sort((a, b) => a.label.localeCompare(b.label));
  return parts;
}

// "Use as Is" is treated the same as "Closed" - it means the disposition was
// already decided and accepted as-is, no further action needed before shipping.
function classify(processingResults) {
  if (!processingResults) return "UNKNOWN";
  const text = String(processingResults).trim().toLowerCase();
  if (text.includes("closed") || text.includes("use as is")) return "CLOSED";
  return "OPEN_REVIEW";
}

/**
 * Finds ring-lookup key(s) matching input that is restricted to a known assembly
 * code prefix ("part*suffix" queries built by the Part dropdown + suffix box in the
 * UI). Works for any suffix length (6, 8, or otherwise) since it's just a suffix
 * match scoped to keys starting with the given prefix - normally unambiguous because
 * the prefix already narrows it down to one part type.
 * @returns {{resolvedKey: string|null, candidates: string[]}}
 */
function resolveByPrefixAndSuffix(prefix, suffix, ringLookup) {
  const prefixUpper = prefix.trim().toUpperCase();
  const suffixUpper = suffix.trim().toUpperCase();
  const matches = [];
  for (const candidateKey of ringLookup.keys()) {
    if (candidateKey.startsWith(prefixUpper) && candidateKey.endsWith(suffixUpper)) {
      matches.push(candidateKey);
      if (matches.length > MAX_SUFFIX_CANDIDATES) break;
    }
  }
  if (matches.length === 1) {
    return { resolvedKey: matches[0], candidates: [] };
  }
  if (matches.length > 1) {
    return { resolvedKey: null, candidates: matches.sort() };
  }
  return { resolvedKey: null, candidates: [] };
}

/**
 * Finds the ring-lookup key(s) matching the given input. Supports 3 forms:
 *   1. Exact S/N (e.g. "VN-GEE-P280027B-262239")
 *   2. "prefix*suffix" (built by the Part dropdown + suffix box), e.g.
 *      "VN-GEE-P280027B*262239" - scoped suffix match, any suffix length.
 *   3. A bare fragment (e.g. just "262239") - suffix match against every known
 *      bearing set S/N. Many bearing set S/Ns share the same trailing digits (they
 *      often encode a shared batch/date code), so this can be ambiguous - in that
 *      case all candidates are returned instead of guessing.
 * @returns {{resolvedKey: string|null, matchedBySuffix: boolean, candidates: string[]}}
 */
function resolveAssySnKey(rawInput, ringLookup) {
  const trimmed = rawInput.trim();

  if (trimmed.includes("*")) {
    const [prefix, suffix] = trimmed.split("*");
    const { resolvedKey, candidates } = resolveByPrefixAndSuffix(
      prefix || "",
      suffix || "",
      ringLookup
    );
    return { resolvedKey, matchedBySuffix: Boolean(resolvedKey), candidates };
  }

  const key = trimmed.toUpperCase();

  if (ringLookup.has(key)) {
    return { resolvedKey: key, matchedBySuffix: false, candidates: [] };
  }

  if (key.length >= MIN_SUFFIX_LENGTH) {
    const matches = [];
    for (const candidateKey of ringLookup.keys()) {
      if (candidateKey.endsWith(key)) {
        matches.push(candidateKey);
        if (matches.length > MAX_SUFFIX_CANDIDATES) break;
      }
    }
    if (matches.length === 1) {
      return { resolvedKey: matches[0], matchedBySuffix: true, candidates: [] };
    }
    if (matches.length > 1) {
      return { resolvedKey: null, matchedBySuffix: false, candidates: matches.sort() };
    }
  }

  return { resolvedKey: null, matchedBySuffix: false, candidates: [] };
}

/**
 * Aggregates every NCR notice recorded against one ring S/N into a single ring
 * status. A ring only counts as OK ("CLOSED") if it has NO notices at all, or if
 * EVERY notice on it is Closed/Use as Is - a ring with 2 notices where only 1 is
 * closed must still block shipment.
 * @param {Array<object>} records
 * @returns {{status: string, records: Array<object & {status: string}>}}
 */
function evaluateRing(records) {
  if (!records || records.length === 0) {
    return { status: "NO_RECORD", records: [] };
  }
  const withStatus = records.map((r) => ({ ...r, status: classify(r.processingResults) }));
  const allClosed = withStatus.every((r) => r.status === "CLOSED");
  return { status: allClosed ? "CLOSED" : "OPEN_REVIEW", records: withStatus };
}

/**
 * @param {string} assySn
 * @param {Map} ringLookup
 * @param {Map<string, Array<object>>} ncrLookup
 * @returns {{found: boolean, assySn: string, resolvedAssySn?: string, rings: Array, overallOk: (boolean|null), ambiguous?: boolean, candidates?: string[]}}
 */
function checkBearingSet(assySn, ringLookup, ncrLookup) {
  const { resolvedKey, matchedBySuffix, candidates } = resolveAssySnKey(assySn, ringLookup);

  if (candidates.length > 0) {
    return {
      found: false,
      assySn,
      rings: [],
      overallOk: null,
      ambiguous: true,
      candidates,
    };
  }

  const rings = resolvedKey ? ringLookup.get(resolvedKey) : null;
  if (!rings) {
    return { found: false, assySn, rings: [], overallOk: null, ambiguous: false };
  }

  let overallOk = true;
  const results = rings.map(({ label, ringSn }) => {
    const records = ncrLookup.get(ringSn.trim().toUpperCase()) || [];
    const { status, records: recordsWithStatus } = evaluateRing(records);
    // A ring is fine when it has no notices at all (NO_RECORD) or every notice
    // on it is Closed/Use as Is (CLOSED). Only OPEN_REVIEW/UNKNOWN should block
    // shipment - NO_RECORD must NOT be treated as "not OK".
    if (status !== "CLOSED" && status !== "NO_RECORD") overallOk = false;
    return { label, ringSn, status, records: recordsWithStatus };
  });

  return {
    found: true,
    assySn,
    resolvedAssySn: matchedBySuffix ? resolvedKey : undefined,
    rings: results,
    overallOk,
  };
}

module.exports = {
  PREFIX_LABELS,
  labelForRingSn,
  loadRingLookup,
  loadNcrLookup,
  loadPartsList,
  classify,
  evaluateRing,
  resolveAssySnKey,
  resolveByPrefixAndSuffix,
  checkBearingSet,
};
