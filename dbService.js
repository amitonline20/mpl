// dbService.js
const oracledb = require("oracledb");
const dbConfig = require("./dbConfig"); // adjust path
const path = require("path");
const fs = require("fs").promises;
const { getConnection, initPool, closePool } = require("./db");

// 1. Get all unique MMIDs with latest update date
async function getAllUniqueMMIDs() {
  let connection;
  try {
    connection = await getConnection();
    console.log("✅ Connected to Oracle DB.");

    const query = `
      SELECT m.MMM_MM_ID,
             MAX(m.MMM_UPDATE_DATE) AS LATEST_DATE,
             TO_CHAR(MAX(m.MMM_UPDATE_DATE), 'YYYYMMDD') AS LATEST_DATE_STR
      FROM PATCH.MM_MILESTONE m
      GROUP BY m.MMM_MM_ID
      ORDER BY MAX(m.MMM_UPDATE_DATE) DESC
    `;

    const result = await connection.execute(
      query,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    console.log(`🔍 Found ${result.rows.length} unique MMIDs.`);

   const data = result.rows.map((r, idx) => ({
    downloadPubID: `MPLMM${String(result.rows.length - idx).padStart(7, '0')}`,
    mmid: r.MMM_MM_ID,
    latestDateStr: r.LATEST_DATE_STR
}));

    // Format for text file (MMID + Date on each line)
    const fileContent = data
      .map(r => `MMID: ${r.mmid}, DownloadPubID: ${r.downloadPubID}  LatestDate: ${r.latestDateStr}`)
      .join("\n");

    const filePath = path.join(__dirname, "unique_mmids_pubid_desc.txt");
    await fs.writeFile(filePath, fileContent, "utf8");

    console.log(`📄 File written: ${filePath}`);
    return data;
  } catch (err) {
    console.error("❌ Error fetching unique MMIDs:", err);
    throw err;
  } finally {
    if (connection) {
      await connection.close();
      console.log("🔒 Oracle connection closed.");
    }
  }
}


// Returns the latest milestone date for a given MMID.
// Output: { date: Date, formatted: 'YYYYMMDD' } | null
async function getReleaseDate(mmdId, connection) {
  const query = `
    SELECT
      x.MMM_UPDATE_DATE AS MMM_UPDATE_DATE,
      TO_CHAR(x.MMM_UPDATE_DATE, 'YYYYMMDD') AS MM_DATE
    FROM (
      SELECT m.MMM_UPDATE_DATE
      FROM PATCH.MM_MILESTONE m
      WHERE m.MMM_MM_ID = :mmid
      ORDER BY m.MMM_UPDATE_DATE DESC
    ) x
    WHERE ROWNUM = 1
  `;

  const result = await connection.execute(
    query,
    { mmid: mmdId },                         
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );

  if (!result.rows || result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    date: row.MMM_UPDATE_DATE,  // JS Date object
    formatted: row.MM_DATE      // e.g., '20250818'
  };
}

// 3. Get dependent patches for an MMID
async function fetchDependentPatchs(mmid, connection) {
  const query = `
    SELECT MMD_MM_DEP_ID
    FROM PATCH.MM_DEPENDENCY
    WHERE MMD_MM_ID = :mmid
  `;

  const result = await connection.execute(
    query,
    { mmid }, // bind value
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );

  return result.rows;
}

async function getLast10UniqueMMIDs() {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    console.log("✅ Connected to Oracle DB.");

    const query = `
      SELECT mm.MMM_MM_ID,
             mm.LATEST_DATE,
             TO_CHAR(mm.LATEST_DATE, 'YYYYMMDD') AS LATEST_DATE_STR
      FROM (
        SELECT m.MMM_MM_ID, MAX(m.MMM_UPDATE_DATE) AS LATEST_DATE
        FROM PATCH.MM_MILESTONE m
        GROUP BY m.MMM_MM_ID
        ORDER BY MAX(m.MMM_UPDATE_DATE) DESC
      ) mm
      WHERE ROWNUM <= 10
    `;

    const result = await connection.execute(
      query,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    console.log(`🔍 Fetched ${result.rows.length} latest unique MMIDs.`);
    // Optional: normalize keys for downstream use
    return result.rows.map(r => ({
      mmid: r.MMM_MM_ID,
      latestDate: r.LATEST_DATE,          // JS Date
      latestDateStr: r.LATEST_DATE_STR    // 'YYYYMMDD'
    }));
  } catch (err) {
    console.error("❌ Error fetching last 10 unique MMIDs:", err);
    throw err;
  } finally {
    if (connection) {
      await connection.close();
      console.log("🔒 Oracle connection closed.");
    }
  }
}

// Fetch details for metadata (multimedia table + joins)
async function fetchDetailsForMMID(mmid, connection) {
  const query = `
    SELECT DISTINCT
      m.MM_ID,
      m.SUPERCEDED_BY,
      rt.RPS_TYPE_DESC,
      rs.RPS_STATUS_DESC,
      rc.RPS_CATEGORY_DESC,
      p.MMP_PRODUCT_NAME,
      p.MMP_PRODUCT_ID,
      t.MMI_TITLE_TEXT,
      m.MMR_RELEASE,
      mp.MMF_PLATFORM_NAME
    FROM PATCH.MULTIMEDIA m
    JOIN PATCH.RPS_TYPE rt ON rt.RPS_TYPE_ID = m.RPS_TYPE_ID
    JOIN PATCH.RPS_CATEGORY rc ON rc.RPS_CATEGORY_ID = m.RPS_CATEGORY_ID
    JOIN PATCH.RPS_STATUS rs ON rs.RPS_STATUS_ID = m.RPS_STATUS_ID
    JOIN PATCH.MM_PRODUCT p ON p.MMP_PRODUCT_ID = m.MMP_PRODUCT_ID
    JOIN PATCH.MM_PLATFORM mp ON mp.MMF_PLATFORM_ID = m.MMP_PLATFORM_ID
    JOIN PATCH.MM_TITLE t ON t.MMI_MM_ID = m.MM_ID
    LEFT JOIN PATCH.MM_TEXT mt ON mt.MMX_MM_ID = m.MM_ID
    WHERE UPPER(TRIM(m.MM_ID)) = UPPER(:mmid)
      AND p.MMP_PRODUCT_ID < 200
    ORDER BY m.MM_ID
  `;
  const result = await connection.execute(
    query,
    { mmid },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );

  console.log(`🔍 Fetched ${result.rows.length} detail rows for MMID: ${mmid}`);
  console.log('Details:', result.rows[0]);
  return result.rows;
}


// Fetch distinct MMIDs in a paginated way (Oracle 10g safe)
async function fetchDistinctMMIDs(connection, startRow, endRow) {
  const query = `
    SELECT * FROM (
      SELECT a.*, ROWNUM rnum FROM (
        SELECT DISTINCT MMD_MM_ID FROM MM_DATA ORDER BY MMD_MM_ID
      ) a
      WHERE ROWNUM <= :endRow
    )
    WHERE rnum >= :startRow
  `;

  const result = await connection.execute(
    query,
    { startRow, endRow },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );

  return result.rows.map(r => r.MMD_MM_ID);
}
async function fetchMMIDsFromLast(connection, startRow, endRow) {
  const query = `
    SELECT MMD_MM_ID FROM (
      SELECT MMD_MM_ID, ROWNUM rnum FROM (
        SELECT DISTINCT MMD_MM_ID
        FROM MM_DATA
        ORDER BY MMD_MM_ID DESC
      )
      WHERE ROWNUM <= :endRow
    )
    WHERE rnum >= :startRow
    ORDER BY MMD_MM_ID DESC
  `;

  const result = await connection.execute(
    query,
    { startRow, endRow },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );

  return result.rows.map(r => r.MMD_MM_ID);
}

// uncomment to get all unique MMIDs

async function processMMIDMeta(mmdId, connection, downloadPubID) {
  console.log(`📥 Processing MMID: ${mmdId}`);

  // Fetch details (metadata)
  const details = await fetchDetailsForMMID(mmdId, connection);
  const dependendPatch = await fetchDependentPatchs(mmdId, connection);

  if (!dependendPatch || dependendPatch.length === 0) {
    console.log(`⚠️ No dependent patches found for MMID: ${mmdId}`);
  } else {
    console.log(`🔗 Found dependent patches for MMID ${mmdId}:`, dependendPatch.map(p => p.MMD_MM_DEP_ID));
  }

  if (!details || details.length === 0) {
    console.log(`⚠️ No details found for MMID: ${mmdId}`);
    return;
  }

  console.log('Details fetched:', details[0]);

  const RPS_TYPE_DESC = details[0].RPS_TYPE_DESC || "Unknown Type";
  const MMP_PRODUCT_NAME = details[0].MMP_PRODUCT_NAME || "Unknown_Product";
  const MMR_RELEASE = details[0].MMR_RELEASE || "Unknown Release";
  const MMR_DETAILED_DESCRIPTION = details[0].MMI_TITLE_TEXT || "No Description Available";
  const MMR_RELEASE_DATE = await getReleaseDate(mmdId, connection) || { date: new Date(), formatted: "Unknown Date" };
  console.log(`📅 Release Date: ${MMR_RELEASE_DATE.formatted}`);


}
async function infoOnly(mmdId, downloadPubID) {
  await initPool(dbConfig);   // initialize pool
  let connection;
  try {
    connection = await getConnection();
    console.log("✅ Connected to Oracle DB.");

    // your main logic
    await processMMIDMeta(mmdId, connection, downloadPubID);

  } catch (err) {
    console.error("❌ Error in infoOnly:", err);
  } finally {
    if (connection) {
      await connection.close();   // return connection to pool
      console.log("🔌 Connection closed");
    }
    await closePool();   // clean shutdown since script ends
    console.log("✅ Pool closed, exiting");
  }
}


async function fetchReleasedPatches(connection) {
  const query = `
    SELECT m.MM_ID,
           rt.RPS_TYPE_DESC,
           rs.RPS_STATUS_DESC,
           rc.RPS_CATEGORY_DESC
    FROM   PATCH.MULTIMEDIA m
    JOIN   PATCH.RPS_TYPE rt     ON rt.RPS_TYPE_ID = m.RPS_TYPE_ID
    JOIN   PATCH.RPS_CATEGORY rc ON rc.RPS_CATEGORY_ID = m.RPS_CATEGORY_ID
    JOIN   PATCH.RPS_STATUS rs   ON rs.RPS_STATUS_ID = m.RPS_STATUS_ID
    WHERE  rs.RPS_STATUS_ID = 4 
   `;

  const result = await connection.execute(
    query,
    [],
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  console.log(`🔍 Found ${result.rows.length} released patches.`);
  result.rows.forEach(row => {
    console.log("📦 Patch MM_ID:", row.MM_ID);
  });
 
  return result.rows.map(r => r.MM_ID);
}






module.exports = {
  getAllUniqueMMIDs,
  getReleaseDate,
  fetchDependentPatchs,
  fetchDetailsForMMID,
  fetchReleasedPatches,
  processMMIDMeta,
  infoOnly
};
