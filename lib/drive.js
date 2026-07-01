const { google } = require("googleapis");

/**
 * Reads the whole service account key (the JSON file Google Cloud gives you when
 * you create a key) from ONE base64-encoded environment variable
 * (GOOGLE_SERVICE_ACCOUNT_KEY_B64). Storing it as base64 avoids the classic
 * "private key has broken newlines" problem that happens when pasting a raw PEM
 * key (with \n escapes) into a plain text box like Vercel's env var UI - base64
 * has no special characters, so copy/paste can't corrupt it.
 * See README.md for how to generate this value.
 */
function getCredentials() {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_B64;
  if (!b64) {
    throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_KEY_B64 environment variable.");
  }
  let json;
  try {
    json = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
  } catch (err) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_KEY_B64 is not valid base64-encoded JSON: " + err.message
    );
  }
  if (!json.client_email || !json.private_key) {
    throw new Error(
      "Decoded service account JSON is missing client_email/private_key."
    );
  }
  return json;
}

function getAuth() {
  const { client_email, private_key } = getCredentials();
  return new google.auth.JWT({
    email: client_email,
    key: private_key,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
}

const GOOGLE_SHEET_MIME = "application/vnd.google-apps.spreadsheet";
const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Downloads a Drive file's bytes as an .xlsx buffer, regardless of whether the
 * file is a real uploaded .xlsx (downloaded directly) or a native Google Sheet
 * (exported to .xlsx format) - detected automatically via the file's mimeType,
 * so you don't need to know/track which type each file is.
 * @param {string} fileId
 * @returns {Promise<Buffer>}
 */
async function downloadDriveFile(fileId) {
  if (!fileId) {
    throw new Error("Missing Drive file id.");
  }
  const auth = getAuth();
  const drive = google.drive({ version: "v3", auth });

  const meta = await drive.files.get({ fileId, fields: "mimeType,name" });
  const mimeType = meta.data.mimeType;

  if (mimeType === GOOGLE_SHEET_MIME) {
    const res = await drive.files.export(
      { fileId, mimeType: XLSX_MIME },
      { responseType: "arraybuffer" }
    );
    return Buffer.from(res.data);
  }

  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" }
  );
  return Buffer.from(res.data);
}

module.exports = { downloadDriveFile };
