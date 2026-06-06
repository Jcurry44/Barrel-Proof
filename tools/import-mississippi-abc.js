#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const {
  inferBottleKind,
  mergeCatalogRecords,
  normalizeWhitespace,
  slugify,
  unique
} = require("../src/logic/catalog.js");

const SOURCE = {
  id: "mississippi_abc_price_changes",
  name: "Mississippi ABC 2026 SPAs and Bailment Price Changes",
  url: "https://www.dor.ms.gov/abc/sales-distribution/past-price-changes-spas",
  region: "MS",
  sourceType: "control_state_price_changes"
};

function parseArgs(argv) {
  const args = {
    mode: "bourbon",
    inputDir: "data/raw/mississippi-abc/text"
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input") args.input = argv[++i];
    if (arg === "--input-dir") args.inputDir = argv[++i];
    if (arg === "--out") args.out = argv[++i];
    if (arg === "--mode") args.mode = argv[++i];
  }

  return args;
}

function resolveInputFiles(args) {
  if (args.input) return [path.resolve(args.input)];
  const dir = path.resolve(args.inputDir || "data/raw/mississippi-abc/text");
  return fs.readdirSync(dir)
    .filter((entry) => entry.toLowerCase().endsWith(".txt"))
    .sort()
    .map((entry) => path.join(dir, entry));
}

function parseMississippiTextFiles(files, options = {}) {
  const parsedRows = files.flatMap((file) => parseMississippiText(
    fs.readFileSync(file, "utf8"),
    {
      ...options,
      sourceFile: path.relative(process.cwd(), file),
      documentType: inferDocumentType(file)
    }
  ));

  const rows = parsedRows
    .filter((row) => includeRow(row, options.mode || "bourbon"));

  return {
    parsedRows,
    rows: dedupeRows(rows)
  };
}

function parseMississippiText(text, options = {}) {
  const retrievedAt = options.retrievedAt || new Date().toISOString();
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => parseMississippiLine(line, {
      retrievedAt,
      sourceFile: options.sourceFile || "",
      documentType: options.documentType || "unknown"
    }))
    .filter(Boolean);
}

function parseMississippiLine(line, options = {}) {
  const clean = normalizeWhitespace(line);
  if (!clean || clean.startsWith("Category Item Code")) return null;
  if (options.documentType === "spa") return parseSpaLine(clean, options);
  if (options.documentType === "price_change") return parsePriceChangeLine(clean, options);
  return parseSpaLine(clean, options) || parsePriceChangeLine(clean, options);
}

function parseSpaLine(line, options = {}) {
  const match = line.match(/^(.+?)\s+(\d{4,6})\s+(.+?)\s*(\d+(?:\.\d+)?L|\d+ml)\s*(\d+)\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(True|False)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)(?:\s+.*)?$/i);
  if (!match) return null;

  const rawName = cleanProductName(match[3]);
  const effectiveDate = normalizeDate(match[6]);
  const bottleCost = parseNumber(match[11]);
  const spaBottleCost = parseNumber(match[12]);

  return {
    sourceId: SOURCE.id,
    sourceRecordId: makeSourceRecordId(match[2], match[4], effectiveDate, options.sourceFile),
    documentType: "spa",
    sourceFile: options.sourceFile || "",
    itemCode: match[2],
    rawCategory: normalizeWhitespace(match[1]),
    name: cleanProductNameForDisplay(rawName),
    rawName,
    category: inferMississippiCategory(match[1], rawName),
    size: normalizeSize(match[4]),
    unitsPerCase: parseNumber(match[5]),
    effectiveDate,
    nonSpaCaseCost: parseNumber(match[7]),
    spaCaseCost: parseNumber(match[8]),
    discount: parseNumber(match[9]),
    splitBottleAvailable: /^true$/i.test(match[10]),
    bottleCost,
    spaBottleCost,
    splitBottleCost: parseNumber(match[13]),
    price: Number.isFinite(spaBottleCost) ? spaBottleCost : bottleCost,
    proof: parseProofFromName(rawName),
    age: parseAgeFromName(rawName).label,
    ageYears: parseAgeFromName(rawName).years,
    sourceUrl: SOURCE.url,
    region: SOURCE.region,
    retrievedAt: options.retrievedAt || new Date().toISOString()
  };
}

