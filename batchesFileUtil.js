const fs = require("fs").promises;


// MMID: AvayaCC_CCMM_7.1.2.1.19, DownloadPubID: MPLMM0013596  LatestDate: 20250826
// MMID: AvayaCC_WS_7.1.2.1.21, DownloadPubID: MPLMM0013595  LatestDate: 20250826
// MMID: AvayaCC_WS_7.1.2.1.22, DownloadPubID: MPLMM0013594  LatestDate: 20250826
// MMID: AvayaCC_CCMM_7.1.2.1.25, DownloadPubID: MPLMM0013593  LatestDate: 20250826
// MMID: AvayaOceana_OCPDB_3.9.0.0.12, DownloadPubID: MPLMM0013592  LatestDate: 20250822
// MMID: AvayaOceana_EngagementDesigner-3.9.0.0.1, DownloadPubID: MPLMM0013591  LatestDate: 20250821
// MMID: Avaya_ACM_9.1.0.1.10.55_Patch, DownloadPubID: MPLMM0013590  LatestDate: 20250820
// Extract "MMID" from a line like: "MMID: Avaya..., LatestDate: 20240101"
function extractMMID(line) {
  const m = line.match(/MMID:\s*(.+?)(?:,|$)/i);
  return m ? m[1].trim() : null;
}

function extractDownloadPubID(line) {
  const m = line.match(/DownloadPubID:\s*(MPLMM\d{7})/i);
  return m ? m[1].trim() : null;
}

// Read the next batch (up to batchSize lines) and return { batchLines, remainingLines }
async function getNextBatchFromFile(filePath, batchSize) {
  const raw = await fs.readFile(filePath, "utf8").catch(() => "");
  const lines = raw
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return { batchLines: [], remainingLines: [] };
  
  const batchLines = lines.slice(0, batchSize);
  const remainingLines = lines.slice(batchSize);
  await appendLinesToFile('processed_mmids.txt', batchLines);
  return { batchLines, remainingLines };
}

async function appendLinesToFile(filePath, lines) {
  const text = lines.join("\n") + (lines.length ? "\n" : "");
  await fs.appendFile(filePath, text, "utf8");
}

async function overwriteFile(filePath, lines) {
  const text = lines.join("\n") + (lines.length ? "\n" : "");
  await fs.writeFile(filePath, text, "utf8");
}

module.exports = {
  extractMMID,
  getNextBatchFromFile,
  overwriteFile,
  extractDownloadPubID
};
