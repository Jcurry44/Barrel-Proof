#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const {
  inferBottleKind,
  mergeCatalogRecords,
  normalizeWhitespace,
  parseCurrency,
  slugify,
  unique
} = require("../src/logic/catalog.js");

const SOURCE = {
  id: "utah_dabs_product_list",
  name: "Utah DABS Product List",
  url: "https://abs.utah.gov/shop-products/interactive-product-list/",
  region: "UT",
  sourceType: "control_state_catalog"
};

const STATUS_LABELS = {
  "1": "General distribution product",
  D: "Discontinued general distribution product",
  L: "Limited high-end product",
  X: "Discontinued limited product",
  A: "Allocated product",
  U: "Unavailable shortly",
  S: "Special order only",
  N: "Unavailable general item",
  T: "Trial product"
};

const BOURBON_CLASSES = new Set(["AWH", "AWK"]);
const SERIOUS_WHISKEY_CLASSES = new Set([
  "AWH",
  "AWK",
  "AWS",
  "AWR",
  "AWB",
  "AWU",
  "AWN",
  "AWX",
  "AWW",
  "AWE"
]);

function parseArgs(argv) {
  const args = {
    mode: "serious"
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input") args.input = argv[++i];
    if (arg === "--out") args.out = argv[++i];
    if (arg === "--mode") args.mode = argv[++i];
  }

  return args;
}

function parseUtahDabsXlsx(buffer, options = {}) {
  const rows = readXlsxRows(buffer, "xl/worksheets/sheet1.xml");
  return parseUtahDabsRows(rows, options);
}

function parseUtahDabsRows(rows, options = {}) {
  const retrievedAt = options.retrievedAt || new Date().toISOString();
  const headerIndex = rows.findIndex((row) => row.includes("CSC") && row.includes("Description"));
  if (headerIndex < 0) return [];

  const headers = rows[headerIndex].map(normalizeWhitespace);
  const index = Object.fromEntries(headers.map((header, columnIndex) => [header, columnIndex]));

  return rows.slice(headerIndex + 1)
    .map((row) => normalizeUtahDabsRow(row, index, { retrievedAt }))
    .filter(Boolean)
    .filter((row) => includeRow(row, options.mode || "serious"));
}

function normalizeUtahDabsRow(row, index, options = {}) {
  const value = (field) => index[field] >= 0 ? normalizeWhitespace(row[index[field]]) : "";
  const csc = value("CSC");
  const description = value("Description");
  if (!csc || !description) return null;

  const classCode = value("Class");
  const className = value("Class name");
  const size = normalizeSizeMl(value("Size"));

  return {
    sourceId: SOURCE.id,
    sourceRecordId: csc,
    csc,
    name: cleanProductName(description, size),
    rawName: description,
    category: inferUtahCategory(description, classCode, className, value("Dept Name")),
    sourceCategory: className || value("Dept Name") || value("Div Name"),
    div: value("Div"),
    dept: value("Dept"),
    classCode,
    divName: value("Div Name"),
    deptName: value("Dept Name"),
    className,
    size,
    retailPrice: parseCurrency(value("Retail Price")),
    itemStatus: value("Item Status"),
    itemStatusLabel: STATUS_LABELS[value("Item Status")] || value("Item Status"),
    onSpa: value("On Spa"),
    vendorName: cleanVendorName(value("Vendor Name")),
    vendorCode: value("Vendor Cd"),
    sourceUrl: SOURCE.url,
    region: SOURCE.region,
    retrievedAt: options.retrievedAt || new Date().toISOString()
  };
}

function includeRow(row, mode) {
  if (mode === "all") return true;

  const categoryText = [
    row.className,
    row.deptName,
    row.name,
    row.rawName
  ].join(" ").toLowerCase();
  const isWhiskeyDept = [row.className, row.deptName].join(" ").toLowerCase().includes("whiskey");

  if (looksLikeNonSeriousWhiskey(row, categoryText)) return false;
  if (mode === "whiskey") return isWhiskeyDept || isSeriousWhiskeyName(categoryText);
  if (mode === "bourbon") return BOURBON_CLASSES.has(row.classCode) || (isWhiskeyDept && categoryText.includes("bourbon"));
  return SERIOUS_WHISKEY_CLASSES.has(row.classCode);
}

