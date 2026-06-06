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
  id: "lcbo_whisky_catalog",
  name: "LCBO Whisky Catalog",
  url: "https://www.lcbo.com/en/products/spirits/whisky",
  region: "ON",
  sourceType: "provincial_control_catalog"
};

function parseArgs(argv) {
  const args = {
    mode: "serious"
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input") args.inputs = [...(args.inputs || []), argv[++i]];
    if (arg === "--input-dir") args.inputDir = argv[++i];
    if (arg === "--out") args.out = argv[++i];
    if (arg === "--mode") args.mode = argv[++i];
  }

  return args;
}

function resolveInputFiles(args) {
  const files = [...(args.inputs || [])];
  if (args.inputDir) {
    const dir = path.resolve(args.inputDir);
    for (const entry of fs.readdirSync(dir)) {
      if (/^whisky-coveo-\d+\.json$/i.test(entry)) files.push(path.join(dir, entry));
    }
  }
  return unique(files).map((file) => path.resolve(file)).sort((a, b) => a.localeCompare(b));
}

function parseLcboCoveoPayloads(payloads, options = {}) {
  const retrievedAt = options.retrievedAt || new Date().toISOString();
  const mode = options.mode || "serious";
  const seen = new Set();
  const rows = [];

  for (const payload of payloads) {
    const data = typeof payload === "string" ? JSON.parse(payload) : payload;
    for (const result of data.results || []) {
      const row = normalizeLcboResult(result, { retrievedAt });
      if (!row || seen.has(row.lcboSku)) continue;
      seen.add(row.lcboSku);
      if (includeRow(row, mode)) rows.push(row);
    }
  }

  return rows;
}

function normalizeLcboResult(result, options = {}) {
  const raw = result.raw || {};
  const name = normalizeWhitespace(raw.ec_name || result.title);
  const lcboSku = normalizeWhitespace(firstValue(raw.ec_skus) || raw.permanentid || raw.primaryid);
  if (!name || !lcboSku) return null;

  const categoryPaths = getWhiskyCategoryPaths(raw.ec_category);
  const size = normalizeLcboSize(raw.lcbo_total_volume || raw.lcbo_unit_volume);
  const abv = parseNumber(raw.lcbo_alcohol_percent);
  const proof = Number.isFinite(abv) ? roundOne(abv * 2) : parseProofFromName(name);
  const age = parseAgeFromName(name);
  const productUrl = normalizeWhitespace(result.clickUri || raw.clickableuri || raw.uri || raw.sysclickableuri);
  const brand = normalizeWhitespace(raw.ec_brand);

  return {
    sourceId: SOURCE.id,
    sourceRecordId: lcboSku,
    lcboSku,
    name,
    brand,
    producer: brand,
    supplier: brand,
    rawCategory: categoryPaths.join(" | "),
    sourceCategoryPath: getMostSpecificCategoryPath(categoryPaths),
    category: inferLcboCategory({ name, categoryPaths, country: raw.country_of_manufacture }),
    age,
    ageYears: age === "NAS" ? null : parseAgeYears(age),
    proof,
    abv,
    size,
    packageName: normalizeWhitespace(raw.lcbo_selling_package_name),
    country: normalizeWhitespace(raw.country_of_manufacture),
    regionName: normalizeWhitespace(raw.lcbo_region_name),
    tastingNotes: normalizeWhitespace(raw.lcbo_tastingnotes || raw.ec_shortdesc || raw.ec_description),
    priceCad: parseCurrency(raw.ec_price),
    finalPriceCad: parseCurrency(raw.ec_final_price),
    promoPriceCad: parseCurrency(raw.ec_promo_price),
    overallPriceCad: parseCurrency(raw.ec_overall_price),
    onlineInventory: parseInteger(raw.online_inventory),
    storesStock: normalizeWhitespace(raw.stores_stock),
    defaultStock: normalizeWhitespace(raw.default_stock),
    outOfStock: normalizeWhitespace(raw.out_of_stock),
    isBuyable: normalizeWhitespace(raw.is_buyable),
    rating: parseNumber(raw.ec_rating),
    reviewCount: parseInteger(raw.avg_reviews),
    upc: normalizeWhitespace(raw.upc_number),
    imageUrl: normalizeWhitespace(raw.ec_thumbnails),
    productUrl,
    sourceUrl: productUrl || SOURCE.url,
    retrievedAt: options.retrievedAt || new Date().toISOString()
  };
}

