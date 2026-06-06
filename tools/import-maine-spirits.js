#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const {
  inferBottleKind,
  mergeCatalogRecords,
  normalizeWhitespace,
  parseCurrency,
  slugify,
  unique
} = require("../src/logic/catalog.js");
const { readXlsxRows } = require("./import-utah-dabs.js");

const SOURCE = {
  id: "maine_spirits_master_price_list",
  name: "Maine Spirits Master Price List",
  url: "https://www.mainespirits.com/maine-spirits-agent-portal",
  dataUrl: "https://www.mainespirits.com/sites/default/files/price_books/May%202026%20Master%20Price%20List%20%28Revised%29.xlsx",
  region: "ME",
  sourceType: "control_state_catalog"
};

const SERIOUS_WHISKEY_CATEGORIES = new Set([
  "BOURBON",
  "WHISKEY",
  "SCOTCH",
  "CANADIAN WHISKEY",
  "IRISH WHISKEY",
  "JAPANESE WHISKEY"
]);

function parseArgs(argv) {
  const args = { mode: "serious" };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input") args.input = argv[++i];
    if (arg === "--out") args.out = argv[++i];
    if (arg === "--mode") args.mode = argv[++i];
  }
  return args;
}

function parseMaineSpiritsXlsx(buffer, options = {}) {
  return parseMaineRows(readXlsxRows(buffer, "xl/worksheets/sheet1.xml"), options);
}

function parseMaineRows(rows, options = {}) {
  const headerIndex = (rows || []).findIndex((row) => row.includes("Item .") && row.includes("Description"));
  if (headerIndex < 0) return [];

  const headers = rows[headerIndex].map((header) => normalizeWhitespace(header).replace(/^'+|'+$/g, ""));
  const index = Object.fromEntries(headers.map((header, columnIndex) => [header, columnIndex]));
  const retrievedAt = options.retrievedAt || new Date().toISOString();

  return rows.slice(headerIndex + 1)
    .map((row) => normalizeMaineRow(row, index, { retrievedAt }))
    .filter(Boolean)
    .filter((row) => includeRow(row, options.mode || "serious"))
    .sort((a, b) => a.name.localeCompare(b.name) || String(a.size).localeCompare(String(b.size)));
}

function normalizeMaineRow(row, index, options = {}) {
  const value = (field) => index[field] >= 0 ? normalizeWhitespace(row[index[field]]) : "";
  const itemCode = value("Item .");
  const rawName = cleanProductName(value("Description"));
  if (!itemCode || !rawName) return null;

  const category = value("Product Category");
  const age = parseAgeFromName(rawName);
  const retailPrice = parseCurrency(value("Retail Price"));
  const salePrice = parseOptionalCurrency(value("Sales Price"));

  return {
    sourceId: SOURCE.id,
    sourceRecordId: [itemCode, normalizeSize(value("Size")) || "unknown-size"].join(":"),
    itemCode,
    name: cleanDisplayName(rawName),
    rawName,
    category: inferMaineCategory(rawName, category),
    productCategory: category,
    size: normalizeSize(value("Size")),
    rawSize: value("Size"),
    uoi: value("UOI"),
    units: parseNumber(value("Units")),
    proof: parseNumber(value("Proof")) || parseProofFromName(rawName),
    age: age.label,
    ageYears: age.years,
    upc: parseUpc(value("UPC")),
    agencyCost: parseOptionalCurrency(value("Agency Cost")),
    agencySaleCost: parseOptionalCurrency(value("Agency Sale Cost")),
    agentSavings: parseOptionalCurrency(value("Agent Savings")),
    retailPrice,
    salesPrice: salePrice,
    retailSavings: parseOptionalCurrency(value("Retail Savings")),
    effectiveStartDate: normalizeDate(value("Effective Start Date")),
    effectiveEndDate: normalizeDate(value("Effective End Date")),
    sourceUrl: SOURCE.url,
    dataUrl: SOURCE.dataUrl,
    region: SOURCE.region,
    retrievedAt: options.retrievedAt || new Date().toISOString()
  };
}

