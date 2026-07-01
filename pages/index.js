import { useEffect, useState } from "react";

function StatusBadge({ overallOk, found }) {
  if (!found) return <span className="badge unknown">KHONG TIM THAY</span>;
  if (overallOk === true) return <span className="badge ok">OK - CO THE XUAT</span>;
  if (overallOk === false) return <span className="badge bad">CHUA OK</span>;
  return <span className="badge unknown">?</span>;
}

function recordMarkText(status) {
  switch (status) {
    case "CLOSED":
      return "OK (Closed / Use as Is)";
    case "OPEN_REVIEW":
      return "CAN XEM XET (chua Closed)";
    default:
      return "Khong ro trang thai";
  }
}

function ringSummaryText(ring) {
  const total = ring.records?.length || 0;
  if (ring.status === "NO_RECORD") return "OK (khong co non-conformity)";
  if (ring.status === "CLOSED") {
    return total > 1 ? `OK - ca ${total} notice deu Closed/Use as Is` : "OK (Closed / Use as Is)";
  }
  const openCount = (ring.records || []).filter((r) => r.status !== "CLOSED").length;
  return `CAN XEM XET - ${openCount}/${total} notice chua Closed`;
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

  useEffect(() => {
    fetch("/api/parts")
      .then((res) => res.json())
      .then((json) => {
        if (json.error) throw new Error(json.error);
        setParts(json.parts || []);
      })
      .catch((e) => setPartsError(e.message));
  }, []);

  // A "bare fragment" is a short line with no dashes and no "*" already in it -
  // i.e. it looks like just the last few digits of an S/N, not a full S/N (which
  // always contains dashes, e.g. "VN-GEE-P280027B-262239"). If a Part is ticked,
  // any bare fragment typed into the textarea gets scoped to that part
  // automatically - no separate "add" step needed.
  function isBareFragment(line) {
    return !line.includes("*") && !line.includes("-") && line.length <= 10;
  }

  // Builds the final text to search: every line in the textarea, with bare
  // fragments auto-scoped to the ticked Part (if any).
  function buildQueryText() {
    let lines = snText
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (selectedPart) {
      lines = lines.map((l) => (isBareFragment(l) ? `${selectedPart}*${l}` : l));
    }

    const text = lines.join("\n");
    setSnText(text);
    return text;
  }

  async function runCheck(refresh = false) {
    const text = buildQueryText();
    if (!text) {
      setError("Chua nhap S/N nao - go vao o ben duoi (co the chon Part truoc de go it so hon).");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sn: text, refresh }),
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

  function togglePart(code) {
    setSelectedPart((prev) => (prev === code ? "" : code));
  }

  return (
    <div className="container">
      <h1>Kiem tra NCR ring le truoc khi xuat hang</h1>
      <p className="subtitle">
        Nhap S/N cua Bearing Set (doc tu Tag Name), moi so mot dong. Hoac tick chon
        Part ben trai, roi chi can go 6-8 so cuoi cua S/N vao o ben duoi - khong can
        nho ma day.
      </p>

      <div className="layout">
        <div className="part-list-panel">
          <div className="part-list-title">Chon Part</div>
          <div className="part-list">
            {parts.length === 0 && !partsError && (
              <div className="part-list-empty">Dang tai...</div>
            )}
            {parts.map((p) => (
              <label className="part-list-item" key={p.code}>
                <input
                  type="checkbox"
                  checked={selectedPart === p.code}
                  onChange={() => togglePart(p.code)}
                />
                <span>
                  {p.label}
                  {p.client ? ` (${p.client})` : ""}
                </span>
              </label>
            ))}
          </div>
          {partsError && (
            <div className="error small">Khong tai duoc danh sach Part: {partsError}</div>
          )}
        </div>

        <div className="main-content">
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
                    <span>{ringSummaryText(ring)}</span>
                  </div>
                  {ring.records?.map((record, rIdx) => (
                    <div
                      className={
                        "ring-detail" + (record.status !== "CLOSED" ? " ring-detail-bad" : "")
                      }
                      key={record.issueNo ? String(record.issueNo) : rIdx}
                    >
                      <div className="ring-detail-title">
                        Notice {rIdx + 1}/{ring.records.length}: {recordMarkText(record.status)}
                      </div>
                      <div>Issue No.: {String(record.issueNo ?? "-")}</div>
                      <div>Product name: {String(record.productName ?? "-")}</div>
                      <div>Defect description: {String(record.defectDescription ?? "-")}</div>
                      <div>Processing Results: {String(record.processingResults ?? "-")}</div>
                      <div>
                        Closing Date:{" "}
                        {record.closingDate ? String(record.closingDate) : "-"}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
