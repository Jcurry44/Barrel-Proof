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
  id: "olcc_monthly_pricing",
  name: "Oregon Liquor and Cannabis Commission Monthly Pricing",
  url: "https://catalog.data.gov/dataset/olcc-monthly-pricing",
  dataUrl: "https://data.oregon.gov/api/views/vmf2-f83h/rows.csv?accessType=DOWNLOAD",
  region: "OR",
  sourceType: "control_state_catalog"
};

const DOMESTIC_BOURBON_CATEGORIES = new Set(["DOMESTIC WHISKEY", "WHISKEY"]);
const SERIOUS_WHISKEY_CATEGORIES = new Set([
  "DOMESTIC WHISKEY",
  "WHISKEY",
  "CANADIAN",
  "SCOTCH",
  "IRISH",
  "OTHER IMPORTED WHISKY"
]);

function parseArgs(argv) {
  const args = {
    mode: "serious",
    latestOnly: true
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input") args.input = argv[++i];
    if (arg === "--out") args.out = argv[++i];
    if (arg === "--mode") args.mode = argv[++i];
    if (arg === "--all-dates") args.latestOnly = false;
  }

  return args;
}

function parseOlccMonthlyPricingCsv(csv, options = {}) {
  const rows = parseCsv(csv);
  if (!rows.length) return [];

  const headers = rows[0].map(normalizeWhitespace);
  const index = Object.fromEntries(headers.map((header, columnIndex) => [header, columnIndex]));
  const retrievedAt = options.retrievedAt || new Date().toISOString();
  const dataRows = rows.slice(1)
    .map((row) => normalizeOlccRow(row, index, { retrievedAt }))
    .filter(Boolean);
  const filteredRows = dataRows.filter((row) => includeRow(row, options.mode || "serious"));

  if (options.latestOnly === false) return filteredRows;

  const latestDate = getLatestAsOfDate(filteredRows);
  return filteredRows.filter((row) => row.asOfDate === latestDate);
}

function normalizeOlccRow(row, index, options = {}) {
  const value = (field) => index[field] >= 0 ? normalizeWhitespace(row[index[field]]) : "";
  const itemCode = value("ItemCode");
  const extendedItemCode = value("ExtendedItemCode");
  const description = value("Description");
  if (!itemCode || !description) return null;

  const age = parseOlccAge(value("Age"));
  const sourceCategory = value("Category");

  return {
    sourceId: SOURCE.id,
    sourceRecordId: extendedItemCode || itemCode,
    itemCode,
    extendedItemCode,
    name: titleCaseProductName(description),
    rawName: description,
    category: inferOlccCategory(description, sourceCategory),
    sourceCategory,
    oregonProduct: parseBoolean(value("OregonProduct")),
    itemStatus: value("ItemStatus"),
    itemStatusCode: value("ItemStatusCode"),
    newItem: parseBoolean(value("NewItem")),
    specialPricing: value("SpecialPricing"),
    size: normalizeOlccSize(value("Size")),
    age: age.label,
    ageYears: age.years,
    proof: parseProof(value("Proof")),
    pricePerBottle: parseCurrency(value("PricePerBottle")),
    bottlesPerCase: parseNumber(value("BottlesPerCase")),
    pricePerCase: parseCurrency(value("PricePerCase")),
    priceChange: parseCurrency(value("PriceChange")),
    asOfDate: value("AsOfDate"),
    sourceUrl: SOURCE.url,
    dataUrl: SOURCE.dataUrl,
    region: SOURCE.region,
    retrievedAt: options.retrievedAt || new Date().toISOString()
  };
}

function includeRow(row, mode) {
  if (mode === "all") return true;

  const sourceCategory = String(row.sourceCategory || row.category).toUpperCase();
  const text = [row.rawName, row.name, row.category, sourceCategory].join(" ").toLowerCase();
  if (looksLikeNonSeriousWhiskey(row, text)) return false;

  if (mode === "whiskey") {
    return sourceCategory.includes("WHISKEY") || sourceCategory.includes("WHISKY") || isSeriousWhiskeyName(text);
  }

  if (mode === "bourbon") return DOMESTIC_BOURBON_CATEGORIES.has(sourceCategory) && text.includes("bourbon");

  return SERIOUS_WHISKEY_CATEGORIES.has(sourceCategory) || isSeriousWhiskeyName(text);
}

