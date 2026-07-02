import Head from "next/head";
import { useEffect, useMemo, useState } from "react";

// ---------------------------------------------------------------------------
// i18n - all user-facing text lives here so the EN/VN toggle just swaps STR.
// ---------------------------------------------------------------------------
const STRINGS = {
  vi: {
    appName: "NCR Ring Check",
    title: "Kiểm tra NCR ring lẻ trước khi xuất hàng",
    subtitle:
      "Nhập S/N của Bearing Set (đọc từ Tag Name), mỗi số một dòng. Hoặc tick chọn Part bên trái, rồi chỉ cần gõ 6-8 số cuối của S/N - không cần nhớ mã dài.",
    partPanelTitle: "Chọn Part",
    partLoading: "Đang tải...",
    partLoadError: "Không tải được danh sách Part: ",
    snPlaceholder: "VN-GEE-P280027B-262239\nVN-GEE-P3X00545-262503",
    checkButton: "Kiểm tra",
    checking: "Đang kiểm tra...",
    refreshButton: "Làm mới dữ liệu & kiểm tra",
    resetButton: "Xóa / Nhập lại",
    dataAsOf: "Dữ liệu lúc: ",
    missingSn: "Chưa nhập S/N nào - gõ vào ô bên dưới (có thể chọn Part trước để gõ ít số hơn).",
    unknownError: "Lỗi không xác định",
    foundLabelPrefix: "Bearing Set S/N: ",
    statusOk: "OK - CÓ THỂ XUẤT",
    statusBad: "CHƯA OK",
    statusNotFound: "KHÔNG TÌM THẤY",
    statusUnknown: "?",
    resolvedNote: "Đã tự khớp với: ",
    notFoundText:
      'Không tìm thấy S/N này trong file "Check SN ring from SN bearing set". Kiểm tra lại số đọc từ tag.',
    ambiguousText: (n) =>
      `Nhập thiếu quá nên trùng ${n} bearing set khác nhau - bấm chọn đúng số, hoặc nhập đầy đủ hơn:`,
    okNoIssue: "OK (không có non-conformity)",
    okClosedSingle: "OK (Closed / Use as Is)",
    okClosedMulti: (n) => `OK - cả ${n} notice đều Closed/Use as Is`,
    needReview: (open, total) => `CẦN XEM XÉT - ${open}/${total} notice chưa Closed`,
    noticeTitle: (i, n) => `Notice ${i}/${n}: `,
    recordOk: "OK (Closed / Use as Is)",
    recordReview: "CẦN XEM XÉT (chưa Closed)",
    recordUnknown: "Không rõ trạng thái",
    issueNo: "Issue No.: ",
    productName: "Tên sản phẩm: ",
    defectDescription: "Mô tả lỗi: ",
    processingResults: "Kết quả xử lý: ",
    closingDate: "Ngày đóng: ",
  },
  en: {
    appName: "NCR Ring Check",
    title: "Check ring NCR status before shipment",
    subtitle:
      "Enter the Bearing Set S/N (from the Tag Name), one per line. Or tick a Part on the left, then just type the last 6-8 digits of the S/N - no need to remember the full code.",
    partPanelTitle: "Select Part",
    partLoading: "Loading...",
    partLoadError: "Could not load Part list: ",
    snPlaceholder: "VN-GEE-P280027B-262239\nVN-GEE-P3X00545-262503",
    checkButton: "Check",
    checking: "Checking...",
    refreshButton: "Refresh data & check",
    resetButton: "Clear / Reset",
    dataAsOf: "Data as of: ",
    missingSn: "No S/N entered - type into the box below (you can tick a Part first to type fewer digits).",
    unknownError: "Unknown error",
    foundLabelPrefix: "Bearing Set S/N: ",
    statusOk: "OK - READY TO SHIP",
    statusBad: "NOT OK",
    statusNotFound: "NOT FOUND",
    statusUnknown: "?",
    resolvedNote: "Auto-matched to: ",
    notFoundText:
      'This S/N was not found in "Check SN ring from SN bearing set". Double-check the number read from the tag.',
    ambiguousText: (n) =>
      `Too short - matches ${n} different bearing sets. Click to pick the right one, or type a longer S/N:`,
    okNoIssue: "OK (no non-conformity)",
    okClosedSingle: "OK (Closed / Use as Is)",
    okClosedMulti: (n) => `OK - all ${n} notices are Closed/Use as Is`,
    needReview: (open, total) => `NEEDS REVIEW - ${open}/${total} notice(s) not Closed`,
    noticeTitle: (i, n) => `Notice ${i}/${n}: `,
    recordOk: "OK (Closed / Use as Is)",
    recordReview: "NEEDS REVIEW (not Closed)",
    recordUnknown: "Status unknown",
    issueNo: "Issue No.: ",
    productName: "Product name: ",
    defectDescription: "Defect description: ",
    processingResults: "Processing Results: ",
    closingDate: "Closing Date: ",
  },
};

