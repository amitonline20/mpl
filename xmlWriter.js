const fs = require("fs");
const path = require("path");

function generateXML({
  configType = "ListValues",
  source = "PoeticInstance",
  buildNumber = "",
  listCode,
  isActive = -1,
  displaySeq = 1,
  listBuildNumber,
  es_download_name_description,
  es_download_description,
  localized_es_download_name_desc,
  localized_es_download_description,
  languageCode,
  contextCode,
}) {
  // add some more logs
  console.log("Generating XML with:", {
    configType,
    source,
    buildNumber,
    listCode,
    isActive,
    displaySeq,
    listBuildNumber,
    es_download_name_description,
    es_download_description,
    localized_es_download_name_desc,
    localized_es_download_description,
    languageCode,
    contextCode,
  });
      
    
  const filePath = path.join(__dirname, "mplplds.xml");

  // Template for the new block
  const newBlock = `
    <LISTVALUE CODE="${listCode}"
               LIST_NAME="ES_DOWNLOAD_NAME"
               IS_ACTIVE="${isActive}"
               DISPLAY_SEQUENCE="${displaySeq}"
               BUILD_NUMBER="${listBuildNumber}"
               DESCRIPTION="${es_download_name_description}" />
    <LISTVALUE CODE="${listCode}"
               LIST_NAME="ES_DOWNLOAD_DESCRIPTION"
               IS_ACTIVE="${isActive}"
               DISPLAY_SEQUENCE="${displaySeq}"
               BUILD_NUMBER="${listBuildNumber}"
               DESCRIPTION="${es_download_description}" />
    <LISTLOCALIZATION CODE="${listCode}"
                      LOCALIZED_DESCRIPTION="${localized_es_download_name_desc}"
                      LIST_NAME="ES_DOWNLOAD_NAME"
                      IS_ACTIVE="${isActive}"
                      DISPLAY_SEQUENCE="${displaySeq}"
                      BUILD_NUMBER="${listBuildNumber}"
                      LANGUAGE_CODE="${languageCode}"
                      CONTEXT_CODE="${contextCode}" />
    <LISTLOCALIZATION CODE="${listCode}"
                      LOCALIZED_DESCRIPTION="${localized_es_download_description}"
                      LIST_NAME="ES_DOWNLOAD_DESCRIPTION"
                      IS_ACTIVE="${isActive}"
                      DISPLAY_SEQUENCE="${displaySeq}"
                      BUILD_NUMBER="${listBuildNumber}"
                      LANGUAGE_CODE="${languageCode}"
                      CONTEXT_CODE="${contextCode}" />
  `;

if (!fs.existsSync(filePath) || !fs.readFileSync(filePath, "utf8").trim()) {
    // File does not exist or is blank, write initial XML structure
    const xmlContent = `<?xml version="1.0"?>
<POETICCONFIGURATION>
  <ENVELOPE CONFIGTYPE="${configType}"
            SOURCE="${source}"
            BUILDNUMBER="${listBuildNumber}" />
  <LISTVALUES>
    ${newBlock}
  </LISTVALUES>
</POETICCONFIGURATION>`;
    fs.writeFileSync(filePath, xmlContent, "utf8");
    console.log(`✅ XML created: ${filePath}`);
    return;
  }

  // File exists and is not blank
  let existing = fs.readFileSync(filePath, "utf8");

  // Regex to match all blocks for the given listCode
  const blockRegex = new RegExp(
    `<LISTVALUE CODE="${listCode}".*?/>[\\s\\r\\n]*<LISTVALUE CODE="${listCode}".*?/>[\\s\\r\\n]*<LISTLOCALIZATION CODE="${listCode}".*?/>[\\s\\r\\n]*<LISTLOCALIZATION CODE="${listCode}".*?/>`,
    "gs"
  );

  let updated;
  if (blockRegex.test(existing)) {
    // Replace existing block
    updated = existing.replace(blockRegex, newBlock.trim());
    console.log(`🔄 Replaced block for listCode: ${listCode}`);
  } else {
    // Insert before </LISTVALUES>
    updated = existing.replace(
      /<\/LISTVALUES>/,
      `${newBlock}\n  </LISTVALUES>`
    );
    console.log(`➕ Appended new block for listCode: ${listCode}`);
  }


    fs.writeFileSync(filePath, updated, "utf8");
    console.log(`✅ XML updated with new LISTVALUE: ${filePath}`);
  }


// // Example usage
// generateXML({
//   configType: "dummy",
//   source: "dummy",
//   buildNumber: "4432.dummy",
//   listCode: "dummy1",
//   listName: "dummy",
//   isActive: "-1",
//   displaySeq: "1",
//   listBuildNumber: "3131.001",
//   nameDescription:
//     "This is the name of the download up to 80 char in total length. EJSIQ000000002",
//   descDescription:
//     "This is the description of the download with a max length of 1900 char. EJSIQ000000002",
//   localizedName:
//     "This is the name of the download up to 80 char in total len. EJSIQ000000002 EN",
//   localizedDesc:
//     "This is the description of the download with a max length of 1900 char. EJSIQ000000002 EN",
//   languageCode: "EN",
//   contextCode: "DEFAULT",
// });

module.exports = generateXML;