function includeRow(row, mode) {
  if (!row) return false;
  if (mode === "all") return true;

  const category = row.productCategory.toLowerCase();
  const text = [row.productCategory, row.rawName, row.name].join(" ").toLowerCase();
  if (looksLikeNonSeriousWhiskey(row, text)) return false;

  if (mode === "whiskey" || mode === "serious") return SERIOUS_WHISKEY_CATEGORIES.has(row.productCategory.toUpperCase());
  if (category === "bourbon") return true;
  if (isSeriousTennesseeWhiskey(text)) return true;
  if (category === "whiskey" && /\b(bourbon|ksbw|sbw|straight bourbon|bottled in bond|bib)\b/i.test(text)) return true;
  return false;
}

function looksLikeNonSeriousWhiskey(row, text) {
  const isHoneyCask = /\bhoney\s+(?:barrels?|casks?)\b|\b(?:aged|finished)\s+in\s+honey\s+barrels?\b/i.test(text);
  const isMapleCask = /\bmaple\s+(?:syrup\s+)?(?:barrels?|casks?)\b|\b(?:aged|finished)\s+in\s+maple\s+(?:syrup\s+)?barrels?\b/i.test(text);
  const isSeriousHoneyName = /\bgarrison\s+bros?\s+honey(?:dew)?\b|\bhoneydew\b/i.test(text);

  if (!SERIOUS_WHISKEY_CATEGORIES.has(row.productCategory.toUpperCase())) return true;
  if (Number.isFinite(row.proof) && row.proof > 0 && row.proof < 70) return true;
  if (/\bhoney\b/i.test(text) && !isHoneyCask && !isSeriousHoneyName) return true;
  if (/\bmaple\b/i.test(text) && !isMapleCask && !/\bmaplewood\b/i.test(text)) return true;

  return [
    /\bapple\b/,
    /\bbanana\b/,
    /\bblackberry\b/,
    /\bcherry\b/,
    /\bcinnamon\b/,
    /\bcider\b/,
    /\bcocktail\b/,
    /\bcoconut\b/,
    /\bcoffee\b/,
    /\bcream\b/,
    /\bdonut\b/,
    /\bjacapple\b/,
    /\bfireball\b/,
    /\bfire\d*(?:\.\d+)?p?\b/,
    /\bcin\s+whs\b/,
    /\bflavo(?:u)?red\b/,
    /\bglass(?:es)?\b/,
    /\bglassvap\w*\b/,
    /\bhothoney\w*\b/,
    /\bliqueur\b/,
    /\bmoonshine\b/,
    /\bmoon\s*shine\b/,
    /\bmoshine\b/,
    /\bpeach\b/,
    /\bpeanut\s+(?:bu|butte?r?)\b/,
    /\bpecan\b/,
    /\bpineapple\b/,
    /\bpumpkin\b/,
    /\brtd\b/,
    /\bspiced\b/,
    /\btray\b/,
    /\bvanilla\b/,
    /\bvodka\b/,
    /\bw\/(?:cups?|flask|glass(?:es)?|gl|gls|hi|highba|jigg|pourer|rocks?)\b/,
    /\bw\/\s*(?:cups?|flask|glass|glass(?:es)?|gl|gls|hi|highba|jigg|pourer|rocks?)\b/,
    /w\/glass\b/,
    /w\/gl\b/,
    /w\/gls\b/,
    /w\/.*(?:cups?|flask|glass(?:es)?|gl|gls|hi|highba|jigg|pourer|rocks?)\b/,
    /\b(?:2pk|3pk|4pk|6pk|12pk)\w*\b/,
    /\b(?:gift|vaps?)\d*\b/
  ].some((pattern) => pattern.test(text)) && !/\bhigh\s*rye\b/.test(text);
}

