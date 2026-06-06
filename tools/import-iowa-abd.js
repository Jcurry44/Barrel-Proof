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
  id: "iowa_abd_products",
  name: "Iowa Liquor Products",
  url: "https://data.iowa.gov/Sales-Distribution/Iowa-Liquor-Products/gckp-fe7r",
  dataUrl: "https://data.iowa.gov/resource/gckp-fe7r.json",
  region: "IA",
  sourceType: "control_state_catalog"
};

const CORE_BOURBON_CATEGORIES = new Set([
  "BOTTLED IN BOND BOURBON",
  "SINGLE BARREL BOURBON WHISKIES",
  "STRAIGHT BOURBON WHISKIES",
  "TENNESSEE WHISKIES"
]);

const SERIOUS_WHISKEY_CATEGORIES = new Set([
  "BOTTLED IN BOND BOURBON",
  "BLENDED WHISKIES",
  "CANADIAN WHISKIES",
  "CORN WHISKIES",
  "IRISH WHISKIES",
  "SCOTCH WHISKIES",
  "SINGLE BARREL BOURBON WHISKIES",
  "SINGLE MALT SCOTCH",
  "STRAIGHT BOURBON WHISKIES",
  "STRAIGHT RYE WHISKIES",
  "TENNESSEE WHISKIES"
]);