function StatusBadge({ overallOk, found, STR }) {
  if (!found) return <span className="badge unknown">{STR.statusNotFound}</span>;
  if (overallOk === true) return <span className="badge ok">{STR.statusOk}</span>;
  if (overallOk === false) return <span className="badge bad">{STR.statusBad}</span>;
  return <span className="badge unknown">{STR.statusUnknown}</span>;
}

function recordMarkText(status, STR) {
  switch (status) {
    case "CLOSED":
      return STR.recordOk;
    case "OPEN_REVIEW":
      return STR.recordReview;
    default:
      return STR.recordUnknown;
  }
}

function ringSummaryText(ring, STR) {
  const total = ring.records?.length || 0;
  if (ring.status === "NO_RECORD") return STR.okNoIssue;
  if (ring.status === "CLOSED") {
    return total > 1 ? STR.okClosedMulti(total) : STR.okClosedSingle;
  }
  const openCount = (ring.records || []).filter((r) => r.status !== "CLOSED").length;
  return STR.needReview(openCount, total);
}

function isBadStatus(status) {
  return status === "OPEN_REVIEW" || status === "UNKNOWN";
}

// Header row highlight class for the top status line of each result card:
// green when the whole bearing set is OK, red when it is not.
function headerHighlightClass(overallOk) {
  if (overallOk === true) return " header-ok";
  if (overallOk === false) return " header-bad";
  return "";
}

// A "bare fragment" is a short line with no dashes and no "*" already in it -
// i.e. it looks like just the last few digits of an S/N, not a full S/N (which
// always contains dashes, e.g. "VN-GEE-P280027B-262239"). If a Part is ticked,
// any bare fragment typed into the textarea gets scoped to that part
// automatically - no separate "add" step needed.
function isBareFragment(value) {
  return !value.includes("*") && !value.includes("-") && value.length <= 10;
}