function parsePriceChangeLine(line, options = {}) {
  const match = line.match(/^(.+?)\s+(\d{4,6})\s+(.+?)\s*(\d+(?:\.\d+)?L|\d+ml)\s*(\d+)\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(True|False)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(.+)$/i);
  if (!match) return null;

  const rawName = cleanProductName(match[3]);
  const effectiveDate = normalizeDate(match[6]);
  const bottleCost = parseNumber(match[10]);

  return {
    sourceId: SOURCE.id,
    sourceRecordId: makeSourceRecordId(match[2], match[4], effectiveDate, options.sourceFile),
    documentType: "price_change",
    sourceFile: options.sourceFile || "",
    itemCode: match[2],
    rawCategory: normalizeWhitespace(match[1]),
    name: cleanProductNameForDisplay(rawName),
    rawName,
    category: inferMississippiCategory(match[1], rawName),
    size: normalizeSize(match[4]),
    unitsPerCase: parseNumber(match[5]),
    effectiveDate,
    nonSpaCaseCost: parseNumber(match[7]),
    priceChange: parseNumber(match[8]),
    splitBottleAvailable: /^true$/i.test(match[9]),
    splitBottleCost: parseNumber(match[12]),
    bottlePriceChange: parseNumber(match[11]),
    bottleCost,
    statusIndicator: normalizeWhitespace(match[13]),
    price: bottleCost,
    proof: parseProofFromName(rawName),
    age: parseAgeFromName(rawName).label,
    ageYears: parseAgeFromName(rawName).years,
    sourceUrl: SOURCE.url,
    region: SOURCE.region,
    retrievedAt: options.retrievedAt || new Date().toISOString()
  };
}

function includeRow(row, mode) {
  if (!row) return false;
  if (mode === "all") return true;

  const category = row.rawCategory.toUpperCase();
  const text = [row.rawCategory, row.rawName, row.name].join(" ").toLowerCase();
  if (looksLikeNonBourbonProduct(text)) return false;

  if (mode === "whiskey") return /^WHISKEY|^LTO/.test(category) && !looksLikeNonWhiskeyProduct(text);

  if (category === "WHISKEY - STR BOURBON") return true;
  if (category === "WHISKEY - BTLD IN BOND" && !/\brye\b/i.test(text)) return true;
  if (category === "WHISKEY - TENNESSEE") return true;
  if (category.startsWith("WHISKEY") && /\bBOURBON\b/i.test(category)) return true;
  if (category.startsWith("LTO") && /\bbourbon\b/i.test(text)) return true;
  return false;
}

function looksLikeNonBourbonProduct(text) {
  return [
    /\bapple\b/,
    /\bblackberry\b/,
    /\bcherry\b/,
    /\bcinnamon\b/,
    /\bcocktail\b/,
    /\bcola\b/,
    /\bcream\b/,
    /\bflavo(?:u)?red\b/,
    /\bhoney\b/,
    /\blemonade\b/,
    /\bliqueur\b/,
    /\bpeach\b/,
    /\bpineapple\b/,
    /\bstraight rye\b/,
    /\bstr rye\b/,
    /\bbonded rye\b/,
    /\brye whiskey\b/,
    /\bmalted rye\b/,
    /\bfinished rye\b/,
    /\bdark rye\b/,
    /\bdouble rye\b/,
    /\brtd\b/,
    /\bvodka\b/
  ].some((pattern) => pattern.test(text));
}

function looksLikeNonWhiskeyProduct(text) {
  return /\b(cabernet|chardonnay|cognac|cordial|gin|liqueur|merlot|pinot|rum|sauvignon|scotch|tequila|vodka|wine)\b/i.test(text);
}

function inferMississippiCategory(category, name) {
  const sourceCategory = normalizeWhitespace(category).toUpperCase();
  const text = normalizeWhitespace(name).toLowerCase();
  if (sourceCategory === "WHISKEY - TENNESSEE") return "Tennessee Whiskey";
  if (sourceCategory === "WHISKEY - BTLD IN BOND" || /\bbottled?\s+in\s+bond\b|\bbib\b/i.test(text)) return "Bottled in Bond Bourbon";
  if (sourceCategory.includes("BOURBON")) return "Bourbon";
  if (sourceCategory === "WHISKEY - STR BOURBON" || (/^(WHISKEY|LTO)/.test(sourceCategory) && /\bbourbon\b/i.test(text))) return "Bourbon";
  return normalizeWhitespace(category);
}

function inferDocumentType(file) {
  const clean = path.basename(file).toLowerCase();
  if (clean.includes("spas")) return "spa";
  if (clean.includes("price-changes") || clean.includes("price changes")) return "price_change";
  return "unknown";
}

function makeSourceRecordId(itemCode, size, effectiveDate, sourceFile) {
  return [itemCode, normalizeSize(size), effectiveDate, path.basename(sourceFile || "")].filter(Boolean).join(":");
}

