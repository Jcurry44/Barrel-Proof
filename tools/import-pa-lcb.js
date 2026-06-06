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
  id: "pa_lcb_wholesale_spirits_catalog",
  name: "Pennsylvania LCB Wholesale Spirits Catalog",
  url: "https://www.pa.gov/agencies/lcb/supplier-vendors/wine-and-spirits-suppliers/item-catalogs",
  dataUrl: "https://www.apps.lcb.pa.gov/webapp/reports/Wholesale_Spirits_Catalog_Full.xlsx",
  region: "PA",
  sourceType: "control_state_catalog"
};

const SERIOUS_WHISKEY_CLASSES = new Set([
  "bourbon",
  "scotch",
  "rye",
  "other",
  "canadian",
  "irish"
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

function parsePennsylvaniaLcbXlsx(buffer, options = {}) {
  const rows = readXlsxRows(buffer, "xl/worksheets/sheet1.xml");
  return parsePennsylvaniaRows(rows, options);
}

function parsePennsylvaniaRows(rows, options = {}) {
  const headerIndex = (rows || []).findIndex((row) => row.includes("PLCB Item") && row.includes("Item Description"));
  if (headerIndex < 0) return [];

  const headers = rows[headerIndex].map(normalizeWhitespace);
  const index = Object.fromEntries(headers.map((header, columnIndex) => [header, columnIndex]));
  const upcIndexes = headers
    .map((header, columnIndex) => header === "UPC" ? columnIndex : -1)
    .filter((columnIndex) => columnIndex >= 0);
  const retrievedAt = options.retrievedAt || new Date().toISOString();
  const parsedRows = rows.slice(headerIndex + 1)
    .map((row) => normalizePennsylvaniaRow(row, index, upcIndexes, { retrievedAt }))
    .filter(Boolean)
    .filter((row) => includeRow(row, options.mode || "serious"));

  return dedupeRows(parsedRows);
}

function normalizePennsylvaniaRow(row, index, upcIndexes, options = {}) {
  const value = (field) => index[field] >= 0 ? normalizeWhitespace(row[index[field]]) : "";
  const plcbItem = value("PLCB Item");
  const rawName = cleanProductName(value("Item Description"));
  if (!plcbItem || !rawName) return null;

  const size = normalizeSizeLabel(value("Liquid Volume"));
  const className = value("Class Name");
  const age = parseAgeFromName(rawName);
  const proof = parseNumber(value("Proof"));
  const upcs = parseUpcs(row, upcIndexes);

  return {
    sourceId: SOURCE.id,
    sourceRecordId: [plcbItem, size || "unknown-size"].join(":"),
    plcbItem,
    name: rawName,
    rawName,
    divisionName: value("Division Name"),
    groupName: value("Group Name"),
    className,
    category: inferPennsylvaniaCategory(rawName, className, value("Group Name")),
    plcbSccItems: unique([value("PLCB SCC Item")]),
    manufacturerSccs: unique([value("Manufacturer SCC")]),
    size,
    rawLiquidVolume: value("Liquid Volume"),
    casePack: parseNumber(value("Case Pack")),
    currentRegularRetail: parseCurrency(value("Current Regular Retail")),
    priceIndicator: value("Price Indicator"),
    promotionDiscount: value("Promotion discount"),
    promotionDiscountValue: parseOptionalCurrency(value("Promotion discount Value")),
    promotionRetail: parseOptionalCurrency(value("Promotion Retail")),
    promotionStartDate: value("Promotion Start Date"),
    promotionEndDate: value("Promotion End Date"),
    proof,
    age: age.label,
    ageYears: age.years,
    upc: upcs[0] || null,
    upcs,
    importDomestic: value("Import/Domestic"),
    country: value("Country"),
    regionName: value("Region"),
    sourceUrl: SOURCE.url,
    dataUrl: SOURCE.dataUrl,
    region: SOURCE.region,
    sourceRowCount: 1,
    retrievedAt: options.retrievedAt || new Date().toISOString()
  };
}

function includeRow(row, mode) {
  if (!row) return false;
  if (mode === "all") return true;

  const groupName = row.groupName.toLowerCase();
  const className = row.className.toLowerCase();
  const text = [
    row.divisionName,
    row.groupName,
    row.className,
    row.rawName
  ].join(" ").toLowerCase();

  if (groupName !== "whiskey") return false;
  if (className === "flavored" || className === "white") return false;
  if (looksLikeNonWhiskeyProduct(row, text)) return false;

  if (mode === "whiskey" || mode === "serious") return SERIOUS_WHISKEY_CLASSES.has(className);

  if (className === "bourbon") return true;
  if (className === "rye" && !/\bbourbon\b/.test(text)) return false;
  if (/\bbourbon\b/i.test(text)) return true;
  return isSeriousTennesseeWhiskey(text);
}

function looksLikeNonWhiskeyProduct(row, text) {
  const isHoneyCask = /\bhoney\s+(?:barrels?|casks?)\b|\b(?:aged|finished)\s+in\s+honey\s+barrels?\b/i.test(text);
  const isMapleCask = /\bmaple\s+(?:syrup\s+)?(?:barrels?|casks?)\b|\b(?:aged|finished)\s+in\s+maple\s+(?:syrup\s+)?barrels?\b/i.test(text);

  if (Number.isFinite(row.proof) && row.proof > 0 && row.proof < 40) return true;
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
    /\bcocktail\b/,
    /\bcoca cola\b/,
    /\bcola\b/,
    /\bcoffee\b/,
    /\bcream\b/,
    /\bcreamsicle\b/,
    /\bcordial\b/,
    /\bfamily of fine spirits\b/,
    /\bflavored\b/,
    /\bgingerbread\b/,
    /\bglasses\b/,
    /\bglass\b/,
    /\bgift\b/,
    /\bhoney and lemonade\b/,
    /\blemonade\b/,
    /\bliqueur\b/,
    /\bmocha\b/,
    /\bmoonshine\b/,
    /\bmoon\s*shine\b/,
    /\bmshine\b/,
    /\bmultipack\b/,
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
    /\bsalted\b/,
    /\bsampler\b/,
    /\bsour\s+mix\b/,
    /\bspiced\b/,
    /\bstrawberry\b/,
    /\btea\b/,
    /\bvanilla\b/,
    /\bvap\b/,
    /\bvariety\s+pack\b/,
    /\bvodka\b/,
    /\b\d+\s*x\s*\d+\s*m?l\b/
  ].some((pattern) => pattern.test(text));
}

function inferPennsylvaniaCategory(name, className, groupName) {
  const text = [name, className, groupName].map(normalizeWhitespace).join(" ").toLowerCase();
  const sourceClass = normalizeWhitespace(className).toLowerCase();

  if (/\bjapanese\b.*\bwhisk(?:e)?y\b|\b(akashi|akkeshi|fuji|fuyu|hatozaki|hibiki|kaiyo|nikka|sensei|suntory|yamazaki)\b/i.test(text)) return "Japanese Whisky";
  if (/\b(amrut|kavalan|paul\s+john|starward|mackmyra|penderyn|english\s+whisk(?:e)?y)\b/i.test(text)) return "Single Malt / World Whisky";
  if (sourceClass === "scotch" || /\bscotch\b/i.test(text)) return "Scotch Whisky";
  if (sourceClass === "irish" || /\birish\b/i.test(text)) return "Irish Whiskey";
  if (sourceClass === "canadian" && /\brye\b/i.test(text)) return "Rye Whiskey";
  if (sourceClass === "canadian" || /\bcanadian\b/i.test(text)) return "Canadian Whisky";
  if (sourceClass === "rye" || /\brye\s+whisk(?:e)?y\b|\bstraight\s+rye\b|\brye\b/i.test(text)) return "Rye Whiskey";
  if (/\bamerican\s+single\s+malt\b|\bsingle\s+malt\s+whisk(?:e)?y\b/i.test(text)) return "American Single Malt";
  if (/\bw\.?\s*l\.?\s+weller\b|\bweller\b|\bsweet\s+wheat\b|\bwheated?\b.*\bbourbon\b|\bbourbon\b.*\bwheated?\b/i.test(text)) return "Wheated Bourbon";
  if (/\bwheat\s+whisk(?:e)?y\b|\bamerican\s+wheat\s+whisky\b|\bstraight\s+wheat\b/i.test(text)) return "Wheat Whiskey";
  if (/\bbib\b.*\bbourbon\b|\bbottled\s+in\s+bond\b.*\bbourbon\b|\bbourbon\b.*\bbottled\s+in\s+bond\b/i.test(text)) return "Bottled in Bond Bourbon";
  if (/\bbourbon\b/.test(text) || sourceClass === "bourbon") return "Bourbon";
  if (isSeriousTennesseeWhiskey(text)) return "Tennessee Whiskey";
  if (/\bblended\s+whisk(?:e)?y\b|\bblend of straight whisk(?:e)?ys\b|\bblended\s+whisky\b/i.test(text)) return "Blended Whiskey";
  if (/\bcorn\s+whisk(?:e)?y\b/i.test(text)) return "American Whiskey";
  if (/\bamerican\s+whisk(?:e)?y\b|\blight\s+whisk(?:e)?y\b|\bsour\s+mash\s+whisk(?:e)?y\b|\bstraight\s+whisk(?:e)?y\b/i.test(text)) return "American Whiskey";
  if (/\bwhisk(?:e)?y\b|\bwhisky\b/i.test(text)) return "Whiskey";
  return normalizeWhitespace(className) || normalizeWhitespace(groupName) || "Pennsylvania spirits catalog";
}

function isSeriousTennesseeWhiskey(text) {
  const clean = normalizeWhitespace(text).toLowerCase();
  if (/\brye\b/.test(clean)) return false;

  return [
    /\bgeorge dickel\b/,
    /\bgentleman jack\b/,
    /\bjack daniel'?s\b/,
    /\bjack daniels\b/,
    /\buncle nearest\b/
  ].some((pattern) => pattern.test(clean));
}

function normalizeSizeLabel(value) {
  const clean = normalizeWhitespace(value).toUpperCase().replace(/\s+/g, "");
  if (!clean) return null;
  if (clean === "1000ML" || clean === "1L" || clean === "1.00L") return "1L";
  if (clean === "1750ML" || clean === "1.75L") return "1.75L";
  if (clean === "3000ML" || clean === "3L") return "3L";
  if (/^\d+(?:\.\d+)?ML$/.test(clean)) return Number(clean.replace(/ML$/, "")) + "ml";
  if (/^\d+(?:\.\d+)?L$/.test(clean)) {
    const liters = Number(clean.replace(/L$/, ""));
    if (liters === 1) return "1L";
    if (liters === 1.75) return "1.75L";
    if (liters === 3) return "3L";
    return liters + "L";
  }
  return clean;
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

function parseNumber(value) {
  const clean = normalizeWhitespace(value).replace(/,/g, "");
  if (!clean || /^n\/?a$/i.test(clean)) return null;
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseOptionalCurrency(value) {
  const clean = normalizeWhitespace(value);
  if (!clean) return null;
  return parseCurrency(clean);
}

function parseUpcs(row, upcIndexes) {
  return unique((upcIndexes || [])
    .map((columnIndex) => normalizeWhitespace(row[columnIndex]).replace(/\D/g, ""))
    .filter((value) => value.length >= 8 && value.length <= 14));
}

function cleanProductName(value) {
  return normalizeWhitespace(value)
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, "\"")
    .replace(/'S\b/g, "'s")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeRows(rows) {
  const byRecord = new Map();
  for (const row of rows) {
    const existing = byRecord.get(row.sourceRecordId);
    if (!existing) {
      byRecord.set(row.sourceRecordId, {
        ...row,
        plcbSccItems: unique(row.plcbSccItems),
        manufacturerSccs: unique(row.manufacturerSccs),
        upcs: unique(row.upcs)
      });
      continue;
    }

    existing.plcbSccItems = unique([...(existing.plcbSccItems || []), ...(row.plcbSccItems || [])]);
    existing.manufacturerSccs = unique([...(existing.manufacturerSccs || []), ...(row.manufacturerSccs || [])]);
    existing.upcs = unique([...(existing.upcs || []), ...(row.upcs || [])]);
    existing.upc = existing.upcs[0] || null;
    existing.sourceRowCount += row.sourceRowCount || 1;
  }

  return Array.from(byRecord.values()).sort((a, b) => a.name.localeCompare(b.name) || String(a.size).localeCompare(String(b.size)));
}

function normalizePennsylvaniaBottle(record) {
  const fields = [
    "plcbItem",
    "name",
    "rawName",
    "divisionName",
    "groupName",
    "className",
    "rawLiquidVolume",
    "size",
    "casePack",
    "currentRegularRetail",
    "priceIndicator",
    "promotionRetail",
    "promotionStartDate",
    "promotionEndDate",
    "proof",
    "age",
    "upcs"
  ];

  const normalized = {
    id: slugify([record.name, record.size, record.plcbItem].filter(Boolean).join(" ")),
    identityKey: makePennsylvaniaIdentityKey(record),
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
    barcodes: record.upcs,
    aliases: unique([record.name, record.rawName, record.plcbItem, ...(record.upcs || [])]),
    sourceRefs: [
      {
        sourceId: SOURCE.id,
        sourceRecordId: record.sourceRecordId,
        sourceUrl: SOURCE.url,
        retrievedAt: record.retrievedAt,
        fields
      }
    ],
    prices: []
  };

  if (Number.isFinite(record.currentRegularRetail)) {
    normalized.prices.push({
      sourceId: SOURCE.id,
      region: SOURCE.region,
      retailPrice: record.currentRegularRetail,
      regularRetail: record.currentRegularRetail,
      promotionRetail: Number.isFinite(record.promotionRetail) ? record.promotionRetail : null,
      promotionStartDate: record.promotionStartDate,
      promotionEndDate: record.promotionEndDate,
      priceIndicator: record.priceIndicator,
      size: record.size,
      retrievedAt: record.retrievedAt
    });
  }

  return normalized;
}

function makePennsylvaniaIdentityKey(record) {
  return [
    slugify(record.name),
    slugify(record.size || ""),
    slugify(record.plcbItem)
  ].filter(Boolean).join("|");
}

function buildImportPayload(rows, retrievedAt) {
  const bottles = mergeCatalogRecords(rows.map(normalizePennsylvaniaBottle));
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
  if (!args.input) throw new Error("Provide --input data/raw/pa-lcb/wholesale-spirits-catalog-full.xlsx");

  const retrievedAt = new Date().toISOString();
  const rows = parsePennsylvaniaLcbXlsx(fs.readFileSync(path.resolve(args.input)), {
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
  normalizePennsylvaniaBottle,
  normalizePennsylvaniaRow,
  normalizeSizeLabel,
  parseAgeFromName,
  parsePennsylvaniaLcbXlsx,
  parsePennsylvaniaRows,
  parseUpcs
};
