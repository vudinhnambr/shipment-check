import { useEffect, useState } from "react";

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

function isBadStatus(status) {
  return status === "OPEN_REVIEW" || status === "UNKNOWN";
}

export default function Home() {
  const [snText, setSnText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  const [parts, setParts] = useState([]);
  const [partsError, setPartsError] = useState(null);
  const [selectedPart, setSelectedPart] = useState("");
  const [suffix, setSuffix] = useState("");

  useEffect(() => {
    fetch("/api/parts")
      .then((res) => res.json())
      .then((json) => {
        if (json.error) throw new Error(json.error);
        setParts(json.parts || []);
      })
      .catch((e) => setPartsError(e.message));
  }, []);

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

  function pickCandidate(candidate) {
    setSnText(candidate);
  }

  function addPartQuery() {
    if (!selectedPart || !suffix.trim()) return;
    const line = `${selectedPart}*${suffix.trim()}`;
    setSnText((prev) => (prev ? prev.trim() + "\n" + line : line));
    setSuffix("");
  }

  return (
    <div className="container">
      <h1>Kiem tra NCR ring le truoc khi xuat hang</h1>
      <p className="subtitle">
        Nhap S/N cua Bearing Set (doc tu Tag Name), moi so mot dong. Hoac chon Part
        roi go 6-8 so cuoi cua S/N - khong can nho ma day.
      </p>

      <div className="part-picker">
        <select value={selectedPart} onChange={(e) => setSelectedPart(e.target.value)}>
          <option value="">-- Chon Part --</option>
          {parts.map((p) => (
            <option key={p.code} value={p.code}>
              {p.label}
              {p.client ? ` (${p.client})` : ""}
            </option>
          ))}
        </select>
        <input
          type="text"
          inputMode="numeric"
          placeholder="6-8 so cuoi cua S/N"
          value={suffix}
          onChange={(e) => setSuffix(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addPartQuery();
          }}
        />
        <button className="secondary" onClick={addPartQuery} disabled={!selectedPart || !suffix.trim()}>
          Them vao danh sach
        </button>
      </div>
      {partsError && <div className="error small">Khong tai duoc danh sach Part: {partsError}</div>}

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

      {data?.results?.map((r, idx) => (
        <div className="card" key={r.assySn + idx}>
          <div className="card-header">
            <span>Bearing Set S/N: {r.assySn}</span>
            <StatusBadge overallOk={r.overallOk} found={r.found} />
          </div>

          {r.resolvedAssySn && (
            <div className="resolved-note">
              Da tu khop voi: <strong>{r.resolvedAssySn}</strong>
            </div>
          )}

          {!r.found && !r.ambiguous && (
            <div className="not-found">
              Khong tim thay S/N nay trong file &quot;Check SN ring from SN bearing set&quot;.
              Kiem tra lai so doc tu tag.
            </div>
          )}

          {r.ambiguous && (
            <div className="ambiguous">
              <div>
                Nhap thieu qua nen trung {r.candidates.length} bearing set khac nhau -
                bam chon dung so, hoac nhap day du hon:
              </div>
              <ul>
                {r.candidates.map((c) => (
                  <li key={c}>
                    <button className="candidate" onClick={() => pickCandidate(c)}>
                      {c}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {r.rings?.map((ring) => (
            <div
              className={"ring-row" + (isBadStatus(ring.status) ? " ring-row-bad" : "")}
              key={ring.ringSn}
            >
              <div className="ring-top">
                <span>
                  {isBadStatus(ring.status) && <span className="warn-icon">⚠</span>}
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