const NAME_MATCH_CATEGORIES = new Set([
  "AMERICAN DISTILLED SPIRITS SPECIALTY",
  "BLENDED WHISKIES",
  "CORN WHISKIES",
  "IOWA SPIRITS MANUFACTURERS",
  "SPECIAL ORDER ITEMS",
  "TEMPORARY & SPECIALTY PACKAGES"
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

function parseIowaAbdProductsJson(jsonText, options = {}) {
  const payload = JSON.parse(jsonText);
  const rows = Array.isArray(payload) ? payload : [];
  const retrievedAt = options.retrievedAt || new Date().toISOString();

  return rows
    .map((row) => normalizeIowaAbdRow(row, { retrievedAt }))
    .filter((row) => includeRow(row, options.mode || "serious"));
}

function normalizeIowaAbdRow(row, options = {}) {
  const itemNumber = normalizeWhitespace(row.itemno);
  const rawName = normalizeWhitespace(row.im_desc);
  if (!itemNumber || !rawName) return null;

  const categoryName = normalizeWhitespace(row.category_name);
  const vendorName = cleanVendorName(row.vendor_name);
  const proof = parseProof(row.proof);
  const age = parseIowaAge(row.age);

  const displayName = cleanIowaDisplayName(titleCaseProductName(rawName));

  return {
    sourceId: SOURCE.id,
    sourceRecordId: itemNumber,
    itemNumber,
    name: displayName,
    rawName,
    category: inferIowaCategory(categoryName, rawName),
    categoryName,
    vendorNumber: normalizeWhitespace(row.vendor_no),
    vendorName,
    bottleVolumeMl: parseNumber(row.bottle_volume_ml),
    size: normalizeIowaSize(row.bottle_volume_ml),
    pack: parseNumber(row.pack),
    innerPack: parseNumber(row.innerpack),
    age: age.label,
    ageYears: age.years,
    proof,
    listDate: normalizeDate(row.listdate),
    upc: normalizeDigits(row.upc),
    scc: normalizeDigits(row.scc),
    stateBottleCost: parseCurrency(row.state_bottle_cost),
    stateCaseCost: parseCurrency(row.state_case_cost),
    stateBottleRetail: parseCurrency(row.state_bottle_retail),
    reportDate: normalizeDate(row.date),
    sourceUrl: SOURCE.url,
    dataUrl: SOURCE.dataUrl,
    region: SOURCE.region,
    retrievedAt: options.retrievedAt || new Date().toISOString()
  };
}

function cleanIowaDisplayName(value) {
  return normalizeWhitespace(value)
    .replace(/^HA\s+/i, "")
    .replace(/^BP\s+/i, "")
    .replace(/\s*-\s*Use\s+Code\s+\d+\s*$/i, "")
    .replace(/\s+Use\s+Code\s+\d+\s*$/i, "")
    .replace(/\s+DNO\s*$/i, "")
    .replace(/\s+Disco\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function includeRow(row, mode) {
  if (!row) return false;
  if (mode === "all") return true;

  const category = row.categoryName.toUpperCase();
  const text = [row.name, row.rawName, category].join(" ").toLowerCase();

  if (looksLikeNonSeriousWhiskey(row, text)) return false;

  if (mode === "bourbon") {
    if (CORE_BOURBON_CATEGORIES.has(category)) return true;
    if (!NAME_MATCH_CATEGORIES.has(category)) return false;
    return text.includes("bourbon") && !looksLikeBourbonContextOnly(text);
  }

  if (mode === "whiskey") {
    return SERIOUS_WHISKEY_CATEGORIES.has(category) ||
      (NAME_MATCH_CATEGORIES.has(category) && isSeriousWhiskeyName(text));
  }

  return SERIOUS_WHISKEY_CATEGORIES.has(category) ||
    (NAME_MATCH_CATEGORIES.has(category) && isSeriousWhiskeyName(text));
}

function looksLikeBourbonContextOnly(text) {
  return [
    "bourbon cask irish",
    "ex-bourbon",
    "irish whiskey",
    "scotch",
    "single malt"
  ].some((phrase) => text.includes(phrase));
}

function looksLikeNonSeriousWhiskey(row, text) {
  const category = row.categoryName.toUpperCase();
  const isHoneyCask = /\bhoney\s+(?:barrels?|casks?)\b|\b(?:aged|finished)\s+in\s+honey\s+barrels?\b/i.test(text);
  const isMapleCask = /\bmaple\s+(?:syrup\s+)?(?:barrels?|casks?)\b|\b(?:aged|finished)\s+in\s+maple\s+(?:syrup\s+)?barrels?\b/i.test(text);

  if (category.includes("LIQUEUR") || category.includes("CREAM")) return true;
  if (Number.isFinite(row.proof) && row.proof > 0 && row.proof < 40) return true;
  if (/^ingredient\b/i.test(row.name)) return true;
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
    /\bflavo(?:u)?red\b/,
    /\bflask\b/,
    /\bglasses\b/,
    /\bgingerbread\b/,
    /\bjars?\s+of\b/,
    /\bcherries\b/,
    /\bliqueur\b/,
    /\bmint\b/,
    /\bmoonshine\b/,
    /\bnatural\s+flavou?rs?\b/,
    /\bold\s+fashion(?:ed)?\b/,
    /\bpeach\b/,
    /\bpeanut\s+butter\b/,
    /\bpecan\b/,
    /\bpickle\b/,
    /\bpineapple\b/,
    /\bpumpkin\b/,
    /\broot\s+beer\b/,
    /\brtd\b/,
    /\bshine\b/,
    /\bsalty\b/,
    /\bsmores\b/,
    /\bspice\b/,
    /\bspiced\b/,
    /\bstrawberry\b/,
    /\bsugarlands\b/,
    /\btea\b/,
    /\bvanilla\b/,
    /\bvap\b/,
    /\bwatermelon\b/,
    /\bbelt\s+buckle\b/,
    /\bpour\s+snout\b/,
    /\bsource\s+water\b/,
    /\bw\/\s*(?:\d+\s*)?(?:whiskey\s+)?stones\b/,
    /\bw\/\s*jigger\b/,
    /\b(?:2pk|3pk|4\s*pack|6\s*pack|12\s*pack|gift|pack|variety\s+pack)\b/,
    /\bw\/\s*glasses\b/
  ].some((pattern) => pattern.test(text));
}

function isSeriousWhiskeyName(text) {
  return /\b(whisk(?:e)?y|whisky|bourbon|rye|tennessee|single\s+malt|scotch)\b/i.test(text);
}

function inferIowaCategory(categoryName, rawName) {
  const category = normalizeWhitespace(categoryName).toUpperCase();
  const text = [category, rawName].join(" ").toLowerCase();

  if (category === "TENNESSEE WHISKIES") return "Tennessee Whiskey";
  if (category === "STRAIGHT RYE WHISKIES" || (/\brye\b/i.test(text) && !/\bhigh\s+rye\s+bourbon\b/i.test(text))) return "Rye Whiskey";
  if (/\bwheated?\b.*\bbourbon\b|\bbourbon\b.*\bwheated?\b/i.test(text)) return "Wheated Bourbon";
  if (/\bwheat\s+whisk(?:e)?y\b/i.test(text)) return "Wheat Whiskey";
  if (category === "CANADIAN WHISKIES" || /\bcanadian\b.*\bwhisk(?:e)?y\b|\bcanadian\s+whisk(?:e)?y\b/i.test(text)) return "Canadian Whisky";
  if (category === "SINGLE MALT SCOTCH" || category === "SCOTCH WHISKIES" || /\bscotch\b/i.test(text)) return "Scotch Whisky";
  if (category === "IRISH WHISKIES") return "Irish Whiskey";
  if (/\bjapanese\b.*\bwhisk(?:e)?y\b/i.test(text)) return "Japanese Whisky";
  if (/\bamerican\s+single\s+malt\b/i.test(text)) return "American Single Malt";
  if (/\bsingle\s+malt\b/i.test(text)) return "Single Malt / World Whisky";
  if (category === "BLENDED WHISKIES") return "Blended Whiskey";
  if (category === "BOTTLED IN BOND BOURBON") return "Bottled in Bond Bourbon";
  if (category.includes("BOURBON") || /\bbourbon\b/i.test(text)) return "Bourbon";
  if (category === "CORN WHISKIES" || /\bcorn\s+whisk(?:e)?y\b/i.test(text)) return "American Whiskey";
  if (/\bwhisk(?:e)?y\b|\bwhisky\b/i.test(text)) return "Whiskey";
  return titleCaseProductName(categoryName);
}

function normalizeIowaSize(value) {
  const ml = parseNumber(value);
  if (!Number.isFinite(ml)) return null;
  if (ml === 1000) return "1L";
  if (ml === 1750) return "1.75L";
  return ml + "ml";
}

function parseIowaAge(value) {
  const years = parseNumber(value);
  if (!Number.isFinite(years) || years <= 0) return { label: "NAS", years: null };
  return {
    label: years + " year" + (years === 1 ? "" : "s"),
    years
  };
}

function parseNumber(value) {
  const parsed = Number(normalizeWhitespace(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDate(value) {
  const clean = normalizeWhitespace(value);
  if (!clean) return "";
  return clean.replace(/T00:00:00\.000$/, "");
}

function normalizeDigits(value) {
  return normalizeWhitespace(value).replace(/\D/g, "");
}

function cleanVendorName(value) {
  return titleCaseProductName(normalizeWhitespace(value).replace(/\s{2,}/g, " "));
}

function titleCaseProductName(value) {
  const clean = normalizeWhitespace(value);
  if (!clean) return "";
  if (/[a-z]/.test(clean)) return clean;

  return clean.toLowerCase().replace(/\b([a-z0-9']+)\b/g, (word) => {
    if (/^\d+(yr|yo|pr|pf)$/.test(word)) return word.toUpperCase();
    if (["bib", "btb", "rtd", "sb", "sbs", "vap"].includes(word)) return word.toUpperCase();
    if (word === "co") return "Co";
    if (["and", "by", "in", "of", "on", "to"].includes(word)) return word.slice(0, 1).toUpperCase() + word.slice(1);
    if (word.length <= 2 && /^[a-z]+$/.test(word)) return word.toUpperCase();
    return word.slice(0, 1).toUpperCase() + word.slice(1);
  });
}

function normalizeIowaAbdBottle(record) {
  const fields = [
    "itemNumber",
    "name",
    "categoryName",
    "vendorNumber",
    "vendorName",
    "bottleVolumeMl",
    "pack",
    "age",
    "proof",
    "upc",
    "stateBottleCost",
    "stateCaseCost",
    "stateBottleRetail",
    "reportDate"
  ];

  const normalized = {
    id: slugify([record.name, record.size, record.itemNumber].filter(Boolean).join(" ")),
    identityKey: makeIowaIdentityKey(record),
    name: record.name,
    producer: record.vendorName,
    supplier: record.vendorName,
    category: record.category,
    bottleKind: inferBottleKind({ name: record.name, category: record.category }),
    proof: record.proof,
    age: record.age,
    ageYears: record.ageYears,
    size: record.size,
    upc: record.upc || null,
    barcodes: unique([record.upc]),
    aliases: unique([record.name, record.rawName, record.itemNumber, record.upc]),
    sourceRefs: [
      {
        sourceId: SOURCE.id,
        sourceRecordId: record.itemNumber,
        sourceUrl: SOURCE.url,
        retrievedAt: record.retrievedAt,
        fields
      }
    ],
    prices: []
  };

  if (Number.isFinite(record.stateBottleRetail)) {
    normalized.prices.push({
      sourceId: SOURCE.id,
      region: SOURCE.region,
      retailPrice: record.stateBottleRetail,
      wholesalePrice: Number.isFinite(record.stateBottleCost) ? record.stateBottleCost : null,
      caseCost: Number.isFinite(record.stateCaseCost) ? record.stateCaseCost : null,
      size: record.size,
      reportDate: record.reportDate,
      listDate: record.listDate,
      retrievedAt: record.retrievedAt
    });
  }

  return normalized;
}

function makeIowaIdentityKey(record) {
  return [
    slugify(record.name),
    slugify(record.size || ""),
    slugify(record.itemNumber)
  ].filter(Boolean).join("|");
}

function buildImportPayload(rows, retrievedAt) {
  const bottles = mergeCatalogRecords(rows.map(normalizeIowaAbdBottle));
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
  if (!args.input) throw new Error("Provide --input data/raw/iowa-abd/products-current.json");

  const retrievedAt = new Date().toISOString();
  const json = fs.readFileSync(path.resolve(args.input), "utf8");
  const rows = parseIowaAbdProductsJson(json, { mode: args.mode, retrievedAt });
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
  normalizeIowaAbdBottle,
  normalizeIowaAbdRow,
  normalizeIowaSize,
  parseIowaAbdProductsJson,
  parseIowaAge,
  titleCaseProductName
};
