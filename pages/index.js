import { useState } from "react";

function StatusBadge({ overallOk, found }) {
  if (!found) return <span className="badge unknown">KHONG TIM THAY</span>;
  if (overallOk === true) return <span className="badge ok">OK - CO THE XUAT</span>;
  if (overallOk === false) return <span className="badge bad">CHUA OK</span>;
  return <span className="badge unknown">?</span>;
}

function ringMarkText(status) {
  switch (status) {
    case "NO_RECORD":
      return "OK (khong co non-conformity)";
    case "CLOSED":
      return "OK (Closed)";
    case "OPEN_REVIEW":
      return "CAN XEM XET (chua Closed)";
    default:
      return "Khong ro trang thai";
  }
}

export default function Home() {
  const [snText, setSnText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  async function runCheck(refresh = false) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sn: snText, refresh }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Loi khong xac dinh");
      }
      setData(json);
    } catch (e) {
      setError(e.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container">
      <h1>Kiem tra NCR ring le truoc khi xuat hang</h1>
      <p className="subtitle">
        Nhap S/N cua Bearing Set (doc tu Tag Name), moi so mot dong. Tool tu tra
        ring S/N va tinh trang Close trong 2 file du lieu tren Google Drive.
      </p>

      <textarea
        value={snText}
        onChange={(e) => setSnText(e.target.value)}
        placeholder={"VN-GEE-P280027B-262239\nVN-GEE-P3X00545-262503"}
      />

      <div className="actions">
        <button className="primary" disabled={loading} onClick={() => runCheck(false)}>
          {loading ? "Dang kiem tra..." : "Kiem tra"}
        </button>
        <button className="secondary" disabled={loading} onClick={() => runCheck(true)}>
          Lam moi du lieu &amp; kiem tra
        </button>
        {data?.dataAsOf && (
          <span className="meta">
            Du lieu luc: {new Date(data.dataAsOf).toLocaleString("vi-VN")}
          </span>
        )}
      </div>

      {error && <div className="error">{error}</div>}

      {data?.results?.map((r) => (
        <div className="card" key={r.assySn}>
          <div className="card-header">
            <span>Bearing Set S/N: {r.assySn}</span>
            <StatusBadge overallOk={r.overallOk} found={r.found} />
          </div>
          {!r.found && (
            <div className="not-found">
              Khong tim thay S/N nay trong file &quot;Check SN ring from SN bearing set&quot;.
              Kiem tra lai so doc tu tag.
            </div>
          )}
          {r.rings?.map((ring) => (
            <div className="ring-row" key={ring.ringSn}>
              <div className="ring-top">
                <span>
                  [{ring.label}] {ring.ringSn}
                </span>
                <span>{ringMarkText(ring.status)}</span>
              </div>
              {ring.record && (
                <div className="ring-detail">
                  <div>Issue No.: {String(ring.record.issueNo ?? "-")}</div>
                  <div>Product name: {String(ring.record.productName ?? "-")}</div>
                  <div>Defect description: {String(ring.record.defectDescription ?? "-")}</div>
                  <div>Processing Results: {String(ring.record.processingResults ?? "-")}</div>
                  <div>
                    Closing Date:{" "}
                    {ring.record.closingDate ? String(ring.record.closingDate) : "-"}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
