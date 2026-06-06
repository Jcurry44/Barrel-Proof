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

const SOURCE = {
  id: "ohlq_brand_master",
  name: "Ohio Liquor Brand Master",
  url: "https://ops.ohlq.com/brandmaster/public",
  dataUrl: "https://ops.ohlq.com/brandmaster.json",
  region: "OH",
  sourceType: "control_state_catalog"
};

const COLUMNS = [
  "code",
  "name",
  "category",
  "type",
  "subType",
  "ounces",
  "status",
  "retailPrice",
  "wholesalePrice"
];

const COMMON_SIZES = [
  { ml: 50, label: "50ml" },
  { ml: 100, label: "100ml" },
  { ml: 200, label: "200ml" },
  { ml: 375, label: "375ml" },
  { ml: 500, label: "500ml" },
  { ml: 700, label: "700ml" },
  { ml: 750, label: "750ml" },
  { ml: 1000, label: "1L" },
  { ml: 1750, label: "1.75L" }
];

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

function parseOhlqBrandMasterJson(jsonText, options = {}) {
  const payload = JSON.parse(jsonText);
  const retrievedAt = options.retrievedAt || new Date().toISOString();
  const rows = Array.isArray(payload.data) ? payload.data : [];

  return rows
    .map((row) => normalizeOhlqRow(row, { retrievedAt }))
    .filter((row) => includeRow(row, options.mode || "serious"));
}

function normalizeOhlqRow(row, options = {}) {
  const record = Object.fromEntries(COLUMNS.map((field, index) => [field, row[index]]));
  const rawName = normalizeWhitespace(record.name);
  const name = titleCaseProductName(rawName);
  const retailPrice = parseCurrency(record.retailPrice);
  const wholesalePrice = parseCurrency(record.wholesalePrice);
  const categoryParts = unique([record.type, record.subType, record.category]);

  return {
    sourceId: SOURCE.id,
    sourceRecordId: normalizeWhitespace(record.code),
    ohlqCode: normalizeWhitespace(record.code),
    name,
    rawName,
    category: inferOhlqCategory({ ...record, name }),
    productCategory: normalizeWhitespace(record.category),
    productType: normalizeWhitespace(record.type),
    productSubType: normalizeWhitespace(record.subType),
    status: normalizeWhitespace(record.status),
    ounces: parseNumber(record.ounces),
    size: normalizeOuncesToSize(record.ounces),
    retailPrice,
    wholesalePrice,
    sourceUrl: SOURCE.url,
    dataUrl: SOURCE.dataUrl,
    region: SOURCE.region,
    retrievedAt: options.retrievedAt || new Date().toISOString()
  };
}

function includeRow(row, mode) {
  if (mode === "all") return true;

  const text = [
    row.name,
    row.rawName,
    row.productCategory,
    row.productType,
    row.productSubType
  ].join(" ").toLowerCase();

  if (row.productCategory.toLowerCase() !== "whiskey") return false;
  if (looksLikeNonSeriousWhiskey(row, text)) return false;

  if (mode === "bourbon") {
    return row.productSubType.toLowerCase() === "bourbon" ||
      text.includes("bourbon") ||
      row.productSubType.toLowerCase() === "tennessee" ||
      isSeriousTennesseeWhiskey(text);
  }

  if (mode === "whiskey") {
    return true;
  }

  return true;
}

