const { getLookups } = require("../../lib/data");
const { checkBearingSet } = require("../../lib/lookup");

function parseSnList(raw) {
  if (!raw) return [];
  return String(raw)
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

module.exports = async function handler(req, res) {
  try {
    const raw = req.method === "POST" ? req.body?.sn : req.query.sn;
    const refresh = req.query.refresh === "1" || req.body?.refresh === true;
    const snList = parseSnList(raw);

    if (snList.length === 0) {
      res.status(400).json({ error: "Missing 'sn' (bearing set S/N, one or more)." });
      return;
    }

    const { ringLookup, ncrLookup, timestamp } = await getLookups({
      forceRefresh: refresh,
    });

    const results = snList.map((assySn) => checkBearingSet(assySn, ringLookup, ncrLookup));

    res.status(200).json({
      dataAsOf: new Date(timestamp).toISOString(),
      results,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Internal error" });
  }
};
