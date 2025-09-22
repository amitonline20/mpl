const oracledb = require("oracledb");
const fs = require("fs").promises;
const path = require("path");
const dbConfig = require("./dbConfig");
const sftpConfigObject = require("./stpConfig");
const writeDownloadDetailsToExcel = require("./excelWriter");
const uploadToLinux = require("./uploadToLinux");
const genererateXML = require("./xmlWriter");
const {  getReleaseDate, fetchDependentPatchs, fetchDetailsForMMID, infoOnly ,fetchReleasedPatches } = require("./dbService");
const { fetchFileNameFromDB , saveFile  , zipFiles, fetchFilesFromDB } = require("./fileService");
const { extractMMID, getNextBatchFromFile, overwriteFile, extractDownloadPubID } = require("./batchesFileUtil");
const { getConnection, closePool, initPool } = require("./db");

const { LOCAL_FOLDER_FOR_PATCHES, PATCH_ACCESS, RESTRICTION_TYPE ,RECOVERABLE , PATCH_STATUS } = require("./contants");

const PORT = 3000;

oracledb.initOracleClient({ libDir: "C:\\instantclient_23_8" });

const MMID_FILE = path.join(__dirname, "unique_mmids.txt");
const BATCH_SIZE = 3;
const ONE_BATCH_ONLY = true;



const isRecoverableDbError = (err) =>
  !!err && (RECOVERABLE.some(code => (err.message || '').includes(code)) || err.fatal);

const delay = (ms) => new Promise(r => setTimeout(r, ms));

async function getFreshConnection() {
  try {
    const conn = await getConnection();  // your existing helper from the pool
    // optional health check (node-oracledb supports ping())
    if (typeof conn.ping === 'function') {
      await conn.ping();
    }
    return conn;
  } catch (e) {
    // pool might be stale; try to rebuild it once
    console.warn('⚠️ getConnection failed; rebuilding pool...', e.message);
    await initPool(dbConfig); // your existing init; make it idempotent
    const conn = await getConnection();
    if (typeof conn.ping === 'function') await conn.ping();
    return conn;
  }
}

async function runWithDbRetry(fn, { maxRetries = 3, baseDelayMs = 500 }) {
  let attempt = 0;
  while (true) {
    let conn;
    try {
      conn = await getFreshConnection();
      const res = await fn(conn);
      await conn.close();
      return res;
    } catch (err) {
      if (conn) try { await conn.close(); } catch {}
      if (attempt >= maxRetries || !isRecoverableDbError(err)) {
        throw err; // non-recoverable or out of retries
      }
      const wait = baseDelayMs * Math.pow(2, attempt); // 0.5s,1s,2s...
      console.warn(`🔁 DB error (attempt ${attempt + 1}/${maxRetries}): ${err.message}. Retrying in ${wait} ms...`);
      await delay(wait);
      attempt++;
    }
  }
}


/** ---------------- MAIN DOWNLOAD LOGIC ---------------- **/


