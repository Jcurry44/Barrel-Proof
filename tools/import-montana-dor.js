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
  id: "montana_dor_price_disk",
  name: "Montana Department of Revenue Price Disk",
  url: "https://revenuefiles.mt.gov/card/alcoholic-beverages/agency-liquor-stores/product-information",
  dataUrl: "https://revenuefiles.mt.gov/files/Alcoholic-Beverages/Agency-Liquor-Stores/Product-Information/Price-Disks/PriceDisk-May-2026.xlsx",
  region: "MT",
  sourceType: "control_state_catalog"
};

const PRODUCT_CLASS_LABELS = {
  "100": "Single Malt Scotch Whisky",
  "101": "Blended Scotch Whisky",
  "102": "Scotch Whisky",
  "110": "Canadian Whisky",
  "111": "Canadian Whisky",
  "120": "Irish Whiskey",
  "121": "Irish Whiskey",
  "130": "Japanese and World Whisky",
  "131": "Imported Whiskey",
  "150": "Bottled in Bond Bourbon and American Whiskey",
  "151": "Straight Bourbon Whiskey",
  "152": "Blended Bourbon Whiskey",
  "160": "Blended American Whiskey",
  "165": "Kentucky Whiskey",
  "170": "Tennessee Whiskey",
  "180": "Bottled in Bond Rye Whiskey",
  "181": "Straight Rye Whiskey",
  "190": "Corn Whiskey",
  "191": "Light Whiskey",
  "199": "Miscellaneous American Whiskey",
  "401": "Flavored Whiskey and Specialty Whiskey"
};

const CORE_BOURBON_CLASSES = new Set(["150", "151", "152", "170"]);
const NAME_MATCH_CLASSES = new Set(["160", "165", "190", "191", "199", "401"]);
const SERIOUS_WHISKEY_CLASSES = new Set([
  "100",
  "101",
  "102",
  "110",
  "111",
  "120",
  "121",
  "130",
  "131",
  "150",
  "151",
  "152",
  "160",
  "165",
  "170",
  "180",
  "181",
  "190",
  "191",
  "199",
  "401"
]);

function parseArgs(argv) {
  const args = {
    mode: "serious",
    year: "2026"
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input") args.input = argv[++i];
    if (arg === "--out") args.out = argv[++i];
    if (arg === "--mode") args.mode = argv[++i];
    if (arg === "--year") args.year = argv[++i];
  }

  return args;
}

function parseMontanaPriceDiskXlsx(buffer, options = {}) {
  const rows = readXlsxRows(buffer, "xl/worksheets/sheet1.xml");
  return parseMontanaPriceDiskRows(rows, options);
}

function parseMontanaPriceDiskRows(rows, options = {}) {
  const headerIndex = (rows || []).findIndex((row) => row.includes("Item Code") && row.includes("Description"));
  if (headerIndex < 0) return [];

  const headers = rows[headerIndex].map(normalizeWhitespace);
  const index = Object.fromEntries(headers.map((header, columnIndex) => [header, columnIndex]));
  const retrievedAt = options.retrievedAt || new Date().toISOString();

  return rows.slice(headerIndex + 1)
    .map((row) => normalizeMontanaRow(row, index, {
      retrievedAt,
      year: options.year || "2026"
    }))
    .filter(Boolean)
    .filter((row) => includeRow(row, options.mode || "serious"));
}

