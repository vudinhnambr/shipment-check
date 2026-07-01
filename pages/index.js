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

  // A "bare fragment" is a short line with no dashes and no "*" already in it -
  // i.e. it looks like just the last few digits of an S/N, not a full S/N (which
  // always contains dashes, e.g. "VN-GEE-P280027B-262239"). If a Part is ticked,
  // any bare fragment - whether typed in the dedicated suffix box OR directly into
  // the main textarea - gets scoped to that part automatically.
  function isBareFragment(line) {
    return !line.includes("*") && !line.includes("-") && line.length <= 10;
  }

  // Builds the final text to search: every line already in the textarea (with bare
  // fragments auto-scoped to the ticked Part, if any), PLUS the current suffix box
  // content (if filled in) - so the inspector does not have to remember which box
  // to type numbers into, or click "Them vao danh sach" before "Kiem tra" works.
  function buildQueryText() {
    let lines = snText
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (selectedPart) {
      lines = lines.map((l) => (isBareFragment(l) ? `${selectedPart}*${l}` : l));
    }

    if (selectedPart && suffix.trim()) {
      lines.push(`${selectedPart}*${suffix.trim()}`);
      setSuffix("");
    }

    const text = lines.join("\n");
    setSnText(text);
    return text;
  }

  async function runCheck(refresh = false) {
    const text = buildQueryText();
    if (!text) {
      setError("Chua nhap S/N nao - go vao o ben duoi hoac chon Part + so cuoi.");
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

  function addPartQuery() {
    if (!selectedPart || !suffix.trim()) return;
    const line = `${selectedPart}*${suffix.trim()}`;
    setSnText((prev) => (prev ? prev.trim() + "\n" + line : line));
    setSuffix("");
  }

  function togglePart(code) {
    setSelectedPart((prev) => (prev === code ? "" : code));
  }

  return (
    <div className="container">
      <h1>Kiem tra NCR ring le truoc khi xuat hang</h1>
      <p className="subtitle">
        Nhap S/N cua Bearing Set (doc tu Tag Name), moi so mot dong. Hoac tick chon
        Part ben trai roi go 6-8 so cuoi cua S/N, bam Kiem tra (hoac Enter) - khong
        can nho ma day.
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
          <div className="suffix-row">
            <input
              type="text"
              inputMode="numeric"
              placeholder="6-8 so cuoi cua S/N"
              value={suffix}
              onChange={(e) => setSuffix(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") runCheck(false);
              }}
            />
            <button
              className="secondary"
              onClick={addPartQuery}
              disabled={!selectedPart || !suffix.trim()}
            >
              Them vao danh sach
            </button>
          </div>

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
      </div>
    </div>
  );
}