async function processMMID(mmdId, connection, downloadPubID) {
  console.log(`📥 Processing MMID: ${mmdId}`);

  // --- Fetch metadata + dependencies ---
  const [details, dependendPatch] = await Promise.all([
    fetchDetailsForMMID(mmdId, connection),
    fetchDependentPatchs(mmdId, connection),
  ]);

  if (!dependendPatch?.length) {
    console.log(`⚠️ No dependent patches found for MMID: ${mmdId}`);
  } else {
    console.log(
      `🔗 Found dependent patches for MMID ${mmdId}:`,
      dependendPatch.map(p => p.MMD_MM_DEP_ID)
    );
  }

  if (!details?.length) {
    console.log(`⚠️ No details found for MMID: ${mmdId}`);
    return;
  }

  const {
    RPS_TYPE_DESC = "Unknown Type",
    MMP_PRODUCT_NAME = "Unknown_Product",
    MMR_RELEASE = "Unknown Release",
    MMI_TITLE_TEXT: MMR_DETAILED_DESCRIPTION = "No Description Available",
  } = details[0];

  const MMR_RELEASE_DATE =
    (await getReleaseDate(mmdId, connection)) || {
      date: new Date(),
      formatted: "Unknown Date",
    };
  console.log(`📅 Release Date: ${MMR_RELEASE_DATE.formatted}`);

  // --- Clean folder name ---
  const cleanProductName = MMP_PRODUCT_NAME
    .replace(/[^a-zA-Z\s]/g, "")
    .replace(/\s+/g, " ")
    .split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");

  const localFolderPath = path.join(
    __dirname,
    LOCAL_FOLDER_FOR_PATCHES,
    cleanProductName
  );
  await fs.mkdir(localFolderPath, { recursive: true });

  // --- Fetch filtered rows ---
  const rows = await fetchFilesFromDB(mmdId, connection);
  if (!rows.length) {
    console.error("No data to process (rows empty)");
    return;
  }

  const downloadedFiles = [];
  let PatchAccess;
  let RestrictionTypeCode;

  for (let i = 0; i < rows.length; i++) {
    const { MMD_FILENAME, MMD_DATA, MMD_EXT_VIEW } = rows[i];

    ({ PatchAccess, RestrictionTypeCode } = getPatchAccess(
      MMD_EXT_VIEW,
      RPS_TYPE_DESC
    ));

    const safeFilename = MMD_FILENAME || `file_${i + 1}`;
    const localFilePath = path.join(localFolderPath, safeFilename);

    console.log("Would download file:", safeFilename);
    console.log("Would download data size (bytes):", reportSize(MMD_DATA));

    try {
      await saveFile(localFilePath, MMD_DATA);
      downloadedFiles.push(localFilePath);
    } catch (err) {
      console.error(`❌ Failed to save file ${safeFilename}:`, err.message || err);
    }
  }

  // --- Zip files ---
  const zipFilePath = path.join(localFolderPath, `${downloadPubID}_all_files.zip`);
  const md5Checksum = await zipFiles(downloadedFiles, zipFilePath);

  // --- Write to Excel ---
  const relativeZipPath = path
    .relative(__dirname, zipFilePath)
    .replace(/\\/g, "/");

  console.log("📊 Writing download details to Excel: ", {
    downloadPubID,
    MMP_PRODUCT_NAME,
    MMR_RELEASE_DATE: MMR_RELEASE_DATE.formatted,
    relativeZipPath,
    PatchAccess,
    RestrictionTypeCode,
  });

  await writeDownloadDetailsToExcel(
    downloadPubID,
    MMP_PRODUCT_NAME,
    MMR_RELEASE_DATE.formatted,
    relativeZipPath,
    PatchAccess,
    RestrictionTypeCode
  );

  // --- XML ---
  const smalldescription = `PEPID : ${mmdId} Product : ${MMP_PRODUCT_NAME} `;

  const detailsDesc =
    sanitizeForXml(MMR_DETAILED_DESCRIPTION) +
    ` MD5: ${md5Checksum}` +
    (dependendPatch?.length
      ? ` Dependent patches: ${dependendPatch
          .map(p => p.MMD_MM_DEP_ID)
          .join(", ")}`
      : "");

  console.log("generating XML...", {
    downloadPubID,
    MMR_DETAILED_DESCRIPTION,
    RPS_TYPE_DESC,
    MMR_RELEASE,
    detailsDesc,
  });

  genererateXML({
    listCode: downloadPubID,
    es_download_name_description: smalldescription,
    es_download_description: detailsDesc,
    localized_es_download_name_desc: smalldescription,
    localized_es_download_description: detailsDesc,
    isActive: 1,
    displaySeq: 1,
    listBuildNumber: "3524.026",
    languageCode: "en",
    contextCode: "default",
  });

  // --- Optional upload ---
  const remoteDir = path.posix.join("/home/vakil/MPL", cleanProductName);
  // await uploadToLinux(zipFilePath, remoteDir, `${downloadPubID}_all_files.zip`, sftpConfigObject);
  // console.log(`🚀 Uploaded zip for MMID ${mmdId}`);
}

/** Helpers **/
function reportSize(data) {
  if (Buffer.isBuffer(data)) return `${data.length}`;
  if (typeof data === "string") return `${data.length}`;
  if (data && typeof data.length === "number") return `${data.length}`;
  if (data && typeof data.pipe === "function") return "stream (unknown)";
  if (data == null) return "null";
  return "unknown";
}