function looksLikeNonSeriousWhiskey(row, text) {
  const subtype = row.productSubType.toLowerCase();
  const isHoneyCask = /\bhoney\s+(?:barrels?|casks?)\b|\b(?:aged|finished)\s+in\s+honey\s+barrels?\b/i.test(text);
  const isMapleCask = /\bmaple\s+(?:syrup\s+)?(?:barrels?|casks?)\b|\b(?:aged|finished)\s+in\s+maple\s+(?:syrup\s+)?barrels?\b/i.test(text);

  if (subtype === "moonshine" || /\bmoonshine\b/i.test(text)) return true;
  if (/\bhoney\b/i.test(text) && !isHoneyCask) return true;
  if (/\bmaple\b/i.test(text) && !isMapleCask) return true;
  if (/\bcream\b/i.test(text) && !/\bcream\s+of\s+kentucky\b/i.test(text)) return true;

  return [
    /\bapple\b/,
    /\bbanana\b/,
    /\bblackberry\b/,
    /\bblueberry\b/,
    /\bblue\s+razzberry\b/,
    /\bbrandy\b/,
    /\bbutterscotch\b/,
    /\bcandy\b/,
    /\bcaramel\b/,
    /\bcherries\b/,
    /\bcherry\b/,
    /\bchocolate\b/,
    /\bcinnamon\b/,
    /\bcinnamint\b/,
    /\bcoconut\b/,
    /\bcocktails?\b/,
    /\bcoffee\b/,
    /\bcookie\b/,
    /\bcotton\s+candy\b/,
    /\bdough\b/,
    /\bfireball\b/,
    /\bflavo(?:u)?red\b/,
    /\bgingerbread\b/,
    /\bglasses\b/,
    /\blemon(?:ade|-drop)\b/,
    /\bliqueur\b/,
    /\bmint\b/,
    /\bmidnight\s+moon\b/,
    /\bnatural\s+flavou?rs?\b/,
    /\bpeach\b/,
    /\bpeanut\s+butter\b/,
    /\bpecan\b/,
    /\bpeppermint\b/,
    /\bpickle\b/,
    /\bpineapple\b/,
    /\bpumpkin\b/,
    /\braspberry\b/,
    /\brazz\b/,
    /\brtd\b/,
    /\bsalted\s+caramel\b/,
    /\bshortcake\b/,
    /\bspice\b/,
    /\bspiced\b/,
    /\bstrawberry\b/,
    /\btea\b/,
    /\bvanilla\b/,
    /\bvap\b/,
    /\bwatermelon\b/,
    /\b(?:2pk|3pk|4\s*pack|6\s*pack|12\s*pack|gift|pack|variety\s+pack)\b/
  ].some((pattern) => pattern.test(text));
}

function inferOhlqCategory(record) {
  const nameText = normalizeWhitespace(record.name).toLowerCase();
  const text = [record.name, record.type, record.subType, record.category].join(" ").toLowerCase();
  const type = normalizeWhitespace(record.type).toLowerCase();
  const subtype = normalizeWhitespace(record.subType).toLowerCase();

  if (type === "american" && subtype === "single malt") return "American Single Malt";
  if (type === "american" && subtype === "tennessee") return "Tennessee Whiskey";
  if (isSeriousTennesseeWhiskey(text)) return "Tennessee Whiskey";
  if (
    (subtype === "rye" || /\brye\b|\brye\s+whisk(?:e)?y\b|\bstraight\s+rye\b/i.test(nameText)) &&
    !(/\bbourbon\b/i.test(nameText) && !/\brye\s+whisk(?:e)?y\b|\bstraight\s+rye\b|\bmalted\s+rye\b/i.test(nameText))
  ) return "Rye Whiskey";
  if (/\bwheated?\b.*\bbourbon\b|\bbourbon\b.*\bwheated?\b/i.test(text)) return "Wheated Bourbon";
  if (subtype === "wheat" || /\bwheat\s+whisk(?:e)?y\b/i.test(text)) return "Wheat Whiskey";
  if (type === "canadian") return subtype === "rye" ? "Rye Whiskey" : "Canadian Whisky";
  if (type === "scotch") return "Scotch Whisky";
  if (type === "irish") return "Irish Whiskey";
  if (type === "japanese") return "Japanese Whisky";
  if (type === "indian") return "Single Malt / World Whisky";
  if (/\bsingle\s+malt\b/i.test(text)) return "Single Malt / World Whisky";
  if (subtype === "blend") return type === "american" ? "Blended Whiskey" : "Whiskey";
  if ((/\bbottled?\s+in\s+bond\b|\bbib\b/i.test(text)) && /\bbourbon\b/i.test(text)) return "Bottled in Bond Bourbon";
  if (subtype === "bourbon" || /\bbourbon\b/i.test(text)) return "Bourbon";
  if (type === "american" || subtype === "corn" || subtype === "malt") return "American Whiskey";
  if (record.category && record.type) return [record.type, record.subType, record.category].filter(Boolean).join(" ");
  return "Whiskey";
}