function inferMaineCategory(name, category) {
  const cleanCategory = normalizeWhitespace(category);
  const text = cleanProductName(name).toLowerCase();
  const sourceCategory = cleanCategory.toUpperCase();

  if (sourceCategory === "SCOTCH" || isKnownScotchName(text)) return "Scotch Whisky";
  if (sourceCategory === "IRISH WHISKEY" || /\birish\b/i.test(text)) return "Irish Whiskey";
  if (sourceCategory === "JAPANESE WHISKEY" || /\bjapanese\b|\b(akashi|akkeshi|fuji|fuyu|hatozaki|hibiki|kaiyo|nikka|suntory|tottori|yamazaki)\b/i.test(text)) return "Japanese Whisky";
  if (/\bfound\s+north\b/i.test(text)) return /\brye\b/i.test(text) ? "Rye Whiskey" : "Canadian Whisky";
  if (sourceCategory === "CANADIAN WHISKEY" && /\brye\b/i.test(text)) return "Rye Whiskey";
  if (sourceCategory === "CANADIAN WHISKEY" || /\bcanadian\b/i.test(text)) return "Canadian Whisky";
  if (/\b(amrut|kavalan|paul\s+john|starward|mackmyra|penderyn|abasolo|bastille|english\s+whisk(?:e)?y)\b/i.test(text)) return "Single Malt / World Whisky";
  if (/\bamerican\s+single\s+malt\b|\bsingle\s+malt\b.*\bwhisk(?:e)?y\b/i.test(text)) return "American Single Malt";
  if (/\bw\.?\s*l\.?\s+weller\b|\bweller\b|\bsweet\s+wheat\b|\bwheated?\b.*\bbourbon\b|\bbourbon\b.*\bwheated?\b/i.test(text)) return "Wheated Bourbon";
  if (/\bbernheim\b|\bwheat\s+whisk(?:e)?y\b|\bwheat\s+whisk\b|\bwheat\s+whsky\b|\bstraight\s+wheat\b|\bamerican\s+wheat\s+whisky\b/i.test(text)) return "Wheat Whiskey";
  if (/\brye\s+whisk(?:e)?y\b|\bstraight\s+rye\b|\brye\b/i.test(text) && !/\bhigh\s+rye\b/i.test(text)) return "Rye Whiskey";
  if (isSeriousTennesseeWhiskey(text)) return "Tennessee Whiskey";
  if (/\bbottled?\s+in\s+bond\b|\bbib\b/i.test(text)) return "Bottled in Bond Bourbon";
  if (cleanCategory.toLowerCase() === "bourbon" || /\b(bourbon|ksbw|sbw)\b/i.test(text)) return "Bourbon";
  if (/\bblended\s+whisk(?:e)?y\b|\bblend of straight whisk(?:e)?ys\b|\bblended\s+whisky\b/i.test(text)) return "Blended Whiskey";
  if (/\bcorn\s+whisk(?:e)?y\b/i.test(text)) return "American Whiskey";
  if (/\bamerican\s+whisk(?:e)?y\b|\blight\s+whisk(?:e)?y\b|\bsour\s+mash\s+whisk(?:e)?y\b|\bstraight\s+whisk(?:e)?y\b/i.test(text)) return "American Whiskey";
  if (/\bwhisk(?:e)?y\b|\bwhisky\b|\bwhs\b|\bwhsk\b|\bwsky\b/i.test(text)) return "Whiskey";
  if (sourceCategory === "WHISKEY") return "Whiskey";
  return cleanCategory || "Maine Spirits catalog";
}

function isKnownScotchName(text) {
  return /\b(aberfeldy|aberlour|ancnoc|ardbeg|auchentoshan|balblair|balvenie|bowmore|bruichladdich|bunnahabhain|caol\s+ila|chivas|cragganmore|cutty\s+sark|dalmore|dalwhinnie|dewar|famous\s+grouse|glen(?:farclas|fiddich|livet|morangie|rothes|scotia)|highland\s+park|johnnie\s+walker|jura|lagavulin|laphroaig|macallan|monkey\s+shoulder|oban|talisker)\b/i.test(text);
}

function isSeriousTennesseeWhiskey(text) {
  const clean = normalizeWhitespace(text).toLowerCase();
  if (/\b(apple|fire|honey|rye)\b/.test(clean)) return false;
  return /\b(jack daniels sinatra|jack daniels black|jack daniels bonded|jack daniels single barrel|george dickel|gentleman jack|uncle nearest)\b/.test(clean);
}

function cleanDisplayName(value) {
  return titleCase(cleanProductName(value)
    .replace(/\s+\d+(?:\.\d+)?P\b/i, "")
    .replace(/\s+/g, " ")
    .trim());
}