function looksLikeNonSeriousWhiskey(row, text) {
  const sourceCategory = String(row.sourceCategory || row.category).toUpperCase();
  const isHoneyCask = /\bhoney\s+(?:barrels?|casks?)\b|\b(?:aged|finished)\s+in\s+honey\s+barrels?\b/i.test(text);
  const isMapleCask = /\bmaple\s+(?:syrup\s+)?(?:barrels?|casks?)\b|\b(?:aged|finished)\s+in\s+maple\s+(?:syrup\s+)?barrels?\b/i.test(text);

  if (/\b(?:CORDIALS?|LIQUEURS?|COCKTAILS?|VODKA|RUM|TEQUILA|MEZCAL|BRANDY|COGNAC|GIN|CACHACA|VERMOUTH)\b/i.test(sourceCategory)) return true;
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

function inferOlccCategory(rawName, sourceCategory) {
  const text = [rawName, sourceCategory].join(" ").toLowerCase();
  const category = normalizeWhitespace(sourceCategory).toUpperCase();

  if (/\bjapanese\b.*\bwhisk(?:e)?y\b|\b(akashi|akkeshi|yamazaki|hakushu|hibiki|chichibu|nikka|tottori)\b/i.test(text)) return "Japanese Whisky";
  if (/\b(amrut|kavalan|paul\s+john|starward|mackmyra|penderyn|english\s+whisk(?:e)?y)\b/i.test(text)) return "Single Malt / World Whisky";
  if (category === "SCOTCH" || /\bscotch\b/i.test(text)) return "Scotch Whisky";
  if (category === "IRISH" || /\birish\s+whisk(?:e)?y\b/i.test(text)) return "Irish Whiskey";
  if (category === "CANADIAN" && /\brye\b/i.test(text)) return "Rye Whiskey";
  if (category === "CANADIAN" || /\bcanadian\b.*\bwhisk(?:e)?y\b|\bcanadian\s+whisk(?:e)?y\b/i.test(text)) return "Canadian Whisky";
  if (category === "OTHER IMPORTED WHISKY") return "Single Malt / World Whisky";
  if (/\bamerican\s+single\s+malt\b/i.test(text)) return "American Single Malt";
  if (/\bw\.?\s*l\.?\s+weller\b|\bweller\b/i.test(text)) return "Wheated Bourbon";
  if (/\bwheated?\b.*\bbourbon\b|\bbourbon\b.*\bwheated?\b/i.test(text)) return "Wheated Bourbon";
  if (/\bbib\b.*\bbourbon\b|\bbottled\s+in\s+bond\b.*\bbourbon\b|\bbourbon\b.*\bbottled\s+in\s+bond\b/i.test(text)) return "Bottled in Bond Bourbon";
  if (/\bbourbon\b/i.test(text)) return "Bourbon";
  if (/\btennessee\b/i.test(text)) return "Tennessee Whiskey";
  if (/\brye\s+whisk(?:e)?y\b|\bstraight\s+rye\b|\brye\b/i.test(text)) return "Rye Whiskey";
  if (/\bwheat\s+whisk(?:e)?y\b|\bbib\s+wheat\b|\bstraight\s+wheat\b/i.test(text)) return "Wheat Whiskey";
  if (/\bcorn\s+whisk(?:e)?y\b/i.test(text)) return "American Whiskey";
  if (/\bblended\s+whisk(?:e)?y\b|\bblended\s+whisky\b/i.test(text)) return "Blended Whiskey";
  if (/\bamerican\s+whisk(?:e)?y\b|\blight\s+whisk(?:e)?y\b/i.test(text)) return "American Whiskey";
  if (/\bwhisk(?:e)?y\b|\bwhisky\b/i.test(text)) return "Whiskey";
  return titleCaseProductName(sourceCategory);
}

function getLatestAsOfDate(rows) {
  return rows
    .map((row) => row.asOfDate)
    .filter(Boolean)
    .sort((left, right) => new Date(left) - new Date(right))
    .pop();
}

function normalizeOlccSize(value) {
  const clean = normalizeWhitespace(value).toUpperCase();
  const match = clean.match(/^(\d+(?:\.\d+)?)\s*ML$/);
  if (match) return Number(match[1]) === 1000 ? "1L" : Number(match[1]) + "ml";
  return clean || null;
}

function parseOlccAge(value) {
  const clean = normalizeWhitespace(value);
  if (!clean) return { raw: clean, label: "NAS", years: null };

  const yearMatch = clean.match(/^(\d+(?:\.\d+)?)\s*(?:YR|YRS|YEAR|YEARS)$/i);
  if (yearMatch) {
    const years = Number(yearMatch[1]);
    return { raw: clean, label: years + " year" + (years === 1 ? "" : "s"), years };
  }

  const monthMatch = clean.match(/^(\d+(?:\.\d+)?)\s*(?:MO|MOS|MONTH|MONTHS)$/i);
  if (monthMatch) {
    const months = Number(monthMatch[1]);
    return { raw: clean, label: months + " month" + (months === 1 ? "" : "s"), years: months / 12 };
  }

  return { raw: clean, label: clean, years: null };
}

function parseBoolean(value) {
  const clean = normalizeWhitespace(value).toLowerCase();
  if (!clean) return false;
  return ["true", "yes", "y", "1"].includes(clean);
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
    if (/^\d+(yr|yo)$/.test(word)) return word.toUpperCase();
    if (["bib", "btb", "rtd"].includes(word)) return word.toUpperCase();
    return word.slice(0, 1).toUpperCase() + word.slice(1);
  });
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        cell += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
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

