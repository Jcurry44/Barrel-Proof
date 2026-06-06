#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const {
  inferBottleKind,
  mergeCatalogRecords,
  normalizeWhitespace,
  parseCurrency,
  parseProof,
  slugify,
  unique
} = require("../src/logic/catalog.js");

const SOURCE = {
  id: "michigan_lcc_price_book",
  name: "Michigan Liquor Control Commission Spirits Price Book",
  url: "https://www.michigan.gov/lara/bureau-list/lcc/spirits-price-book-info",
  dataUrl: "https://www.michigan.gov/lara/-/media/Project/Websites/lara/lcc/Price-Book/May-2-2026-Price-Book-TXT.txt",
  region: "MI",
  sourceType: "control_state_catalog"
};

const BOURBON_LIQUOR_TYPES = new Set([
  "2-TENNESSEE",
  "5-STRAIGHT BOURBON",
  "11-BOTTLED IN BOND BOURBON"
]);

const SERIOUS_WHISKEY_LIQUOR_TYPES = new Set([
  "1-AMERICAN BLEND",
  "2-TENNESSEE",
  "5-STRAIGHT BOURBON",
  "7-STRAIGHT CORN",
  "9-STRAIGHT RYE",
  "11-BOTTLED IN BOND BOURBON",
  "15-CANADIAN",
  "17-SCOTCH",
  "19-MISCELLANEOUS WHISKEY",
  "82-IRISH WHISKEY"
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

function parseMichiganPriceBookText(text, options = {}) {
  const rows = parseDelimitedRows(text, "\t");
  if (!rows.length) return [];

  const headers = rows[0].map(normalizeWhitespace);
  const index = Object.fromEntries(headers.map((header, columnIndex) => [header, columnIndex]));
  const retrievedAt = options.retrievedAt || new Date().toISOString();

  return rows.slice(1)
    .map((row) => normalizeMichiganRow(row, index, { retrievedAt }))
    .filter(Boolean)
    .filter((row) => includeRow(row, options.mode || "serious"));
}

function normalizeMichiganRow(row, index, options = {}) {
  const value = (field) => index[field] >= 0 ? normalizeWhitespace(row[index[field]]) : "";
  const liquorCode = value("Liquor Code");
  const rawName = value("Brand Name");
  if (!liquorCode || !rawName) return null;

  const liquorType = value("Liquor Type");
  const shelfPrice = parseCurrency(value("Shelf price ($)"));
  const upc = normalizeUpc(value("GTIN/UPC"));

  return {
    sourceId: SOURCE.id,
    sourceRecordId: liquorCode,
    liquorCode,
    name: titleCaseProductName(rawName),
    rawName,
    adaNumber: value("ADA Number"),
    adaName: titleCaseOrganization(value("ADA Name")),
    vendorName: titleCaseOrganization(value("Vendor Name")),
    liquorType,
    category: inferMichiganCategory(rawName, liquorType),
    proof: parseProof(value("Proof")),
    size: normalizeMichiganSize(value("Bottle Size")),
    caseSize: parseNumber(value("Case Size")),
    packsPerCase: parseNumber(value("Packs per Case")),
    productCategory: value("Product Category"),
    onPremisePrice: parseCurrency(value("On Premise Price")),
    offPremisePrice: parseCurrency(value("Off Premise Price")),
    shelfPrice,
    upc,
    effectiveDate: normalizeDate(value("Effective Date")),
    effectiveDateWithLiquorCode: value("Effective Date with Liq Code"),
    sourceUrl: SOURCE.url,
    dataUrl: SOURCE.dataUrl,
    region: SOURCE.region,
    retrievedAt: options.retrievedAt || new Date().toISOString()
  };
}

function includeRow(row, mode) {
  if (!row) return false;
  if (mode === "all") return true;

  const liquorType = row.liquorType.toUpperCase();
  const text = [row.name, row.rawName, liquorType, row.productCategory].join(" ").toLowerCase();
  if (looksLikeNonSeriousWhiskey(row, text)) return false;

  if (mode === "bourbon") return BOURBON_LIQUOR_TYPES.has(liquorType);

  if (mode === "whiskey") {
    return SERIOUS_WHISKEY_LIQUOR_TYPES.has(liquorType) || isSeriousWhiskeyName(text);
  }

  return SERIOUS_WHISKEY_LIQUOR_TYPES.has(liquorType) || isSeriousWhiskeyName(text);
}

function looksLikeNonSeriousWhiskey(row, text) {
  const liquorType = row.liquorType.toUpperCase();
  const isHoneyCask = /\bhoney\s+(?:barrels?|casks?)\b|\b(?:aged|finished)\s+in\s+honey\s+barrels?\b/i.test(text);
  const isMapleCask = /\bmaple\s+(?:syrup\s+)?(?:barrels?|casks?)\b|\b(?:aged|finished)\s+in\s+maple\s+(?:syrup\s+)?barrels?\b/i.test(text);

  if (/\b(?:CREAM|COCKTAILS?|CORDIALS?|LIQUEURS?|SCHNAPPS|GIN|VODKA|RUM|TEQUILA|COGNAC)\b/i.test(liquorType)) return true;
  if (Number.isFinite(row.proof) && row.proof > 0 && row.proof < 40) return true;
  if (/\bhoney\b/i.test(text) && !isHoneyCask) return true;
  if (/\bmaple\b/i.test(text) && !isMapleCask) return true;

  return [
    /\bapple\b/,
    /\bbanana\b/,
    /\bblackberry\b/,
    /\bblueberry\b/,
    /\bbrandy\b/,
    /\bbutterscotch\b/,
    /\bcandy\b/,
    /\bcaramel\b/,
    /\bcherry\b/,
    /\bchocolate\b/,
    /\bcinnamon\b/,
    /\bcoconut\b/,
    /\bcocktails?\b/,
    /\bcoffee\b/,
    /\bcookie\b/,
    /\bcream\b/,
    /\bcreamsicle\b/,
    /\bcinnamint\b/,
    /\bflavo(?:u)?red\b/,
    /\bginger\b/,
    /\bgingerbread\b/,
    /\bglasses\b/,
    /\bliqueur\b/,
    /\blemon(?:ade|-drop)\b/,
    /\bmint\b/,
    /\bmocha\b/,
    /\bmoonshine\b/,
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
    /\bspice\b/,
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
  return /\b(whisk(?:e)?y|whisky|bourbon|rye|tennessee|single\s+malt|scotch|canadian)\b/i.test(text);
}

function inferMichiganCategory(rawName, liquorType) {
  const type = normalizeWhitespace(liquorType).toUpperCase();
  const text = [rawName, type].join(" ").toLowerCase();

  if (/\b(amrut|kavalan|paul\s+john|starward|mackmyra|penderyn|english\s+whisk(?:e)?y)\b/i.test(text)) return "Single Malt / World Whisky";
  if (type === "11-BOTTLED IN BOND BOURBON") return "Bottled in Bond Bourbon";
  if (type === "5-STRAIGHT BOURBON") return /\bwheated?\b/i.test(text) ? "Wheated Bourbon" : "Bourbon";
  if (type === "2-TENNESSEE") return "Tennessee Whiskey";
  if (type === "9-STRAIGHT RYE" || /\brye\s+whisk(?:e)?y\b|\bstraight\s+rye\b/i.test(text)) return "Rye Whiskey";
  if (/\bwheated?\b.*\bbourbon\b|\bbourbon\b.*\bwheated?\b/i.test(text)) return "Wheated Bourbon";
  if (/\bwheat\s+whisk(?:e)?y\b|\bbib\s+wheat\b|\bstraight\s+wheat\b/i.test(text)) return "Wheat Whiskey";
  if (type === "15-CANADIAN" || /\bcanadian\b.*\bwhisk(?:e)?y\b|\bcanadian\s+whisk(?:e)?y\b/i.test(text)) return "Canadian Whisky";
  if (type === "17-SCOTCH" || /\bscotch\b/i.test(text)) return "Scotch Whisky";
  if (type === "82-IRISH WHISKEY" || /\birish\s+whisk(?:e)?y\b/i.test(text)) return "Irish Whiskey";
  if (/\bjapanese\b.*\bwhisk(?:e)?y\b|\b(akashi|akkeshi|yamazaki|hakushu|hibiki|chichibu|nikka|tottori)\b/i.test(text)) return "Japanese Whisky";
  if (/\bamerican\s+single\s+malt\b/i.test(text)) return "American Single Malt";
  if (/\bsingle\s+malt\b/i.test(text)) return "Single Malt / World Whisky";
  if (type === "1-AMERICAN BLEND") return "Blended Whiskey";
  if (type === "7-STRAIGHT CORN" || /\bcorn\s+whisk(?:e)?y\b/i.test(text)) return "American Whiskey";
  if (/\bamerican\s+whisk(?:e)?y\b|\blight\s+whisk(?:e)?y\b/i.test(text)) return "American Whiskey";
  if (/\bblended\s+whisk(?:e)?y\b|\bblended\s+whisky\b/i.test(text)) return "Blended Whiskey";
  if (/\bbourbon\b/i.test(text)) return "Bourbon";
  if (/\bwhisk(?:e)?y\b|\bwhisky\b/i.test(text)) return "Whiskey";
  return titleCaseProductName(parseLiquorTypeName(liquorType));
}

function parseDelimitedRows(text, delimiter) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  const source = String(text || "");

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        cell += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => normalizeWhitespace(value))) rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => normalizeWhitespace(value))) rows.push(row);
  return rows;
}