function normalizeMontanaRow(row, index, options = {}) {
  const value = (field) => index[field] >= 0 ? normalizeWhitespace(row[index[field]]) : "";
  const itemCode = value("Item Code");
  const rawName = value("Description");
  if (!itemCode || !rawName) return null;

  const codeParts = parseItemCode(itemCode);
  const details = parseProductDetails(rawName, codeParts.sizeCode);

  return {
    sourceId: SOURCE.id,
    sourceRecordId: itemCode,
    itemCode,
    month: value("Month"),
    effectiveMonth: normalizeEffectiveMonth(value("Month"), options.year || "2026"),
    productClass: codeParts.productClass,
    productClassLabel: PRODUCT_CLASS_LABELS[codeParts.productClass] || "Montana product class " + codeParts.productClass,
    nabcaNumber: codeParts.nabcaNumber,
    sizeCode: codeParts.sizeCode,
    name: details.name,
    rawName,
    category: inferMontanaCategory(rawName, codeParts.productClass),
    unitsPerCase: parseNumber(value("Units")),
    bottlePrice: parseCurrency(value("Price")),
    inventoryClass: value("Inv Class"),
    maintained: parseBoolean(value("Maintained")),
    repackable: value("Repackable"),
    repackQuantity: parseNumber(value("Repack Quantity")),
    proof: details.proof,
    age: details.age,
    ageYears: details.ageYears,
    size: details.size,
    sourceUrl: SOURCE.url,
    dataUrl: SOURCE.dataUrl,
    region: SOURCE.region,
    retrievedAt: options.retrievedAt || new Date().toISOString()
  };
}

function includeRow(row, mode) {
  if (!row) return false;
  if (mode === "all") return true;

  const text = [row.rawName, row.name, row.category].join(" ").toLowerCase();
  const productText = [row.rawName, row.name].join(" ").toLowerCase();
  if (mode === "whiskey" || mode === "serious") {
    return SERIOUS_WHISKEY_CLASSES.has(row.productClass) && !looksLikeNonSeriousWhiskey(productText);
  }

  if (looksLikeNonBourbonProduct(productText)) return false;
  if (CORE_BOURBON_CLASSES.has(row.productClass)) return true;
  if (!NAME_MATCH_CLASSES.has(row.productClass)) return false;

  return /\b(bourbon|brbn|bbn|ksbw|stbw|tenn(?:essee)?|jack daniel|george dickel|gentleman jack|uncle nearest)\b/i.test(text);
}

function looksLikeNonSeriousWhiskey(text) {
  const clean = normalizeWhitespace(text).toLowerCase();
  const isHoneyCask = /\bhoney\s+(?:barrels?|casks?)\b|\b(?:aged|finished)\s+in\s+honey\s+barrels?\b/i.test(clean);
  const isMapleCask = /\bmaple\s+(?:syrup\s+)?(?:barrels?|casks?)\b|\b(?:aged|finished)\s+in\s+maple\s+(?:syrup\s+)?barrels?\b/i.test(clean);

  if (/\bhoney\b/i.test(clean) && !isHoneyCask && !/\bhoneydew\b/i.test(clean)) return true;
  if (/\bmaple\b/i.test(clean) && !isMapleCask && !/\bmaplewood\b/i.test(clean)) return true;

  return [
    "apple",
    "apple pie",
    "banana",
    "barbecue",
    "blackberry",
    "black cherry",
    "black currant",
    "bourbon cream",
    "bourbon ball",
    "brandy lq",
    "brown sugar",
    "berry",
    "cherry bomb",
    "cherry",
    "chrry",
    "chocolate",
    "choc/pb",
    "cinnamon",
    "cinnamint",
    "caramel",
    "coff",
    "coffee",
    "cream liqueur",
    "cocktail",
    "coconut",
    "cranberry",
    "crnbry",
    "cookie dough",
    "evan williams fire",
    "fireball",
    "flavor",
    "sinfire",
    "flavored",
    "flv",
    "fruit",
    "huckleberry",
    "lemon drop",
    "lightnin",
    "liqueur",
    "mango",
    "marshmallow",
    "mocha",
    "moonshine",
    "mnshne",
    "nat fl",
    "natural flavor",
    "orange",
    "peach",
    "peanut butter",
    "pancakes",
    "bacon",
    "pecan",
    "pineapple",
    "punch",
    "razz",
    "ready-to-pour",
    "ready to pour",
    "revel stoke",
    "root beer",
    "rock & rye",
    "rock and rye",
    "salty caramel",
    "sample case",
    "samples",
    "sleeve",
    "spiced whiskey",
    "spicen",
    "sweet tea",
    "sweet lucy",
    "tenn apple",
    "tennessee apple",
    "trade show",
    "watermelon",
    "vanilla",
    "winter jack",
    "w/flavor",
    "yukon jack"
  ].some((phrase) => clean.includes(phrase));
}