function normalizeOlccBottle(record) {
  const fields = [
    "itemCode",
    "extendedItemCode",
    "description",
    "category",
    "sourceCategory",
    "itemStatus",
    "size",
    "age",
    "proof",
    "pricePerBottle",
    "asOfDate"
  ];

  const normalized = {
    id: slugify([record.name, record.size, record.proof, record.extendedItemCode || record.itemCode].filter(Boolean).join(" ")),
    identityKey: makeOlccIdentityKey(record),
    name: record.name,
    producer: "",
    supplier: "",
    category: record.category,
    bottleKind: inferBottleKind({ name: record.name, category: record.category }),
    proof: record.proof,
    age: record.age,
    ageYears: record.ageYears,
    size: record.size,
    aliases: unique([record.name, record.rawName, record.itemCode, record.extendedItemCode]),
    sourceRefs: [
      {
        sourceId: SOURCE.id,
        sourceRecordId: record.extendedItemCode || record.itemCode,
        sourceUrl: SOURCE.url,
        retrievedAt: record.retrievedAt,
        fields
      }
    ],
    prices: []
  };

  if (Number.isFinite(record.pricePerBottle)) {
    normalized.prices.push({
      sourceId: SOURCE.id,
      region: SOURCE.region,
      retailPrice: record.pricePerBottle,
      size: record.size,
      status: record.itemStatus,
      asOfDate: record.asOfDate,
      retrievedAt: record.retrievedAt
    });
  }

  return normalized;
}

function makeOlccIdentityKey(record) {
  return [
    slugify(record.name),
    slugify(record.size || ""),
    String(record.proof || ""),
    slugify(record.extendedItemCode || record.itemCode)
  ].filter(Boolean).join("|");
}

function buildImportPayload(rows, retrievedAt) {
  const bottles = mergeCatalogRecords(rows.map(normalizeOlccBottle));
  const asOfDates = unique(rows.map((row) => row.asOfDate)).sort((left, right) => new Date(left) - new Date(right));
  return {
    schemaVersion: 1,
    source: SOURCE,
    retrievedAt,
    asOfDates,
    rawRecordCount: rows.length,
    bottleCount: bottles.length,
    records: rows,
    bottles
  };
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.input) throw new Error("Provide --input data/raw/olcc/monthly-pricing-current.csv");

  const retrievedAt = new Date().toISOString();
  const csv = fs.readFileSync(path.resolve(args.input), "utf8");
  const rows = parseOlccMonthlyPricingCsv(csv, {
    mode: args.mode,
    latestOnly: args.latestOnly,
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
  normalizeOlccBottle,
  normalizeOlccRow,
  normalizeOlccSize,
  parseCsv,
  parseOlccAge,
  parseOlccMonthlyPricingCsv,
  titleCaseProductName
};