function parseLiquorTypeName(value) {
  return normalizeWhitespace(value).replace(/^\d+-/, "");
}

function normalizeMichiganSize(value) {
  const clean = normalizeWhitespace(value).toUpperCase();
  const match = clean.match(/^(\d+(?:\.\d+)?)\s*(ML|L)$/);
  if (!match) return clean || null;

  const amount = Number(match[1]);
  const unit = match[2];
  if (!Number.isFinite(amount)) return clean;
  if (unit === "L") return amount === 1 ? "1L" : amount + "L";
  if (amount === 1000) return "1L";
  if (amount === 1750) return "1.75L";
  return amount + "ml";
}

function parseNumber(value) {
  const clean = normalizeWhitespace(value).replace(/,/g, "");
  if (!clean) return null;
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDate(value) {
  const clean = normalizeWhitespace(value);
  const match = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return clean;
  return [
    match[3],
    match[1].padStart(2, "0"),
    match[2].padStart(2, "0")
  ].join("-");
}

function normalizeUpc(value) {
  const digits = normalizeWhitespace(value).replace(/\D/g, "");
  if (!digits || /^0+$/.test(digits)) return "";
  return digits;
}

function titleCaseOrganization(value) {
  const clean = normalizeWhitespace(value);
  if (!clean) return "";
  if (/[a-z]/.test(clean)) return clean;

  return clean.toLowerCase().replace(/\b([a-z0-9']+)\b/g, (word) => {
    if (["ada", "bbn", "co", "inc", "ky", "llc", "lp", "ltd", "mi", "nws", "usa"].includes(word)) return word.toUpperCase();
    if (["and", "by", "in", "of", "on", "to"].includes(word)) return word;
    if (word.length <= 2 && /^[a-z]+$/.test(word)) return word.toUpperCase();
    return word.slice(0, 1).toUpperCase() + word.slice(1);
  });
}

function titleCaseProductName(value) {
  const clean = normalizeWhitespace(value);
  if (!clean) return "";
  if (/[a-z]/.test(clean)) return clean;

  return clean.toLowerCase().replace(/\b([a-z0-9']+)\b/g, (word) => {
    if (/^\d+(yr|yo|pr|pf)$/.test(word)) return word.toUpperCase();
    if (["bbn", "bib", "brl", "btb", "cask", "pl", "prf", "rtd", "sb", "sbs", "sngl", "str", "yr"].includes(word)) return word.toUpperCase();
    if (word === "co") return "Co";
    if (["and", "by", "in", "of", "on", "to"].includes(word)) return word.slice(0, 1).toUpperCase() + word.slice(1);
    if (word.length <= 2 && /^[a-z]+$/.test(word)) return word.toUpperCase();
    return word.slice(0, 1).toUpperCase() + word.slice(1);
  });
}

function normalizeMichiganBottle(record) {
  const fields = [
    "liquorCode",
    "name",
    "adaNumber",
    "adaName",
    "vendorName",
    "liquorType",
    "proof",
    "size",
    "caseSize",
    "packsPerCase",
    "productCategory",
    "onPremisePrice",
    "offPremisePrice",
    "shelfPrice",
    "upc",
    "effectiveDate"
  ];

  const normalized = {
    id: slugify([record.name, record.size, record.liquorCode].filter(Boolean).join(" ")),
    identityKey: makeMichiganIdentityKey(record),
    name: record.name,
    producer: record.vendorName,
    supplier: record.vendorName,
    category: record.category,
    bottleKind: inferBottleKind({ name: record.name, category: record.category }),
    proof: record.proof,
    age: "Unknown",
    ageYears: null,
    size: record.size,
    upc: record.upc || null,
    barcodes: unique([record.upc]),
    aliases: unique([record.name, record.rawName, record.liquorCode, record.upc]),
    sourceRefs: [
      {
        sourceId: SOURCE.id,
        sourceRecordId: record.liquorCode,
        sourceUrl: SOURCE.url,
        retrievedAt: record.retrievedAt,
        fields
      }
    ],
    prices: []
  };

  if (Number.isFinite(record.shelfPrice)) {
    normalized.prices.push({
      sourceId: SOURCE.id,
      region: SOURCE.region,
      retailPrice: record.shelfPrice,
      shelfPrice: record.shelfPrice,
      onPremisePrice: Number.isFinite(record.onPremisePrice) ? record.onPremisePrice : null,
      offPremisePrice: Number.isFinite(record.offPremisePrice) ? record.offPremisePrice : null,
      size: record.size,
      effectiveDate: record.effectiveDate,
      retrievedAt: record.retrievedAt
    });
  }

  return normalized;
}

function makeMichiganIdentityKey(record) {
  return [
    slugify(record.name),
    slugify(record.size || ""),
    slugify(record.liquorCode)
  ].filter(Boolean).join("|");
}

function buildImportPayload(rows, retrievedAt) {
  const bottles = mergeCatalogRecords(rows.map(normalizeMichiganBottle));
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

async function main() {
  const args = parseArgs(process.argv);
  if (!args.input) throw new Error("Provide --input data/raw/michigan-lcc/may-3-2026-price-book.txt");

  const retrievedAt = new Date().toISOString();
  const text = fs.readFileSync(path.resolve(args.input), "utf8");
  const rows = parseMichiganPriceBookText(text, { mode: args.mode, retrievedAt });
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
  includeRow,
  normalizeDate,
  normalizeMichiganBottle,
  normalizeMichiganRow,
  normalizeMichiganSize,
  normalizeUpc,
  parseDelimitedRows,
  parseMichiganPriceBookText,
  titleCaseProductName
};
