const fs = require("fs").promises;
const path = require("path");
const oracledb = require("oracledb");
const AdmZip = require("adm-zip");
const crypto = require("crypto");




/** ---------------- DB QUERIES ---------------- **/
function filterExactRows(rows, mmdId) {
  if (!rows) return [];
  return rows.filter(r =>
    typeof r.MMD_MM_ID === "string" &&
    (r.MMD_MM_ID === mmdId || r.MMD_MM_ID.startsWith(`${mmdId}_`))
  );
}
// Fetch all files for one MMID
async function fetchFilesFromDB(mmdId, connection) {
  const query = `
    SELECT MMD_FILENAME, MMD_MM_ID, MMD_DATA, MMD_EXT_VIEW
    FROM PATCH.MM_DATA
    WHERE MMD_MM_ID LIKE :pattern
    ORDER BY MMD_FILENAME
  `;

  try {
    const result = await connection.execute(
      query,
      { pattern: `${mmdId}%` }, // broad LIKE
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (!result.rows || result.rows.length === 0) {
      console.log("⚠️ No rows returned for", mmdId);
      return [];
    }

    console.log("📊 Rows before filtering:", result.rows.length);

    const filtered = filterExactRows(result.rows, mmdId);

    console.log("✅ Rows after filtering:", filtered.length);
    filtered.forEach(r => console.log("   Keeping:", r.MMD_MM_ID, r.MMD_FILENAME));

    return filtered;
  } catch (err) {
    console.error(`❌ DB error for MMID ${mmdId}:`, err.message || err);
    return [];
  }
}
// Fetch all files for one MMID
async function fetchFileNameFromDB(mmdId, connection) {
  const query = `
    SELECT MMD_FILENAME, MMD_DATA, MMD_EXT_VIEW
  FROM MM_DATA
  WHERE MMD_MM_ID LIKE :pattern
    AND LOWER(MMD_FILENAME) NOT LIKE '%.zip'
  ORDER BY MMD_FILENAME
  `;

  try {
    const result = await connection.execute(
      query,
      { pattern: `${mmdId}%` },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    return result.rows; // each row has { MMD_FILENAME, MMD_DATA }
  } catch (err) {
    console.error(`❌ DB error for MMID ${mmdId}:`, err.message);
    return [];
  }
}

/** ---------------- FILE HANDLING ---------------- **/

async function saveFile(localFilePath, fileData) {
  const fsSync = require("fs"); // for createWriteStream
  if (fileData instanceof oracledb.Lob) {
    await new Promise((resolve, reject) => {
      const outStream = fsSync.createWriteStream(localFilePath);
      let totalBytes = 0;
      fileData.on("data", (chunk) => {
        totalBytes += chunk.length;
        process.stdout.write(`Downloading ${localFilePath}: ${totalBytes} bytes\r`);
      });
      fileData.on("end", () => {
        console.log(`\n✅ Download complete: ${localFilePath}`);
        resolve();
      });
      fileData.on("error", reject);
      fileData.pipe(outStream);
    });
  } else if (Buffer.isBuffer(fileData)) {
    await fs.writeFile(localFilePath, fileData);
    console.log(`✅ File saved: ${localFilePath}`);
  } else {
    throw new Error(`Unknown data type for file: ${localFilePath}`);
  }
}

async function zipFiles(files, zipFilePath) {
  const zip = new AdmZip();
  files.forEach((file) => zip.addLocalFile(file));
  zip.writeZip(zipFilePath);
  console.log(`✅ Created zip: ${zipFilePath}`);

   // Step 2: Generate MD5 checksum
  const fileBuffer = await fs.readFile(zipFilePath);
  const checksum = crypto.createHash("md5").update(fileBuffer).digest("hex");
  console.log(`🔑 MD5 checksum: ${checksum}`);


   for (const file of files) {
    try {
      await fs.unlink(file);
      console.log(`🗑️ Deleted original file: ${file}`);
    } catch (err) {
      console.error(`❌ Failed to delete file ${file}:`, err.message);
    }
  }

  return checksum; // return if you want to store/verify later

}

/** ---------------- MAIN DOWNLOAD LOGIC ---------------- **/





module.exports = {
    fetchFilesFromDB,
    fetchFileNameFromDB,
    saveFile,
    zipFiles
    };