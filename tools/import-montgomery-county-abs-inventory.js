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
  id: "montgomery_county_abs_inventory",
  name: "Montgomery County ABS Store Inventory and Sale Items",
  url: "https://data.montgomerycountymd.gov/Community-Recreation/ABS-Store-Inventory-and-Sale-Items/ib5t-5ncy",
  dataUrl: "https://data.montgomerycountymd.gov/resource/ib5t-5ncy.json",
  region: "MD-Montgomery",
  sourceType: "county_control_inventory"
};

const SERIOUS_WHISKEY_CATEGORIES = new Set([
  "AMERICAN SINGLE MALT",
  "BOTTLED IN BOND",
  "BLENDED WHISKEY",
  "CANADIAN WHISKEY",
  "DOMESTIC SCOTCH",
  "IMPORTED SCOTCH",
  "INDIAN WHISKY",
  "IRISH WHISKEY",
  "SINGLE MALT IRISH WHISKEY",
  "SINGLE MALT SCOTCH",
  "SOUR MASH WHISKEY",
  "STRAIGHT BOURBON WHISKEY",
  "STRAIGHT RYE WHISKEY"
]);

function parseArgs(argv) {
  const args = {
    mode: "serious",
    input: "data/raw/montgomery-county-abs/inventory-current.json"
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input") args.input = argv[++i];
    if (arg === "--out") args.out = argv[++i];
    if (arg === "--mode") args.mode = argv[++i];
  }

  return args;
}

function parseMontgomeryInventoryJson(input, options = {}) {
  const rows = Array.isArray(input) ? input : JSON.parse(String(input || "[]"));
  const retrievedAt = options.retrievedAt || new Date().toISOString();

  return rows
    .map((row) => normalizeInventoryRow(row, {
      retrievedAt,
      sourceFile: options.sourceFile || ""
    }))
    .filter(Boolean)
    .filter((row) => includeRow(row, options.mode || "serious"))
    .sort((a, b) => a.name.localeCompare(b.name) || String(a.size).localeCompare(String(b.size)));
}

function normalizeInventoryRow(row, options = {}) {
  const code = normalizeWhitespace(row.code);
  const rawName = cleanProductName(row.description);
  if (!code || !rawName) return null;

  const age = parseAgeFromName(rawName);
  const regularPrice = parseOptionalCurrency(row.price);
  const salePrice = parseOptionalCurrency(row.saleprice);
  const category = normalizeWhitespace(row.category);

  return {
    sourceId: SOURCE.id,
    sourceRecordId: makeSourceRecordId(code, row.size),
    sourceFile: options.sourceFile || "",
    productCode: code,
    name: cleanDisplayName(rawName),
    rawName,
    category: inferInventoryCategory(category, rawName),
    rawCategory: category,
    size: normalizeSize(row.size) || parseSizeFromName(rawName),
    rawSize: normalizeWhitespace(row.size),
    totalInventory: parseInteger(row.totalinventory),
    regularPrice,
    salePrice,
    saleEndDate: normalizeDate(row.saleenddate),
    price: Number.isFinite(salePrice) ? salePrice : regularPrice,
    proof: parseProofFromName(rawName),
    age: age.label,
    ageYears: age.years,
    sourceUrl: SOURCE.url,
    dataUrl: SOURCE.dataUrl,
    region: SOURCE.region,
    retrievedAt: options.retrievedAt || new Date().toISOString()
  };
}