function includeRow(row, mode) {
  if (mode === "all") return true;
  if (!row.rawCategory.includes("Products|Spirits|Whisky")) return false;
  if (row.packageName && row.packageName.toLowerCase() === "can") return false;
  if (looksLikeNonSeriousWhiskyProduct(row)) return false;
  return hasWhiskySignal([row.name, row.rawCategory, row.category, row.country].join(" "));
}

function getWhiskyCategoryPaths(categories) {
  return unique((categories || []).filter((category) => normalizeWhitespace(category).includes("Products|Spirits|Whisky")));
}

function getMostSpecificCategoryPath(categoryPaths) {
  return [...categoryPaths].sort((a, b) => b.length - a.length)[0] || "";
}

function inferLcboCategory({ name, categoryPaths, country }) {
  const text = normalizeWhitespace([name, ...categoryPaths, country].join(" ")).toLowerCase();
  const countryText = normalizeWhitespace(country).toLowerCase();

  if (/\bwheated\b.*\bbourbon\b|\bbourbon\b.*\bwheated\b/i.test(text)) return "Wheated Bourbon";
  if (/\bwheat\s+whisk(?:e)?y\b/i.test(text)) return "Wheat Whiskey";
  if (/\bamerican\s+single\s+malt\b/i.test(text)) return "American Single Malt";
  if (/\btennessee\b/i.test(text)) return "Tennessee Whiskey";
  if (/\bamerican\s+rye\s+whiskey\b|\bstraight\s+rye\b|\brye\s+whiskey\b/i.test(text)) return "Rye Whiskey";
  if (/\bcanadian\s+rye\s+whisky\b/i.test(text)) return "Canadian Rye Whisky";
  if (/\bbourbon\b/i.test(text)) return "Bourbon";
  if (/\bamerican\s+whiskey\b|\bamerican\s+whisky\b|\bamerican whiskey & bourbon\b/i.test(text)) return "American Whiskey";
  if (countryText === "japan" || /\bhibiki\b|\bnikka\b|\bsuntory\b|\byamazaki\b|\byoichi\b/i.test(text)) return "Japanese Whisky";
  if (/\bscotch\b|\bspeyside\b|\bislay\b|\bhighland\b|\blowland\b|\bcampbeltown\b/i.test(text)) return "Scotch Whisky";
  if (/\birish\b/i.test(text)) return "Irish Whiskey";
  if (/\bcanadian\b|\bcanada\b/i.test(text)) return "Canadian Whisky";
  if (/\bsingle\s+malt\b/i.test(text)) return "Single Malt / World Whisky";
  if (/\bwhisk(?:e)?y\b|\bwhisky\b/i.test(text)) return "World Whisky";
  return "Whisky";
}

function looksLikeNonSeriousWhiskyProduct(row) {
  const name = normalizeWhitespace(row.name).toLowerCase();
  const category = normalizeWhitespace(row.rawCategory).toLowerCase();
  if (/\bflavou?red\s+whisk(?:e)?y\b|\bspiced\s+whisk(?:e)?y\b/.test(category)) return true;
  if (/\bmoonshine\b|\bshochu\b|\bliqueur\b|\bcream\b|\bcocktail\b|\bready\s*to\s*drink\b|\bdram\s+in\s+a\s+can\b|\bfruit\s+drops\b/.test(name)) return true;
  if (/\b(peanut\s+butter|salted\s+caramel|apple|butterscotch|banana|blackberry|blueberry|chocolate|coffee|cinnamon|orange|peach|vanilla)\b/.test(name)) return true;

  const honeyIsBrand = /\bmilk\s*&\s*honey\b|\bmilk\s+and\s+honey\b/.test(name);
  const honeyIsCask = /\bhoney\s+(barrel|barrels|cask|casks)\b|\bfinished\s+in\s+honey\b|\bhoneydew\b/.test(name);
  if (/\bhoney\b/.test(name) && !honeyIsBrand && !honeyIsCask) return true;

  const mapleIsCask = /\bmaple\s+(syrup\s+)?(barrel|barrels|cask|casks)\b|\bfinished\s+in\s+maple\b/.test(name);
  if (/\bmaple\b/.test(name) && !mapleIsCask) return true;

  return false;
}

function hasWhiskySignal(text) {
  return /\b(american\s+single\s+malt|bourbon|canadian|irish|japanese|rye|scotch|single\s+malt|tennessee|wheat\s+whiskey|wheated|whiskey|whisky)\b/i.test(text);
}