function cleanProductName(value) {
  return normalizeWhitespace(value)
    .replace(/[â€˜â€™]/g, "'")
    .replace(/[â€œâ€]/g, "\"")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanProductNameForDisplay(value) {
  const clean = cleanProductName(value)
    .replace(/(\d+(?:\.\d+)?)(ML|L)$/i, "$1$2")
    .trim();
  return titleCase(clean);
}

function titleCase(value) {
  const keepUpper = new Set(["ABC", "BIB", "LTO", "MS", "PET", "RTD", "SBW", "XO"]);
  return cleanProductName(value).toLowerCase().replace(/\b([a-z0-9][a-z0-9']*)\b/g, (token) => {
    const upper = token.toUpperCase();
    if (keepUpper.has(upper)) return upper;
    if (/^\d+xo$/i.test(token)) return upper;
    return token.charAt(0).toUpperCase() + token.slice(1);
  });
}

function normalizeSize(value) {
  const clean = normalizeWhitespace(value).toUpperCase();
  if (!clean) return null;
  if (clean === "1000ML" || clean === "1.00L") return "1L";
  if (clean === "1750ML" || clean === "1.75L") return "1.75L";
  if (/^\d+(?:\.\d+)?ML$/.test(clean)) return Number(clean.replace(/ML$/, "")) + "ml";
  if (/^\d+(?:\.\d+)?L$/.test(clean)) {
    const liters = Number(clean.replace(/L$/, ""));
    if (liters === 1) return "1L";
    if (liters === 1.75) return "1.75L";
    return liters + "L";
  }
  return clean;
}

function normalizeDate(value) {
  const match = normalizeWhitespace(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return normalizeWhitespace(value);
  return [
    match[3],
    match[1].padStart(2, "0"),
    match[2].padStart(2, "0")
  ].join("-");
}

function parseNumber(value) {
  const clean = normalizeWhitespace(value).replace(/,/g, "");
  if (!clean) return null;
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseProofFromName(value) {
  const match = cleanProductName(value).match(/\b(\d+(?:\.\d+)?)\s*Proof\b/i);
  if (!match) return null;
  const proof = Number(match[1]);
  return Number.isFinite(proof) ? proof : null;
}

function parseAgeFromName(value) {
  const match = cleanProductName(value).match(/\b(\d+(?:\.\d+)?)\s*(?:YEARS?|YRS?|YR\.?|YO|YEAR OLD|YEARS OLD)\b/i);
  if (!match) return { label: "Unknown", years: null };
  const years = Number(match[1]);
  if (!Number.isFinite(years)) return { label: "Unknown", years: null };
  return {
    label: years + " year" + (years === 1 ? "" : "s"),
    years
  };
}

function dedupeRows(rows) {
  const byRecord = new Map();
  for (const row of rows) {
    byRecord.set(row.sourceRecordId, row);
  }

  return Array.from(byRecord.values()).sort((a, b) => {
    const dateCompare = String(b.effectiveDate).localeCompare(String(a.effectiveDate));
    if (dateCompare) return dateCompare;
    return a.name.localeCompare(b.name) || String(a.size).localeCompare(String(b.size));
  });
}

function normalizeMississippiBottle(record) {
  const fields = [
    "itemCode",
    "rawCategory",
    "name",
    "rawName",
    "size",
    "unitsPerCase",
    "effectiveDate",
    "documentType",
    "bottleCost",
    "spaBottleCost",
    "price",
    "statusIndicator",
    "proof",
    "age"
  ];

  return {
    id: slugify([record.name, record.size, record.itemCode].filter(Boolean).join(" ")),
    identityKey: makeMississippiIdentityKey(record),
    name: record.name,
    producer: "",
    supplier: "",
    category: record.category,
    bottleKind: inferBottleKind({ name: record.name, category: record.category }),
    proof: record.proof,
    age: record.age,
    ageYears: record.ageYears,
    size: record.size,
    aliases: unique([record.name, record.rawName, record.itemCode]),
    sourceRefs: [
      {
        sourceId: SOURCE.id,
        sourceRecordId: record.sourceRecordId,
        sourceUrl: record.sourceUrl,
        retrievedAt: record.retrievedAt,
        fields
      }
    ],
    prices: Number.isFinite(record.price) ? [
      {
        sourceId: SOURCE.id,
        region: SOURCE.region,
        retailPrice: record.price,
        bottleCost: record.bottleCost,
        spaBottleCost: record.spaBottleCost,
        caseCost: record.spaCaseCost || record.nonSpaCaseCost,
        nonSpaCaseCost: record.nonSpaCaseCost,
        spaCaseCost: record.spaCaseCost,
        discount: record.discount,
        documentType: record.documentType,
        effectiveDate: record.effectiveDate,
        size: record.size,
        retrievedAt: record.retrievedAt
      }
    ] : []
  };
}

function makeMississippiIdentityKey(record) {
  return [
    slugify(record.name),
    slugify(record.size || ""),
    slugify(record.itemCode)
  ].filter(Boolean).join("|");
}

function buildImportPayload(rows, retrievedAt, rawRecordCount, sourceFiles = []) {
  const bottles = mergeCatalogRecords(rows.map(normalizeMississippiBottle));
  return {
    schemaVersion: 1,
    source: SOURCE,
    retrievedAt,
    sourceFiles,
    rawRecordCount,
    bottleCount: bottles.length,
    records: rows,
    bottles
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const inputFiles = resolveInputFiles(args);
  if (!inputFiles.length) throw new Error("No Mississippi ABC text files found.");

  const retrievedAt = new Date().toISOString();
  const { parsedRows, rows } = parseMississippiTextFiles(inputFiles, {
    mode: args.mode,
    retrievedAt
  });
  const sourceFiles = inputFiles.map((file) => path.relative(process.cwd(), file));
  const payload = buildImportPayload(rows, retrievedAt, parsedRows.length, sourceFiles);
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
  includeRow,
  normalizeDate,
  normalizeMississippiBottle,
  normalizeSize,
  parseMississippiLine,
  parseMississippiText,
  parseMississippiTextFiles
};