function includeRow(row, mode) {
  if (!row) return false;
  if (mode === "all") return true;

  const category = row.rawCategory.toUpperCase();
  const text = [row.rawCategory, row.rawName, row.name].join(" ").toLowerCase();

  if (mode === "whiskey" || mode === "serious") {
    return SERIOUS_WHISKEY_CATEGORIES.has(category) && !looksLikeNonSeriousWhiskeyProduct(text, row.rawSize);
  }

  if (looksLikeNonBourbonProduct(text, row.rawSize)) return false;

  if (mode === "whiskey") return /whisk|bourbon|bourb/i.test(text) && !looksLikeNonWhiskeyProduct(text);
  if (category === "STRAIGHT BOURBON WHISKEY") return true;
  if (category === "BOTTLED IN BOND") return true;
  if (isSeriousTennesseeWhiskey(text)) return true;
  if (category === "SOUR MASH WHISKEY" && /\b(evan\s+williams|michters|michter's|old\s+elk)\b/i.test(text)) return true;
  return /\b(bourbon|bourb|brbn|ksbw|straight bourbon|straight bourb|bottled in bond|bib)\b/i.test(text) && !looksLikeNonWhiskeyProduct(text);
}

function looksLikeNonBourbonProduct(text, rawSize = "") {
  const isHighRyeBourbon = /\bhigh\s+rye\b/.test(text) && /\bbourb(?:on)?\b/.test(text);
  return [
    /\bapple\b/,
    /\bapples\b/,
    /\bblackberry\b/,
    /\bcherry\b/,
    /\bcinnamon\b/,
    /\bcocktail\b/,
    /\bcola\b/,
    /\bcoke\b/,
    /\bcream\b/,
    /\bfire\b/,
    /\bflavo(?:u)?red\b/,
    /\bginger\s+ale\b/,
    /\bgift\b/,
    /\bhoney\b/,
    /\bliqueur\b/,
    /\bold\s+fashion(?:ed)?\b/,
    /\bmanhattan\b/,
    /\bpeach\b/,
    /\bpineapple\b/,
    /\bready\s*to\s*drink\b/,
    /\broot\s+beer\b/,
    /\brtd\b/,
    /\bscotch\b/,
    /\bsour\s+mix\b/,
    /\bstraight\s+rye\b/,
    /\brye\b/,
    /\brye\s+whisk(?:e)?y\b/,
    /\bdark\s+rye\b/,
    /\bwhite\s+dog\b/,
    /\bmash\s*#?1\b/,
    /\b(?:2pk|3pk|4pk|6pk|10pk|12pk|pack)\b/,
    /w\/\s*(?:bag|caps|cocktail|equity|glass|glasses|gls|ice|lowball|rocks|stadium)\b/
  ].some((pattern) => pattern.test([text, rawSize].join(" "))) && !isHighRyeBourbon;
}

function looksLikeNonSeriousWhiskeyProduct(text, rawSize = "") {
  const clean = normalizeWhitespace([text, rawSize].join(" ")).toLowerCase();
  const isHoneyCask = /\bhoney\s+(?:barrels?|casks?)\b|\b(?:aged|finished)\s+in\s+honey\s+barrels?\b/i.test(clean);
  const isMapleCask = /\bmaple\s+(?:syrup\s+)?(?:barrels?|casks?)\b|\b(?:aged|finished)\s+in\s+maple\s+(?:syrup\s+)?barrels?\b/i.test(clean);

  if (/\bhoney\b/i.test(clean) && !isHoneyCask && !/\bhoneydew\b/i.test(clean)) return true;
  if (/\bmaple\b/i.test(clean) && !isMapleCask && !/\bmaplewood\b/i.test(clean)) return true;

  return [
    /\bapple\b/,
    /\bapples\b/,
    /\bapple butter\b/,
    /\bapple fizz\b/,
    /\bbanana\b/,
    /\bblackberry\b/,
    /\bbourbon ball\b/,
    /\bbourbon cream\b/,
    /\bbourbon mule\b/,
    /\bbrown sugar\b/,
    /\bcherry\b/,
    /\bchocolate\b/,
    /\bcinnamon\b/,
    /\bcocktail\b/,
    /\bcoca cola\b/,
    /\bcola\b/,
    /\bcold brew\b/,
    /\bcombo\b/,
    /\bcream\b/,
    /\bfigzilla\b/,
    /\bfire\b/,
    /\bflavo(?:u)?red\b/,
    /\bflavo(?:u)?rs?\b/,
    /\bfizz\b/,
    /\bginger\s+ale\b/,
    /\bgift\b/,
    /\bglasses?\b/,
    /\bhoney\s*&\s*bourbon\b/,
    /\bhoney\s+bourbon\b/,
    /\bhoney\s+vanilla\b/,
    /\bkit\b/,
    /\blemonade\b/,
    /\bliqueur\b/,
    /\bmango\b/,
    /\bmultipacks?\b/,
    /\bpallet\b/,
    /\bpeach\b/,
    /\bpecan bourbon\b/,
    /\bpineapple\b/,
    /\bratafia\b/,
    /\bready\s*to\s*drink\b/,
    /\broot\s*beer\b/,
    /\brtd\b/,
    /\bsalty\b/,
    /\bsampler\b/,
    /\bsour\s+mix\b/,
    /\bstadium\s+bag\b/,
    /\bvanilla\b/,
    /\bvariety\b/,
    /\bvap\b/,
    /\bwatermelon\b/,
    /\bwinter jack\b/,
    /\bwith\s+(?:4\s+)?flavors?\b/,
    /\bwith\s+(?:glasses?|stir spoon|ice mold|jack\s*&\s*coke glass)\b/,
    /\bw\/\s*(?:bag|caps|cocktail|equity|glass|glasses|gls|ice|lowball|rocks|stadium)\b/,
    /\b\d+\s*-\s*\d+\s*packs?\b/,
    /\b\d+\s*packs?\b/,
    /\b\d+\s*pk\b/
  ].some((pattern) => pattern.test(clean));
}

function looksLikeNonWhiskeyProduct(text) {
  return /\b(beer|brandy|cabernet|chardonnay|cognac|cordial|gin|liqueur|merlot|pinot|rum|sauvignon|scotch|tequila|vodka|wine)\b/i.test(text);
}

function inferInventoryCategory(category, name) {
  const sourceCategory = normalizeWhitespace(category).toUpperCase();
  const text = cleanProductName(name).toLowerCase();
  if (["DOMESTIC SCOTCH", "IMPORTED SCOTCH", "SINGLE MALT SCOTCH"].includes(sourceCategory)) return "Scotch Whisky";
  if (/\b(single malts of scotland|scotch|ardbeg|balvenie|benriach|bruichladdich|chivas|dalmore|dewars?|dimple|glenfiddich|glenlivet|glenmorangie|highland park|johnnie walker|lagavulin|laphroaig|loch lomond|mcclelland's|macallan)\b/i.test(text)) return "Scotch Whisky";
  if (/\b(fuyu|japanese|nikka|yamazaki)\b/i.test(text)) return "Japanese Whisky";
  if (sourceCategory === "INDIAN WHISKY" || /\bamrut\b/i.test(text)) return "Single Malt / World Whisky";
  if (sourceCategory === "CANADIAN WHISKEY" || /\bcanadian\b|\bcrown royal\b/i.test(text)) return "Canadian Whisky";
  if (sourceCategory === "STRAIGHT RYE WHISKEY" || /\brye\b/i.test(text)) return "Rye Whiskey";
  if (sourceCategory === "AMERICAN SINGLE MALT" || /\bamerican\s+(?:sngl\s+mlt|single malt)\b|\b(old line|stranahans?|courage (?:and|&) conviction|virginia distillery|st george lot|st\.?\s*george lot)\b/i.test(text)) return "American Single Malt";
  if (sourceCategory === "IRISH WHISKEY" || sourceCategory === "SINGLE MALT IRISH WHISKEY" || /\birish\b|\bbushmills\b|\bjameson\b|\bknappogue\b|\bredbreast\b|\btullamore\b|\bwriters tears\b/i.test(text)) return "Irish Whiskey";
  if (isSeriousTennesseeWhiskey(text)) return "Tennessee Whiskey";
  if (sourceCategory === "BOTTLED IN BOND" || /\bbottled?\s+in\s+bond\b|\bbib\b/i.test(text)) return "Bottled in Bond Bourbon";
  if (sourceCategory.includes("BOURBON") || /\b(bourbon|bourb|brbn|ksbw)\b/i.test(text)) return "Bourbon";
  if (sourceCategory === "SOUR MASH WHISKEY") return "American Whiskey";
  if (sourceCategory === "BLENDED WHISKEY") return "Blended Whiskey";
  return normalizeWhitespace(category);
}

function isSeriousTennesseeWhiskey(text) {
  const clean = normalizeWhitespace(text).toLowerCase();
  if (/\b(apple|blackberry|cola|coke|fire|honey|rtd|rye|stadium\s+bag)\b/.test(clean)) return false;
  return /\b(jack daniels black|jack daniels bonded|jack daniels single|jack daniels sinatra|george dickel|gentleman jack|nearest green|nelson's green brier|uncle nearest)\b/.test(clean);
}

function makeSourceRecordId(code, size) {
  return [code, normalizeSize(size) || normalizeWhitespace(size)].filter(Boolean).join(":");
}

function cleanProductName(value) {
  return normalizeWhitespace(value)
    .replace(/[Ã¢â‚¬ËœÃ¢â‚¬â„¢]/g, "'")
    .replace(/[Ã¢â‚¬Å“Ã¢â‚¬Â]/g, "\"")
    .trim();
}

function cleanDisplayName(value) {
  return titleCase(cleanProductName(value)
    .replace(/\s*\(\d+\s*Bottle\)$/i, "")
    .replace(/\s*\(\d+-Pack\)$/i, "")
    .replace(/\s*-\s*(?:50|100|200|375|700|750)ML\b/ig, "")
    .replace(/\s*-\s*1(?:\.00)?L(?:TR)?\b/ig, "")
    .replace(/\s*-\s*1\.75L\b/ig, "")
    .replace(/\s+\d+(?:\.\d+)?\s*(?:PROOF|PRF|P)\b/ig, "")
    .replace(/\s+/g, " ")
    .trim());
}

function titleCase(value) {
  const keepUpper = new Set(["BIB", "BRBN", "KSBW", "KY", "MD", "PRVT", "SB", "XO"]);
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
  if (clean === "1000ML" || clean === "1.00L" || clean === "1LTR") return "1L";
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

function parseSizeFromName(value) {
  const match = cleanProductName(value).match(/\b(50|100|200|375|700|750)ML\b|\b(1(?:\.00)?L|1\.75L)\b/i);
  if (!match) return null;
  return normalizeSize(match[0]);
}

function normalizeDate(value) {
  const clean = normalizeWhitespace(value);
  if (!clean) return "";
  const iso = clean.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return [iso[1], iso[2], iso[3]].join("-");
  const short = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!short) return clean;
  const year = short[3].length === 2 ? "20" + short[3] : short[3];
  return [year, short[1].padStart(2, "0"), short[2].padStart(2, "0")].join("-");
}

function parseOptionalCurrency(value) {
  const parsed = parseCurrency(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseInteger(value) {
  const parsed = Number(normalizeWhitespace(value).replace(/,/g, ""));
  return Number.isInteger(parsed) ? parsed : null;
}

function parseProofFromName(value) {
  const match = cleanProductName(value).match(/\b(\d+(?:\.\d+)?)\s*(?:PROOF|PRF|P)\b/i);
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

function normalizeInventoryBottle(record) {
  const fields = [
    "productCode",
    "rawCategory",
    "name",
    "rawName",
    "size",
    "totalInventory",
    "regularPrice",
    "salePrice",
    "saleEndDate",
    "proof",
    "age"
  ];

  return {
    id: slugify([record.name, record.size, record.productCode].filter(Boolean).join(" ")),
    identityKey: makeInventoryIdentityKey(record),
    name: record.name,
    producer: "",
    supplier: "",
    category: record.category,
    bottleKind: inferBottleKind({ name: record.name, category: record.category }),
    proof: record.proof,
    age: record.age,
    ageYears: record.ageYears,
    size: record.size,
    aliases: unique([record.name, record.rawName, record.productCode]),
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
        regularRetail: record.regularPrice,
        salePrice: record.salePrice,
        saleEndDate: record.saleEndDate,
        totalInventory: record.totalInventory,
        size: record.size,
        retrievedAt: record.retrievedAt
      }
    ] : []
  };
}

function makeInventoryIdentityKey(record) {
  return [slugify(record.name), slugify(record.size || ""), slugify(record.productCode)].filter(Boolean).join("|");
}

function buildImportPayload(rows, retrievedAt, rawRecordCount) {
  const bottles = mergeCatalogRecords(rows.map(normalizeInventoryBottle));
  return {
    schemaVersion: 1,
    source: SOURCE,
    retrievedAt,
    rawRecordCount,
    bottleCount: bottles.length,
    records: rows,
    bottles
  };
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.input) throw new Error("Provide --input data/raw/montgomery-county-abs/inventory-current.json");

  const inputPath = path.resolve(args.input);
  const input = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const retrievedAt = new Date().toISOString();
  const rows = parseMontgomeryInventoryJson(input, {
    mode: args.mode,
    retrievedAt,
    sourceFile: path.relative(process.cwd(), inputPath)
  });
  const payload = buildImportPayload(rows, retrievedAt, input.length);
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
  normalizeInventoryRow,
  normalizeSize,
  parseMontgomeryInventoryJson
};
