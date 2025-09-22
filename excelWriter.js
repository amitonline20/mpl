const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

async function writeDownloadDetailsToExcel(uniqueProductId, MMP_PRODUCT_NAME, MMR_RELEASE_DATE, zipFilePath, PatchAccess, RestrictionTypeCode) {

  console.log('writeDownloadDetailsToExcel called with:', {
    uniqueProductId,
    MMP_PRODUCT_NAME,
    MMR_RELEASE_DATE,
    zipFilePath,
    PatchAccess,
    RestrictionTypeCode
  });
  
  const excelFile = path.resolve('define-download-loads.xlsx');
  const sheetName = 'Downloads';

  try {
    // Check if file is busy before doing anything
    try {
      fs.openSync(excelFile, 'r+');
    } catch (err) {
      if (err.code === 'EBUSY') {
        console.error(`❌ File is busy or locked: ${excelFile}. Please close the file if it's open in another program and try again.`);
        return;
      }
    }

    console.log(`📄 Writing download details for:
      ID: ${uniqueProductId}
      Product: ${MMP_PRODUCT_NAME}
      Zip Path: ${zipFilePath}`);

    const workbook = new ExcelJS.Workbook();
    let sheet;

    // Load or create workbook/sheet
    if (fs.existsSync(excelFile)) {
      await workbook.xlsx.readFile(excelFile);
      sheet = workbook.getWorksheet(sheetName) || workbook.addWorksheet(sheetName);
      defineColumns(sheet);
    } else {
      sheet = workbook.addWorksheet(sheetName);
      defineColumns(sheet);
    }

    // Get file size in MB
    const stats = await fs.promises.stat(zipFilePath);
    const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);

    // Convert to relative forward-slash path for Excel
    const fileNameForExcel = path.relative(process.cwd(), zipFilePath).replace(/\\/g, "/");

    // Remove existing rows with the same uniqueProductId
    let deletedCount = 0;
    for (let i = sheet.rowCount; i >= 1; i--) {
      const row = sheet.getRow(i);
      if (row.getCell('downloadPubID').value === uniqueProductId) {
        sheet.spliceRows(i, 1);
        deletedCount++;
        console.log(`🗑️ Deleted row #${i} with downloadPubID: ${uniqueProductId}`);
      }
    }
    if (deletedCount > 0) {
      console.log(`✅ Deleted ${deletedCount} existing row(s) with downloadPubID: ${uniqueProductId}`);
    }

    // Add the new row
    sheet.addRow({
      downloadPubID: uniqueProductId,
      nameCode: uniqueProductId,
      descriptionCode: uniqueProductId,
      detailsBaseName: uniqueProductId,
      statusCode: 'ACTIV',
      restrictionTypeCode: RestrictionTypeCode,
      releaseDate: MMR_RELEASE_DATE,
      typeCode: 'A1SOFTDOWN',
      productLineCode: 'MPLMM',
      priorityCode: 'XPXX',
      sizeInMB,
      fileName: fileNameForExcel,
      isSuggest: 'F',
      maxDownloads: 999999,
      pluginCode: 'CLOUDFLARE',
      maxDuration: 999999,
      listLinkedProducts: PatchAccess,
    });

    // Save the workbook
    await workbook.xlsx.writeFile(excelFile);
    console.log(`✅ Row appended to '${excelFile}'`);
  } catch (err) {
    console.error('❌ Error writing to Excel file:', err);
  }
}


function defineColumns(sheet) {
  sheet.columns = [
    { header: 'downloadPubID', key: 'downloadPubID' },
    { header: 'nameCode', key: 'nameCode' },
    { header: 'statusCode', key: 'statusCode' },
    { header: 'releaseDate', key: 'releaseDate' },
    { header: 'typeCode', key: 'typeCode' },
    { header: 'productLineCode', key: 'productLineCode' },
    { header: 'priorityCode', key: 'priorityCode' },
    { header: 'sizeInMB', key: 'sizeInMB' },
    { header: 'isSuggest', key: 'isSuggest' },
    { header: 'descriptionCode', key: 'descriptionCode' },
    { header: 'detailsBaseName', key: 'detailsBaseName' },
    { header: 'isvProperty1', key: 'isvProperty1' },
    { header: 'isvProperty2', key: 'isvProperty2' },
    { header: 'isvProperty3', key: 'isvProperty3' },
    { header: 'isvProperty4', key: 'isvProperty4' },
    { header: 'isvProperty5', key: 'isvProperty5' },
    { header: 'isvProperty6', key: 'isvProperty6' },
    { header: 'isvProperty7', key: 'isvProperty7' },
    { header: 'isvProperty8', key: 'isvProperty8' },
    { header: 'isvProperty9', key: 'isvProperty9' },
    { header: 'isvProperty10', key: 'isvProperty10' },
    { header: 'restrictionTypeCode', key: 'restrictionTypeCode' },
    { header: 'maxDownloads', key: 'maxDownloads' },
    { header: 'maxDuration', key: 'maxDuration' },
    { header: 'pluginCode', key: 'pluginCode' },
    { header: 'fileName', key: 'fileName' },
    { header: 'listLinkedProducts', key: 'listLinkedProducts' }
  ];
}


// writeDownloadDetailsToExcel(
//   'MPLMM1756200861776',
//   'Avaya Oceana one',
//   '20250820',
//    'MPL/AvayaOceana/MPLMM1756200861776_all_files.zip'
// );


module.exports = writeDownloadDetailsToExcel;