function sanitizeForXml(text) {
  if (!text) return "";
  return text
    .replace(/[\r\n]+/g, " ")
    .replace(/"/g, "'")
    .replace(/&gt(?!;)/g, "&gt;")
    .replace(/&lt(?!;)/g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/</g, "&lt;");
}

 function getPatchAccess(extView, patchStatusId) {
  const isExternal = extView?.toLowerCase() === "y";

  // Special case: Released + External
  if (isExternal && patchStatusId === PATCH_STATUS.RELEASED) {
    return {
      PatchAccess: PATCH_ACCESS.ALL_DOWNLOADS,
      RestrictionTypeCode: RESTRICTION_TYPE.NONE
    };
  }

  // All other cases
  return {
    PatchAccess: PATCH_ACCESS.AVAYA_ONLY_DOWNLOAD,
    RestrictionTypeCode: RESTRICTION_TYPE.ENTERPRISE
  };
}


async function downloadAll(patchID,downloadPubID) {
  await initPool(dbConfig);
  let connection;
  try {
    connection = await getConnection();
    console.log("✅ Connected to Oracle DB.");

    // If patchID is passed, process only that one and exit
    if (patchID) {
     await runWithDbRetry(
        (conn) => processMMID(patchID, conn, downloadPubID),
        { maxRetries: 4 }
      );
      console.log("🎉 Single patch download completed.");
      return;
    }

    while (true) {
  const { batchLines, remainingLines } = await getNextBatchFromFile(MMID_FILE, BATCH_SIZE);
  if (batchLines.length === 0) {
    console.log("✅ No more entries left in file.");
    break;
  }

  console.log(`🔹 Processing batch of ${batchLines.length}`);

  const mmids = batchLines.map(extractMMID).filter(Boolean);
  const downloadPubIDs = batchLines.map(extractDownloadPubID).filter(Boolean);

  let successCount = 0; // ✅ track how many succeeded

  for (let i = 0; i < mmids.length; i++) {
    const mmid = mmids[i];
    const downloadPubID = downloadPubIDs[i];
    console.log(`🔍 Processing MMID: ${mmid}, DownloadPubID: ${downloadPubID}`);

    try {
       await runWithDbRetry(
            (conn) => processMMID(mmid, conn, downloadPubID),
            { maxRetries: 4, baseDelayMs: 750 }
          );
      successCount++;  // ✅ increment only on success
    } catch (err) {
        if (isRecoverableDbError(err)) {
            // already retried inside runWithDbRetry; treat as failed item and continue
            console.error(`❌ MMID ${mmid} failed after retries: ${err.message}`);
          } else {
            console.error(`❌ Non-recoverable error on MMID ${mmid}: ${err.message}`);
            // stop the batch on non-recoverable errors only
            break;
          }
    }
  }

  if (successCount > 0) {
    // ✅ remove only successfully processed lines
    const newFileContents = [
      ...batchLines.slice(successCount), // keep unprocessed lines from this batch
      ...remainingLines                 // plus the rest of the file
    ];

    await overwriteFile(MMID_FILE, newFileContents);
    console.log(`✅ Processed ${successCount}. ${newFileContents.length} left in file.`);
  } else {
    console.log(`⚠️ No MMIDs processed in this batch. File not updated.`);
  }

  if (ONE_BATCH_ONLY) break;

  }

    
  } catch (err) {
    console.error("❌ Error in downloadAll:", err);
  } finally {
     if (connection) {
      await connection.close();   // ✅ returns connection to pool
    console.log("🔌 Connection closed");
  }
  }
}



(async () => {
  try {
    await downloadAll();
    //AvayaCC_CCMM_7.0.1.1.10	MPLMM0011178
    	//MMID: AvayaCC_CCCC_7.1.2.0.8, DownloadPubID: MPLMM0013020 

    //await infoOnly('AvayaCC_CCCC_7.1.2.0.8','MPLMM0013020')

  } catch (err) {
    console.error("❌ Error in main:", err);
  } finally {
    await closePool();   // ✅ cleanly shutdown pool when app ends
    console.log("✅ Pool closed, exiting");
  }
})();

// (
//   async () => {
//   await initPool(dbConfig);   // initialize pool
//   let connection;
//   try {
//     connection = await getConnection();
//     console.log("✅ Connected to Oracle DB.");
//       fetchReleasedPatches(connection);
//     } catch (err) {
//       console.error("❌ Error in main:", err);
//     }
//       finally {
//       if (connection) {
//         await connection.close();   // return connection to pool
//         console.log("🔌 Connection closed");
//       }
//   }
// }


//)();