function normalizeLcboSize(value) {
  const amount = parseNumber(value);
  if (!Number.isFinite(amount)) return "";
  if (amount === 1000) return "1L";
  if (amount === 1750) return "1.75L";
  return amount + "ml";
}

function parseAgeFromName(value) {
  const clean = normalizeWhitespace(value);
  const match = clean.match(/\b(\d+(?:\.\d+)?)\s*(?:year|years|yr|yrs|yo)\b/i);
  if (!match) return "NAS";
  const years = Number(match[1]);
  return Number.isFinite(years) ? years + " year" + (years === 1 ? "" : "s") : "NAS";
}

function parseAgeYears(label) {
  const match = normalizeWhitespace(label).match(/^(\d+(?:\.\d+)?)\s+year/i);
  if (!match) return null;
  const years = Number(match[1]);
  return Number.isFinite(years) ? years : null;
}

function parseProofFromName(value) {
  const match = normalizeWhitespace(value).match(/\b(\d{2,3}(?:\.\d+)?)\s*proof\b/i);
  return match ? parseProof(match[1]) : null;
}

function parseNumber(value) {
  const parsed = Number(normalizeWhitespace(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseInteger(value) {
  const parsed = Number.parseInt(normalizeWhitespace(value).replace(/,/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundOne(value) {
  return Math.round(value * 10) / 10;
}

function firstValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function makeLcboIdentityKey(record) {
  return [
    slugify(record.name),
    slugify(record.brand || ""),
    slugify(record.size || ""),
    String(record.proof || "")
  ].filter(Boolean).join("|");
}

function normalizeLcboBottle(record) {
  const sourceRefFields = [
    "name",
    "brand",
    "category",
    "sourceCategoryPath",
    "country",
    "regionName",
    "age",
    "abv",
    "proof",
    "size",
    "priceCad",
    "finalPriceCad",
    "onlineInventory",
    "storesStock",
    "productUrl",
    "upc"
  ];

  return {
    id: slugify([record.name, record.size, record.lcboSku].filter(Boolean).join(" ")),
    identityKey: makeLcboIdentityKey(record),
    name: record.name,
    producer: record.producer,
    supplier: record.supplier,
    category: record.category,
    bottleKind: inferBottleKind({ name: record.name, category: record.category }),
    proof: record.proof,
    age: record.age,
    ageYears: record.ageYears,
    size: record.size,
    upc: record.upc || null,
    barcodes: unique([record.upc]),
    aliases: unique([record.name, record.brand && record.brand !== record.name ? record.brand + " " + record.name : ""]),
    sourceRefs: [
      {
        sourceId: SOURCE.id,
        sourceRecordId: record.lcboSku,
        sourceUrl: record.productUrl || SOURCE.url,
        retrievedAt: record.retrievedAt,
        fields: sourceRefFields,
        priceCad: record.priceCad,
        finalPriceCad: record.finalPriceCad,
        country: record.country,
        regionName: record.regionName,
        onlineInventory: record.onlineInventory,
        storesStock: record.storesStock,
        productUrl: record.productUrl,
        imageUrl: record.imageUrl,
        tastingNotes: record.tastingNotes
      }
    ],
    prices: []
  };
}

function buildImportPayload(rows, retrievedAt, sourceFiles = []) {
  const bottles = mergeCatalogRecords(rows.map(normalizeLcboBottle));
  return {
    schemaVersion: 1,
    source: SOURCE,
    retrievedAt,
    rawRecordCount: rows.length,
    bottleCount: bottles.length,
    sourceFiles,
    records: rows,
    bottles
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const inputFiles = resolveInputFiles(args);
  if (!inputFiles.length) throw new Error("Provide --input or --input-dir with saved LCBO Coveo JSON pages");

  const retrievedAt = new Date().toISOString();
  const payloads = inputFiles.map((file) => JSON.parse(fs.readFileSync(file, "utf8")));
  const rows = parseLcboCoveoPayloads(payloads, { mode: args.mode, retrievedAt });
  const sourceFiles = inputFiles.map((file) => path.relative(process.cwd(), file));
  const payload = buildImportPayload(rows, retrievedAt, sourceFiles);
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
  inferLcboCategory,
  normalizeLcboBottle,
  normalizeLcboResult,
  parseLcboCoveoPayloads
};