function looksLikeNonSeriousWhiskey(row, text) {
  const classText = [row.classCode, row.className, row.deptName].join(" ").toUpperCase();
  const isHoneyCask = /\bhoney\s+(?:barrels?|casks?)\b|\b(?:aged|finished)\s+in\s+honey\s+barrels?\b/i.test(text);
  const isMapleCask = /\bmaple\s+(?:syrup\s+)?(?:barrels?|casks?)\b|\b(?:aged|finished)\s+in\s+maple\s+(?:syrup\s+)?barrels?\b/i.test(text);

  if (/\bFLAVORED\b/i.test(classText)) return true;
  if (/\bhoney\b/i.test(text) && !isHoneyCask) return true;
  if (/\bmaple\b/i.test(text) && !isMapleCask) return true;

  return [
    /\bapple\b/,
    /\bbanana\b/,
    /\bblackberry\b/,
    /\bblueberry\b/,
    /\bbutterscotch\b/,
    /\bcandy\b/,
    /\bcaramel\b/,
    /\bcherry\b/,
    /\bchocolate\b/,
    /\bcinnamon\b/,
    /\bcoconut\b/,
    /\bcocktails?\b/,
    /\bcoffee\b/,
    /\bcream\b/,
    /\bcreamsicle\b/,
    /\bflavo(?:u)?red\b/,
    /\bgingerbread\b/,
    /\bglasses\b/,
    /\bliqueur\b/,
    /\blemon(?:ade|-drop)\b/,
    /\bmocha\b/,
    /\bmoonshine\b/,
    /\bmoon\s*shine\b/,
    /\bmshine\b/,
    /\bnatural\s+flavou?rs?\b/,
    /\bold\s+fashion(?:ed)?\b/,
    /\bpeach\b/,
    /\bpeanut\s+butter\b/,
    /\bpecan\b/,
    /\bpickle\b/,
    /\bpineapple\b/,
    /\bpumpkin\b/,
    /\bpumpkins\b/,
    /\bpeppermint\b/,
    /\brtd\b/,
    /\brumple\b/,
    /\bsalted\b/,
    /\bspiced\b/,
    /\bstrawberry\b/,
    /\btea\b/,
    /\bvanilla\b/,
    /\bvap\b/,
    /\bwatermelon\b/,
    /\b(?:2pk|3pk|4\s*pack|6\s*pack|12\s*pack|gift|pack|sampler|variety\s+pack)\b/
  ].some((pattern) => pattern.test(text));
}

function isSeriousWhiskeyName(text) {
  return /\b(whisk(?:e)?y|whisky|bourbon|rye|tennessee|single\s+malt|scotch|canadian|found\s+north)\b/i.test(text);
}

function inferUtahCategory(rawName, classCode, className, deptName) {
  const text = [rawName, classCode, className, deptName].join(" ").toLowerCase();
  const nameText = normalizeWhitespace(rawName).toLowerCase();
  const code = normalizeWhitespace(classCode).toUpperCase();
  const sourceCategory = normalizeWhitespace(className).toUpperCase();

  if (/\bjapanese\b.*\bwhisk(?:e)?y\b|\b(akashi|akkeshi|yamazaki|hakushu|hibiki|chichibu|nikka|tottori)\b/i.test(text)) return "Japanese Whisky";
  if (/\b(amrut|kavalan|paul\s+john|starward|mackmyra|penderyn|english\s+whisk(?:e)?y)\b/i.test(text)) return "Single Malt / World Whisky";
  if (code === "AWS" || code === "AWR" || /\bscotch\b/i.test(sourceCategory)) return "Scotch Whisky";
  if (code === "AWN" || /\birish\b/i.test(sourceCategory)) return "Irish Whiskey";
  if (code === "AWB" && /\brye\b/i.test(text)) return "Rye Whiskey";
  if (code === "AWB" || /\bcanadian\b/i.test(sourceCategory)) return "Canadian Whisky";
  if (code === "AWX") return "Single Malt / World Whisky";
  if (code === "AWU" || /\brye\s+whisk(?:e)?y\b|\bstraight\s+rye\b|\brye\b/i.test(text)) return "Rye Whiskey";
  if (/\bamerican\s+single\s+malt\b/i.test(text)) return "American Single Malt";
  if (/\bw\.?\s*l\.?\s+weller\b|\bweller\b|\bwheated?\b.*\bbourbon\b|\bbourbon\b.*\bwheated?\b/i.test(nameText)) return "Wheated Bourbon";
  if (/\bbib\b.*\bbourbon\b|\bbottled\s+in\s+bond\b.*\bbourbon\b|\bbourbon\b.*\bbottled\s+in\s+bond\b|\bbib\b/i.test(nameText)) return "Bottled in Bond Bourbon";
  if (/\btennessee\b|\bjack\s+daniel|\bdickel\b|\buncle\s+nearest\b/i.test(nameText)) return "Tennessee Whiskey";
  if (BOURBON_CLASSES.has(code) || /\bbourbon\b/i.test(nameText)) return "Bourbon";
  if (/\bwheat\s+whisk(?:e)?y\b|\bbib\s+wheat\b|\bstraight\s+wheat\b/i.test(nameText)) return "Wheat Whiskey";
  if (/\bcorn\s+whisk(?:e)?y\b/i.test(nameText)) return "American Whiskey";
  if (code === "AWE" || /\bblended\s+whisk(?:e)?y\b|\bblended\s+whisky\b/i.test(text)) return "Blended Whiskey";
  if (code === "AWW" || /\bamerican\s+whisk(?:e)?y\b|\blight\s+whisk(?:e)?y\b/i.test(text)) return "American Whiskey";
  if (/\bwhisk(?:e)?y\b|\bwhisky\b/i.test(text)) return "Whiskey";
  return titleCaseProductName(className || deptName || "");
}

