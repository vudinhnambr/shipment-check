const { google } = require("googleapis");

/**
 * Builds an authenticated Google Drive client using a service account.
 * The Drive files must be shared (Viewer) with the service account's email
 * (GOOGLE_SERVICE_ACCOUNT_EMAIL) - see README.md. Files stay "Restricted" (not
 * public) - only this one service account identity can read them.
 */
function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !rawKey) {
    throw new Error(
      "Missing GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY environment variables."
    );
  }
  const key = rawKey.replace(/\\n/g, "\n");
  return new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
}

/**
 * Downloads a Drive file's raw bytes (works for a real .xlsx binary file, NOT a
 * native Google Sheet - if the source is a Google Sheet, export it as xlsx first
 * or use drive.files.export instead).
 * @param {string} fileId
 * @returns {Promise<Buffer>}
 */
async function downloadDriveFile(fileId) {
  if (!fileId) {
    throw new Error("Missing Drive file id.");
  }
  const auth = getAuth();
  const drive = google.drive({ version: "v3", auth });
  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" }
  );
  return Buffer.from(res.data);
}

module.exports = { downloadDriveFile };