function looksLikeNonBourbonProduct(text) {
  return [
    "apple pie",
    "banana",
    "blackberry",
    "bourbon cream",
    "bourbon ball",
    "cherry bomb",
    "chocolate",
    "cream liqueur",
    "cocktail",
    "cookie dough",
    "flavored",
    "honey liqueur",
    "liqueur",
    "lemon drop",
    "mango",
    "moonshine",
    "peach",
    "peanut butter",
    "pineapple",
    "root beer",
    "salty caramel",
    "sample case",
    "samples",
    "tenn apple",
    "tennessee apple",
    "trade show",
    "watermelon",
    "vodka",
    "tequila",
    "mezcal",
    "scotch",
    "cognac",
    "gin"
  ].some((phrase) => text.includes(phrase));
}

function inferMontanaCategory(rawName, productClass) {
  const text = normalizeWhitespace(rawName).toLowerCase();

  if (["100", "101", "102"].includes(productClass) || /\bscotch\b/i.test(text)) return "Scotch Whisky";
  if (["120", "121"].includes(productClass) || /\birish\b/i.test(text)) return "Irish Whiskey";
  if (/\bjapanese\b|\b(akashi|akkeshi|fuji|fuyu|hatozaki|hibiki|ichiro|kaiyo|kangakoi|nikka|ohishi|sensei|suntory|toki|yamato|yamazaki)\b/i.test(text)) return "Japanese Whisky";
  if (productClass === "130" || /\b(kavalan|paul\s+john|amrut|fukano|formosa|adictivo|world\s+whiskey)\b/i.test(text)) return "Single Malt / World Whisky";
  if (["110", "111"].includes(productClass) && /\brye\b/i.test(text)) return "Rye Whiskey";
  if (["110", "111"].includes(productClass) || /\bcanadian\b/i.test(text)) return "Canadian Whisky";
  if (["180", "181"].includes(productClass) || /\brye\s+whisk(?:e)?y\b|\bstraight\s+rye\b|\brye\b/i.test(text)) return "Rye Whiskey";
  if (/\bamerican\s+single\s+malt\b|\bsingle\s+malt\s+whisk(?:e)?y\b|\bsingle\s+malt\b/i.test(text)) return "American Single Malt";
  if (/\bw\.?\s*l\.?\s+weller\b|\bweller\b|\bsweet\s+wheat\b|\bwheated?\b.*\bbourbon\b|\bbourbon\b.*\bwheated?\b/i.test(text)) return "Wheated Bourbon";
  if (/\bwheat\s+whisk(?:e)?y\b|\bwheat\s+wsky\b|\bstraight\s+wheat\b|\bdouble\s+wheat\b/i.test(text)) return "Wheat Whiskey";
  if (productClass === "170" || /\btenn(?:essee)?\b|\bjack\s+daniel|\bgeorge\s+dickel\b|\bgentleman\s+jack\b|\buncle\s+nearest\b/i.test(text)) return "Tennessee Whiskey";
  if (/\bbib\b|\bbottled\s+in\s+bond\b/i.test(text)) return "Bottled in Bond Bourbon";
  if (["151", "152"].includes(productClass) || /\bbourbon\b|\bbrbn\b|\bbbn\b|\bksbw\b|\bsbw\b/i.test(text)) return "Bourbon";
  if (productClass === "150") return /\brye\b/i.test(text) ? "Rye Whiskey" : "Bottled in Bond Bourbon";
  if (productClass === "190" || /\bcorn\s+whisk(?:e)?y\b/i.test(text)) return "American Whiskey";
  if (productClass === "191" || /\blight\s+whisk(?:e)?y\b/i.test(text)) return "American Whiskey";
  if (productClass === "160" || /\bblended\s+whisk(?:e)?y\b|\bblended\s+whisky\b/i.test(text)) return "Blended Whiskey";
  if (["165", "199", "401", "131"].includes(productClass) || /\bamerican\s+whisk(?:e)?y\b|\bwhisk(?:e)?y\b|\bwhisky\b|\bwhk\b|\bwsky\b/i.test(text)) return "American Whiskey";
  return PRODUCT_CLASS_LABELS[productClass] || "Montana product class " + productClass;
}

