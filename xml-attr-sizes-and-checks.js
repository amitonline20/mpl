#!/usr/bin/env node
/**
 * Usage:
 *   node xml-attr-sizes-and-checks.js ./sample.xml
 *
 * What it does:
 * - For every element, prints each attribute's value length (characters).
 * - Additionally, points out (lists) CODEs where:
 *     A) LIST_NAME == "ES_DOWNLOAD_NAME" and DESCRIPTION length > 80
 *     B) LIST_NAME == "ES_DOWNLOAD_DESCRIPTION" and DESCRIPTION length > 1900
 */
const fs = require("fs");
const path = require("path");
const { DOMParser } = require("@xmldom/xmldom");

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: node xml-attr-sizes-and-checks.js <xml-file>");
  process.exit(1);
}

const xmlSource = fs.readFileSync(path.resolve(filePath), "utf8");
const doc = new DOMParser().parseFromString(xmlSource, "text/xml");

const flaggedA = []; // ES_DOWNLOAD_NAME + desc > 80
const flaggedB = []; // ES_DOWNLOAD_DESCRIPTION + desc > 1900

function getAttr(node, name) {
  if (!node || node.nodeType !== 1 || !node.hasAttributes()) return undefined;
  const a = node.getAttribute(name);
  return a === null ? undefined : a;
}

function printAttrLengths(node) {
  if (node.nodeType === 1) {
    console.log(`Element: ${node.nodeName}`);
    if (node.attributes && node.attributes.length > 0) {
      for (let i = 0; i < node.attributes.length; i++) {
        const attr = node.attributes.item(i);
        const value = attr.nodeValue || "";
        console.log(
          `  Attribute: ${attr.nodeName} | Length: ${value.length} chars`
        );
      }
    }

    // Checks
    const listName = getAttr(node, "LIST_NAME") || getAttr(node, "LISTNAME");
    const desc = getAttr(node, "DESCRIPTION") || "";
    const code = getAttr(node, "CODE") || "";

    const len = desc.length;

    if (listName === "ES_DOWNLOAD_NAME" && len > 80) {
      flaggedA.push({ code, listName, descLen: len });
    }
    if (listName === "ES_DOWNLOAD_DESCRIPTION" && len > 1900) {
      flaggedB.push({ code, listName, descLen: len });
    }
  }

  for (let c = node.firstChild; c; c = c.nextSibling) {
    printAttrLengths(c);
  }
}

printAttrLengths(doc);

// Report
console.log("\n=== FLAGS ===");
console.log("A) LIST_NAME == ES_DOWNLOAD_NAME and DESCRIPTION length > 90");
if (flaggedA.length === 0) {
  console.log("  None");
} else {
  for (const f of flaggedA) {
    console.log(`  CODE=${f.code} | LIST_NAME=${f.listName} | DESCRIPTION_LEN=${f.descLen}`);
  }
}

console.log("\nB) LIST_NAME == ES_DOWNLOAD_DESCRIPTION and DESCRIPTION length > 1900");
if (flaggedB.length === 0) {
  console.log("  None");
} else {
  for (const f of flaggedB) {
    console.log(`  CODE=${f.code} | LIST_NAME=${f.listName} | DESCRIPTION_LEN=${f.descLen}`);
  }
}