function normalizeSizeMl(value) {
  const parsed = Number(normalizeWhitespace(value).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(parsed)) return null;
  if (parsed === 1000) return "1L";
  if (parsed === 1750) return "1.75L";
  return parsed + "ml";
}

function cleanProductName(description, size) {
  const cleanDescription = normalizeWhitespace(description);
  const sizeDigits = normalizeWhitespace(size || "").replace(/[^0-9]/g, "");
  const withoutSize = sizeDigits
    ? cleanDescription.replace(new RegExp("\\s+" + sizeDigits + "\\s*(?:ml|m)?$", "i"), "")
    : cleanDescription;
  const title = titleCaseProductName(withoutSize);
  return title || cleanDescription.replace(size || "", "").trim();
}

function cleanVendorName(value) {
  return titleCaseProductName(
    normalizeWhitespace(value)
      .replace(/\s*\([^)]*\)/g, "")
      .replace(/\s+\([^)]*$/g, "")
      .replace(/\s{2,}/g, " ")
      .trim()
  );
}

function titleCaseProductName(value) {
  const clean = normalizeWhitespace(value);
  if (!clean) return "";
  if (/[a-z]/.test(clean)) return clean;

  return clean.toLowerCase().replace(/\b([a-z0-9']+)\b/g, (word) => {
    if (/^\d+(yr|yo|pr|pf)$/.test(word)) return word.toUpperCase();
    if (["bib", "btb", "rtd", "sb", "sm"].includes(word)) return word.toUpperCase();
    if (word === "co") return "Co";
    if (["and", "by", "in", "of", "on", "to"].includes(word)) return word.slice(0, 1).toUpperCase() + word.slice(1);
    if (word.length <= 2 && /^[a-z]+$/.test(word)) return word.toUpperCase();
    return word.slice(0, 1).toUpperCase() + word.slice(1);
  });
}

function normalizeUtahDabsBottle(record) {
  const fields = [
    "csc",
    "name",
    "classCode",
    "className",
    "sourceCategory",
    "size",
    "retailPrice",
    "itemStatus",
    "onSpa",
    "vendorName"
  ];

  const normalized = {
    id: slugify([record.name, record.size, record.csc].filter(Boolean).join(" ")),
    identityKey: makeUtahIdentityKey(record),
    name: record.name,
    producer: record.vendorName,
    supplier: record.vendorName,
    category: record.category,
    bottleKind: inferBottleKind({ name: record.name, category: record.category }),
    proof: null,
    age: "Unknown",
    ageYears: null,
    size: record.size,
    aliases: unique([record.name, record.rawName, record.csc]),
    sourceRefs: [
      {
        sourceId: SOURCE.id,
        sourceRecordId: record.csc,
        sourceUrl: SOURCE.url,
        retrievedAt: record.retrievedAt,
        fields
      }
    ],
    prices: []
  };

  if (Number.isFinite(record.retailPrice)) {
    normalized.prices.push({
      sourceId: SOURCE.id,
      region: SOURCE.region,
      retailPrice: record.retailPrice,
      size: record.size,
      status: record.itemStatusLabel,
      onSpa: record.onSpa,
      retrievedAt: record.retrievedAt
    });
  }

  return normalized;
}

function makeUtahIdentityKey(record) {
  return [
    slugify(record.name),
    slugify(record.size || ""),
    slugify(record.csc)
  ].filter(Boolean).join("|");
}

function buildImportPayload(rows, retrievedAt) {
  const bottles = mergeCatalogRecords(rows.map(normalizeUtahDabsBottle));
  return {
    schemaVersion: 1,
    source: SOURCE,
    retrievedAt,
    rawRecordCount: rows.length,
    bottleCount: bottles.length,
    records: rows,
    bottles
  };
}

function readXlsxRows(buffer, sheetPath) {
  const entries = readZipEntries(buffer);
  const sheetXml = entries.get(sheetPath);
  if (!sheetXml) throw new Error("Missing " + sheetPath);
  const sharedStringsXml = entries.get("xl/sharedStrings.xml");
  const sharedStrings = sharedStringsXml ? parseSharedStringsXml(sharedStringsXml.toString("utf8")) : [];
  return parseWorksheetXml(sheetXml.toString("utf8"), sharedStrings);
}

function readZipEntries(buffer) {
  const entries = new Map();
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  let offset = centralDirectoryOffset;

  for (let i = 0; i < totalEntries; i += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error("Invalid ZIP central directory");
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.slice(offset + 46, offset + 46 + fileNameLength).toString("utf8");

    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.slice(dataStart, dataStart + compressedSize);
    const data = method === 0 ? compressed : zlib.inflateRawSync(compressed);
    entries.set(name, data);

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function findEndOfCentralDirectory(buffer) {
  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error("Invalid ZIP file");
}

function parseSharedStringsXml(xml) {
  const strings = [];
  const itemRegex = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let itemMatch;
  while ((itemMatch = itemRegex.exec(xml))) {
    strings.push(extractTextRuns(itemMatch[1]));
  }
  return strings;
}

function parseWorksheetXml(xml, sharedStrings = []) {
  const rows = [];
  const rowRegex = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(xml))) {
    const row = [];
    const cellRegex = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowMatch[1]))) {
      const attrs = parseAttrs(cellMatch[1]);
      const index = columnIndex(attrs.r || "");
      row[index] = readCellValue(cellMatch[2], attrs.t, sharedStrings);
    }
    rows.push(row.map((value) => value || ""));
  }
  return rows;
}