function isSeriousTennesseeWhiskey(text) {
  const clean = normalizeWhitespace(text).toLowerCase();
  if (/\b(apple|cola|coke|fire|honey|moonshine|rye)\b/.test(clean)) return false;
  return /\b(jack daniel'?s|jack daniels|george dickel|uncle nearest|nearest green|tennessee whiskey)\b/.test(clean);
}

function normalizeOuncesToSize(value) {
  const ounces = parseNumber(value);
  if (!Number.isFinite(ounces)) return null;

  const ml = ounces * 29.5735295625;
  const closest = COMMON_SIZES
    .map((size) => ({ ...size, delta: Math.abs(size.ml - ml) }))
    .sort((a, b) => a.delta - b.delta)[0];

  if (closest && closest.delta <= 20) return closest.label;
  return Math.round(ml) + "ml";
}

function parseNumber(value) {
  const parsed = Number(normalizeWhitespace(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function titleCaseProductName(value) {
  const clean = normalizeWhitespace(value);
  if (!clean) return "";
  if (/[a-z]/.test(clean)) return clean;

  return clean.toLowerCase().replace(/\b([a-z0-9']+)\b/g, (word) => {
    if (/^\d+(yr|yo|pr)$/.test(word)) return word.toUpperCase();
    if (["bib", "btb", "rtd"].includes(word)) return word.toUpperCase();
    if (word === "xo" || word === "vsop") return word.toUpperCase();
    if (word.length <= 2 && /^[a-z]+$/.test(word)) return word.toUpperCase();
    return word.slice(0, 1).toUpperCase() + word.slice(1);
  });
}

function normalizeOhlqBottle(record) {
  const fields = [
    "ohlqCode",
    "name",
    "productCategory",
    "productType",
    "productSubType",
    "ounces",
    "status",
    "retailPrice",
    "wholesalePrice"
  ];

  const normalized = {
    id: slugify([record.name, record.size, record.ohlqCode].filter(Boolean).join(" ")),
    identityKey: makeOhlqIdentityKey(record),
    name: record.name,
    producer: "",
    supplier: "",
    category: record.category,
    bottleKind: inferBottleKind({ name: record.name, category: record.category }),
    proof: null,
    age: "Unknown",
    ageYears: null,
    size: record.size,
    aliases: unique([record.name, record.rawName, record.ohlqCode]),
    sourceRefs: [
      {
        sourceId: SOURCE.id,
        sourceRecordId: record.ohlqCode,
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
      wholesalePrice: Number.isFinite(record.wholesalePrice) ? record.wholesalePrice : null,
      status: record.status,
      size: record.size,
      retrievedAt: record.retrievedAt
    });
  }

  return normalized;
}

function makeOhlqIdentityKey(record) {
  return [
    slugify(record.name),
    slugify(record.size || ""),
    slugify(record.ohlqCode)
  ].filter(Boolean).join("|");
}

function buildImportPayload(rows, retrievedAt) {
  const bottles = mergeCatalogRecords(rows.map(normalizeOhlqBottle));
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
  if (!args.input) throw new Error("Provide --input data/raw/ohlq/brandmaster-current.json");

  const retrievedAt = new Date().toISOString();
  const json = fs.readFileSync(path.resolve(args.input), "utf8");
  const rows = parseOhlqBrandMasterJson(json, { mode: args.mode, retrievedAt });
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
  normalizeOhlqBottle,
  normalizeOhlqRow,
  normalizeOuncesToSize,
  parseOhlqBrandMasterJson,
  titleCaseProductName
};