function parseItemCode(value) {
  const parts = normalizeWhitespace(value).split("-");
  return {
    productClass: parts[0] || "",
    nabcaNumber: parts[1] || "",
    sizeCode: parts[2] || ""
  };
}

function parseProductDetails(rawName, sizeCode) {
  const raw = normalizeWhitespace(rawName);
  const proof = parseProofFromName(raw);
  const age = parseAgeFromName(raw);
  const size = normalizeSizeCode(sizeCode) || parseSizeFromName(raw);
  let name = raw
    .replace(sizePattern(), " ")
    .replace(proofPattern(), " ")
    .replace(agePattern(), " ")
    .replace(/^BRL-/i, "")
    .replace(/^TRO-\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();

  name = name.replace(/\s*[-/]\s*$/, "").trim();

  return {
    name: titleCaseProductName(name || raw),
    proof,
    age: age.label,
    ageYears: age.years,
    size
  };
}

function parseProofFromName(value) {
  const match = normalizeWhitespace(value).match(proofMatchPattern());
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseAgeFromName(value) {
  const match = normalizeWhitespace(value).match(ageMatchPattern());
  if (!match) return { label: "Unknown", years: null };
  const years = Number(match[1]);
  if (!Number.isFinite(years)) return { label: "Unknown", years: null };
  return {
    label: years + " year" + (years === 1 ? "" : "s"),
    years
  };
}

function parseSizeFromName(value) {
  const matches = Array.from(normalizeWhitespace(value).matchAll(sizePattern()));
  if (!matches.length) return null;
  return normalizeSizeLabel(matches[matches.length - 1][1]);
}

function proofPattern() {
  return /\b(\d+(?:\.\d+)?)\s*(?:P\s*F|P\s*R\s*F|P\s*R|PROOF)\.?(?=\s|$)/gi;
}

function proofMatchPattern() {
  return /\b(\d+(?:\.\d+)?)\s*(?:P\s*F|P\s*R\s*F|P\s*R|PROOF)\.?(?=\s|$)/i;
}

function agePattern() {
  return /\b(\d+(?:\.\d+)?)\s*(?:YRS?|YR\.?|Y|YO|YEAR)\.?(?=\s|$|\/)/gi;
}

function ageMatchPattern() {
  return /\b(\d+(?:\.\d+)?)\s*(?:YRS?|YR\.?|Y|YO|YEAR)\.?(?=\s|$|\/)/i;
}

function sizePattern() {
  return /\b(3\s*L|1\s*\.?\s*75\s*L|1\.75\s*L|750\s*ML|750ML|700\s*ML|700ML|375\s*ML|375ML|355\s*ML|355ML|200\s*ML|200ML|100\s*ML|100ML|50\s*ML|50ML|LITER|1\s*L|1L)\b/gi;
}

function normalizeSizeCode(value) {
  const code = normalizeWhitespace(value).padStart(2, "0");
  const sizes = {
    "05": "50ml",
    "10": "1L",
    "17": "1.75L",
    "20": "200ml",
    "30": "3L",
    "35": "355ml",
    "37": "375ml",
    "70": "700ml",
    "75": "750ml"
  };
  return sizes[code] || null;
}

function normalizeSizeLabel(value) {
  const clean = normalizeWhitespace(value).toUpperCase().replace(/\s+/g, "");
  if (clean === "LITER" || clean === "1L") return "1L";
  if (clean === "1.75L" || clean === "175L") return "1.75L";
  if (clean === "3L") return "3L";
  if (clean.endsWith("ML")) return Number(clean.replace(/\D/g, "")) + "ml";
  return clean || null;
}

function normalizeEffectiveMonth(month, year) {
  const numericMonth = Number(normalizeWhitespace(month));
  const numericYear = Number(normalizeWhitespace(year));
  if (!Number.isFinite(numericMonth) || !Number.isFinite(numericYear)) return "";
  return String(numericYear) + "-" + String(numericMonth).padStart(2, "0");
}

function parseNumber(value) {
  const clean = normalizeWhitespace(value).replace(/,/g, "");
  if (!clean) return null;
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBoolean(value) {
  const clean = normalizeWhitespace(value).toLowerCase();
  return ["true", "yes", "y", "1"].includes(clean);
}

function titleCaseProductName(value) {
  const clean = normalizeWhitespace(value);
  if (!clean) return "";
  if (/[a-z]/.test(clean)) return clean;

  return clean.toLowerCase().replace(/\b([a-z0-9']+)\b/g, (word) => {
    if (/^\d+(yr|yo|pr|pf)$/.test(word)) return word.toUpperCase();
    if (/^\d+x[o0]$/.test(word)) return word.toUpperCase();
    if (["bbn", "bib", "brl", "btb", "co", "ksbw", "pf", "prf", "rsv", "sb", "sbbib", "sbsb", "sgl", "stbw", "tro", "us", "whk"].includes(word)) return word.toUpperCase();
    if (["and", "by", "in", "of", "on", "to"].includes(word)) return word.slice(0, 1).toUpperCase() + word.slice(1);
    if (word.length <= 2 && /^[a-z]+$/.test(word)) return word.toUpperCase();
    return word.slice(0, 1).toUpperCase() + word.slice(1);
  });
}

function normalizeMontanaBottle(record) {
  const fields = [
    "itemCode",
    "month",
    "effectiveMonth",
    "productClass",
    "productClassLabel",
    "nabcaNumber",
    "sizeCode",
    "name",
    "rawName",
    "unitsPerCase",
    "bottlePrice",
    "inventoryClass",
    "maintained",
    "repackable",
    "repackQuantity",
    "proof",
    "age",
    "size"
  ];

  const normalized = {
    id: slugify([record.name, record.size, record.itemCode].filter(Boolean).join(" ")),
    identityKey: makeMontanaIdentityKey(record),
    name: record.name,
    producer: "",
    supplier: "",
    category: record.category,
    bottleKind: inferBottleKind({ name: record.name, category: record.category }),
    proof: record.proof,
    age: record.age,
    ageYears: record.ageYears,
    size: record.size,
    aliases: unique([record.name, record.rawName, record.itemCode, record.nabcaNumber]),
    sourceRefs: [
      {
        sourceId: SOURCE.id,
        sourceRecordId: record.itemCode,
        sourceUrl: SOURCE.url,
        retrievedAt: record.retrievedAt,
        fields
      }
    ],
    prices: []
  };

  if (Number.isFinite(record.bottlePrice)) {
    normalized.prices.push({
      sourceId: SOURCE.id,
      region: SOURCE.region,
      retailPrice: record.bottlePrice,
      bottlePrice: record.bottlePrice,
      size: record.size,
      effectiveMonth: record.effectiveMonth,
      inventoryClass: record.inventoryClass,
      maintained: record.maintained,
      retrievedAt: record.retrievedAt
    });
  }

  return normalized;
}

function makeMontanaIdentityKey(record) {
  return [
    slugify(record.name),
    slugify(record.size || ""),
    slugify(record.itemCode)
  ].filter(Boolean).join("|");
}

function buildImportPayload(rows, retrievedAt) {
  const bottles = mergeCatalogRecords(rows.map(normalizeMontanaBottle));
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
  if (!args.input) throw new Error("Provide --input data/raw/montana-dor/price-disk-may-2026.xlsx");

  const retrievedAt = new Date().toISOString();
  const rows = parseMontanaPriceDiskXlsx(fs.readFileSync(path.resolve(args.input)), {
    mode: args.mode,
    retrievedAt,
    year: args.year
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
  normalizeMontanaBottle,
  normalizeMontanaRow,
  normalizeSizeCode,
  parseAgeFromName,
  parseItemCode,
  parseMontanaPriceDiskRows,
  parseMontanaPriceDiskXlsx,
  parseProductDetails,
  parseProofFromName,
  parseSizeFromName,
  titleCaseProductName
};