export default function Home() {
  const [lang, setLang] = useState("vi");
  const STR = STRINGS[lang];

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
      setError(STR.missingSn);
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
        throw new Error(json.error || STR.unknownError);
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

  function resetInput() {
    setSnText("");
    setData(null);
    setError(null);
  }

  const dataAsOfText = useMemo(() => {
    if (!data?.dataAsOf) return null;
    const locale = lang === "vi" ? "vi-VN" : "en-US";
    return new Date(data.dataAsOf).toLocaleString(locale);
  }, [data, lang]);

  return (
    <>
      <Head>
        <title>{STR.title}</title>
      </Head>
      <div className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <span className="brand-mark">NCR</span>
            <span className="brand-name">{STR.appName}</span>
          </div>
          <div className="lang-toggle" role="group" aria-label="Language">
            <button
              type="button"
              className={lang === "vi" ? "active" : ""}
              onClick={() => setLang("vi")}
            >
              VN
            </button>
            <button
              type="button"
              className={lang === "en" ? "active" : ""}
              onClick={() => setLang("en")}
            >
              EN
            </button>
          </div>
        </div>
      </div>

      <div className="container">
        <h1>{STR.title}</h1>
        <p className="subtitle">{STR.subtitle}</p>

        <div className="layout">
          <div className="part-list-panel">
            <div className="part-list-title">{STR.partPanelTitle}</div>
            <div className="part-list">
              {parts.length === 0 && !partsError && (
                <div className="part-list-empty">{STR.partLoading}</div>
              )}
              {parts.map((p) => (
                <label className="part-list-item" key={p.code}>
                  <input
                    type="radio"
                    name="part-picker"
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
              <div className="error small">
                {STR.partLoadError}
                {partsError}
              </div>
            )}
          </div>

          <div className="main-content">
            <div className="sn-input-card">
              <textarea
                value={snText}
                onChange={(e) => setSnText(e.target.value)}
                placeholder={STR.snPlaceholder}
              />

              <div className="actions">
                <button className="primary" disabled={loading} onClick={() => runCheck(false)}>
                  {loading ? STR.checking : STR.checkButton}
                </button>
                <button className="secondary" disabled={loading} onClick={() => runCheck(true)}>
                  {STR.refreshButton}
                </button>
                <button className="secondary" disabled={loading} onClick={resetInput}>
                  {STR.resetButton}
                </button>
                {dataAsOfText && (
                  <span className="meta">
                    {STR.dataAsOf}
                    {dataAsOfText}
                  </span>
                )}
              </div>

              {error && <div className="error">{error}</div>}
            </div>

            {data?.results?.map((r, resultIdx) => {
              return (
                <div className="card" key={r.assySn + resultIdx}>
                  <div className={"card-header" + headerHighlightClass(r.overallOk)}>
                    <span>
                      {STR.foundLabelPrefix}
                      {r.assySn}
                    </span>
                    <StatusBadge overallOk={r.overallOk} found={r.found} STR={STR} />
                  </div>

                  {r.resolvedAssySn && (
                    <div className="resolved-note">
                      {STR.resolvedNote}
                      <strong>{r.resolvedAssySn}</strong>
                    </div>
                  )}

                  {!r.found && !r.ambiguous && (
                    <div className="not-found">{STR.notFoundText}</div>
                  )}

                  {r.ambiguous && (
                    <div className="ambiguous">
                      <div>{STR.ambiguousText(r.candidates.length)}</div>
                      <ul>
                        {r.candidates.map((c) => (
                          <li key={c}>
                            <button
                              className="candidate"
                              onClick={() => pickCandidate(c)}
                            >
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
                          {isBadStatus(ring.status) && <span className="warn-icon">!</span>}
                          [{ring.label}] {ring.ringSn}
                        </span>
                        <span>{ringSummaryText(ring, STR)}</span>
                      </div>
                      {ring.records?.map((record, rIdx) => (
                        <div
                          className={
                            "ring-detail" + (record.status !== "CLOSED" ? " ring-detail-bad" : "")
                          }
                          key={record.issueNo ? String(record.issueNo) : rIdx}
                        >
                          <div className="ring-detail-title">
                            {STR.noticeTitle(rIdx + 1, ring.records.length)}
                            {recordMarkText(record.status, STR)}
                          </div>
                          <div>
                            {STR.issueNo}
                            {String(record.issueNo ?? "-")}
                          </div>
                          <div>
                            {STR.productName}
                            {String(record.productName ?? "-")}
                          </div>
                          <div>
                            {STR.defectDescription}
                            {String(record.defectDescription ?? "-")}
                          </div>
                          <div>
                            {STR.processingResults}
                            {String(record.processingResults ?? "-")}
                          </div>
                          <div>
                            {STR.closingDate}
                            {record.closingDate ? String(record.closingDate) : "-"}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