function cleanProductName(value) {
  return normalizeWhitespace(value)
    .replace(/[â€˜â€™]/g, "'")
    .replace(/[â€œâ€]/g, "\"")
    .trim();
}

function titleCase(value) {
  const keepUpper = new Set(["BIB", "KSBW", "PET", "RSV", "SBW", "XO"]);
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
  const clean = normalizeWhitespace(value);
  const match = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return clean;
  return [match[3], match[1].padStart(2, "0"), match[2].padStart(2, "0")].join("-");
}

function parseNumber(value) {
  const clean = normalizeWhitespace(value).replace(/,/g, "");
  if (!clean) return null;
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseOptionalCurrency(value) {
  const parsed = parseCurrency(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseUpc(value) {
  const clean = normalizeWhitespace(value).replace(/\D/g, "");
  return clean.length >= 8 && clean.length <= 14 ? clean : null;
}

function parseProofFromName(value) {
  const match = cleanProductName(value).match(/\b(\d+(?:\.\d+)?)P\b/i);
  if (!match) return null;
  const proof = Number(match[1]);
  return Number.isFinite(proof) ? proof : null;
}

function parseAgeFromName(value) {
  const match = cleanProductName(value).match(/\b(\d+(?:\.\d+)?)\s*(?:YEARS?|YRS?|YR\.?|YO)\b/i);
  if (!match) return { label: "Unknown", years: null };
  const years = Number(match[1]);
  if (!Number.isFinite(years)) return { label: "Unknown", years: null };
  return { label: years + " year" + (years === 1 ? "" : "s"), years };
}

function normalizeMaineBottle(record) {
  const fields = [
    "itemCode",
    "name",
    "rawName",
    "productCategory",
    "size",
    "units",
    "proof",
    "upc",
    "agencyCost",
    "agencySaleCost",
    "retailPrice",
    "salesPrice",
    "effectiveStartDate",
    "effectiveEndDate"
  ];
  const price = Number.isFinite(record.salesPrice) ? record.salesPrice : record.retailPrice;

  return {
    id: slugify([record.name, record.size, record.itemCode].filter(Boolean).join(" ")),
    identityKey: makeMaineIdentityKey(record),
    name: record.name,
    producer: "",
    supplier: "",
    category: record.category,
    bottleKind: inferBottleKind({ name: record.name, category: record.category }),
    proof: record.proof,
    age: record.age,
    ageYears: record.ageYears,
    size: record.size,
    upc: record.upc,
    barcodes: unique([record.upc]),
    aliases: unique([record.name, record.rawName, record.itemCode, record.upc]),
    sourceRefs: [
      {
        sourceId: SOURCE.id,
        sourceRecordId: record.sourceRecordId,
        sourceUrl: SOURCE.url,
        retrievedAt: record.retrievedAt,
        fields
      }
    ],
    prices: Number.isFinite(price) ? [
      {
        sourceId: SOURCE.id,
        region: SOURCE.region,
        retailPrice: price,
        regularRetail: record.retailPrice,
        salePrice: record.salesPrice,
        agencyCost: record.agencyCost,
        agencySaleCost: record.agencySaleCost,
        effectiveStartDate: record.effectiveStartDate,
        effectiveEndDate: record.effectiveEndDate,
        size: record.size,
        retrievedAt: record.retrievedAt
      }
    ] : []
  };
}

function makeMaineIdentityKey(record) {
  return [slugify(record.name), slugify(record.size || ""), slugify(record.itemCode)].filter(Boolean).join("|");
}

function buildImportPayload(rows, retrievedAt) {
  const bottles = mergeCatalogRecords(rows.map(normalizeMaineBottle));
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
  if (!args.input) throw new Error("Provide --input data/raw/maine-spirits/may-2026-master-price-list-revised.xlsx");
  const retrievedAt = new Date().toISOString();
  const rows = parseMaineSpiritsXlsx(fs.readFileSync(path.resolve(args.input)), {
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
  includeRow,
  normalizeMaineRow,
  normalizeSize,
  parseMaineRows,
  parseMaineSpiritsXlsx
};
