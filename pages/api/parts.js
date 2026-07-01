const { getLookups } = require("../../lib/data");

export default async function handler(req, res) {
  try {
    const refresh = req.query.refresh === "1";
    const { parts, timestamp } = await getLookups({ forceRefresh: refresh });
    res.status(200).json({
      dataAsOf: new Date(timestamp).toISOString(),
      parts: parts || [],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Internal error" });
  }
}