function readCellValue(cellXml, type, sharedStrings) {
  if (type === "inlineStr") return extractTextRuns(cellXml);
  const valueMatch = cellXml.match(/<v>([\s\S]*?)<\/v>/);
  const value = valueMatch ? decodeXml(valueMatch[1]) : "";
  if (type === "s") return sharedStrings[Number(value)] || "";
  return value;
}

function extractTextRuns(xml) {
  const runs = [];
  const textRegex = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
  let match;
  while ((match = textRegex.exec(xml))) {
    runs.push(decodeXml(match[1]));
  }
  return runs.join("");
}

function parseAttrs(value) {
  const attrs = {};
  const attrRegex = /([A-Za-z_:][\w:.-]*)="([^"]*)"/g;
  let match;
  while ((match = attrRegex.exec(value))) attrs[match[1]] = decodeXml(match[2]);
  return attrs;
}

function columnIndex(ref) {
  const letters = String(ref).match(/^[A-Z]+/);
  if (!letters) return 0;
  let index = 0;
  for (const letter of letters[0]) index = index * 26 + letter.charCodeAt(0) - 64;
  return index - 1;
}

function decodeXml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'");
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.input) throw new Error("Provide --input data/raw/utah-dabs/May-2026-Product-List-FY26-P11.xlsx");

  const retrievedAt = new Date().toISOString();
  const rows = parseUtahDabsXlsx(fs.readFileSync(path.resolve(args.input)), {
    mode: args.mode,
    retrievedAt
  });
  const payload = buildImportPayload(rows, retrievedAt);
  const output = JSON.stringify(payload, null, 2) + "\n";

  if (args.out) {
    const outPath = path.resolve(args.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, output);
  } else {
    process.stdout.write(output);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = {
  buildImportPayload,
  cleanProductName,
  includeRow,
  normalizeSizeMl,
  normalizeUtahDabsBottle,
  normalizeUtahDabsRow,
  parseUtahDabsRows,
  parseUtahDabsXlsx,
  parseWorksheetXml,
  readXlsxRows,
  titleCaseProductName
};
