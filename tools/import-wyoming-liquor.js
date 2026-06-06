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
  id: "wyoming_liquor_division",
  name: "Wyoming Liquor Division Liquor365 Domestic Whiskey Catalog",
  url: "https://liquor365.wyo.gov/wld/distilled-spirits/whiskey-domestic/5637145409.c",
  region: "WY",
  sourceType: "control_state_catalog"
};

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

function parseWyomingLiquorJson(payload, options = {}) {
  const products = Array.isArray(payload) ? payload : payload.products || [];
  const retrievedAt = options.retrievedAt || payload.retrievedAt || new Date().toISOString();

  const rows = products
    .map((product) => normalizeWyomingRow(product, { retrievedAt }))
    .filter(Boolean)
    .filter((row) => includeRow(row, options.mode || "serious"));

  return dedupeRows(rows);
}

function normalizeWyomingRow(row, options = {}) {
  const itemId = normalizeWhitespace(row.itemId);
  const recordId = normalizeWhitespace(row.recordId);
  const rawName = cleanProductName(row.name);
  if (!itemId || !rawName) return null;

  const packageDetails = parsePackageDetails(rawName);
  const sourceNotes = parseSourceNotes(rawName);
  const cleanedName = cleanDisplayName(rawName);
  const age = parseAgeFromName(rawName);
  const caseListPrice = Number.isFinite(row.listPrice) ? row.listPrice : parseCurrency(row.listPriceText);
  const estimatedBottlePrice = estimateBottlePrice(caseListPrice, packageDetails);

  return {
    sourceId: SOURCE.id,
    sourceRecordId: [itemId, packageDetails.size || "unknown-size"].join(":"),
    itemId,
    recordId,
    name: cleanedName,
    rawName,
    category: inferWyomingCategory(rawName),
    proof: parseProofFromName(rawName),
    age: age.label,
    ageYears: age.years,
    size: packageDetails.size,
    rawPackage: packageDetails.raw,
    casePack: packageDetails.casePack,
    unitsPerPack: packageDetails.unitsPerPack,
    listPrice: caseListPrice,
    estimatedBottlePrice,
    priceBasis: estimatedBottlePrice === null ? "" : "case_list_price_divided_by_case_pack",
    availability: normalizeWhitespace(row.availability),
    sourceNotes,
    sourceUrl: normalizeWhitespace(row.productUrl) || SOURCE.url,
    sourcePageUrl: normalizeWhitespace(row.sourcePageUrl),
    sourceCategoryUrl: normalizeWhitespace(row.sourceCategoryUrl) || SOURCE.url,
    region: SOURCE.region,
    retrievedAt: options.retrievedAt || row.retrievedAt || new Date().toISOString()
  };
}

function includeRow(row, mode) {
  if (!row) return false;
  if (mode === "all") return true;

  const text = [row.rawName, row.name].join(" ").toLowerCase();

  if (mode === "whiskey" || mode === "serious") {
    if (looksLikeNonSeriousWhiskeyProduct(text, row)) return false;
    return /\b(whiskey|whisky|bourbon|rye|tennessee|bottled in bond|bib|single malt|corn whiskey|wheat whiskey|blended whiskey|canadian)\b/i.test(text) ||
      isSeriousTennesseeWhiskey(text);
  }

  if (looksLikeNonBottleProduct(text, row)) return false;
  if (hasBourbonSignal(text)) return true;
  if (/\b(b\.?i\.?b\.?|bib|bottled?\s+in\s+bond)\b/i.test(text) && !/\brye\b/i.test(text)) return true;
  return isSeriousTennesseeWhiskey(text);
}

function looksLikeNonBottleProduct(text, row = {}) {
  const clean = normalizeWhitespace(text).toLowerCase();
  const bourbonScrubbed = scrubCompanyBourbon(clean);

  if ((row.unitsPerPack || 1) > 1) return true;
  if (/\brye\b/.test(bourbonScrubbed) && !/\bbourbon\b/.test(bourbonScrubbed) && !isSeriousTennesseeWhiskey(clean)) {
    return true;
  }
  if (/\bpack\b/.test(clean) || /\bpks?\s+contain\b/.test(clean)) return true;
  if (/\bw\//.test(clean) && !/\bfinished\s+w\//.test(clean)) return true;

  return [
    /\bapple\b/,
    /\bbarbecue\b/,
    /\bbbq\b/,
    /\bblackberry\b/,
    /\bbourbon ball\b/,
    /\bbrown sugar\b/,
    /\bcan(?:s)?\b/,
    /\bchocolate whiskey\b/,
    /\bcinnamon\b/,
    /\bcinnamint\b/,
    /\bcocktail\b/,
    /\bcoca cola\b/,
    /\bcola\b/,
    /\bcombo\b/,
    /\bcream\b/,
    /\bflavo(?:u)?red\b/,
    /\bflavo(?:u)?rs?\b/,
    /\bflask\b/,
    /\bfig[-\s]+vanilla\b/,
    /\bfamily of brands\b/,
    /\bginger\b/,
    /\bgift\b/,
    /\bglass(?:es)?\b/,
    /\bhighball\b/,
    /\bholiday\b/,
    /\bhoney\b/,
    /\bice mold\b/,
    /\bkit\b/,
    /\blemonade\b/,
    /\bliqueur\b/,
    /\bmint julep\b/,
    /\bmoonshine\b/,
    /\bmug\b/,
    /\bornament\b/,
    /\bpeach\b/,
    /\bpeanut\b/,
    /\bready to drink\b/,
    /\brtd\b/,
    /\bsampler\b/,
    /\bsauce\b/,
    /\bscotch\b/,
    /\bshooter\b/,
    /\bsour mix\b/,
    /\bspicy\b/,
    /\bstir spoon\b/,
    /\bsyrup\b/,
    /\bt-?shirt\b/,
    /\btri\s*pack\b/,
    /\btrilogy\b/,
    /\bvariety\b/,
    /\bvap\b/,
    /\bvodka\b/,
    /\bwater bottle tray\b/,
    /\bwith\s+(?:bbq|barbecue|ceramic|flask|glass|highball|ice|mug|sauce|snifter|sour|syrup|t-?shirt|water bottle)\b/,
    /\b\d+\/\d+\s*pk\b/
  ].some((pattern) => pattern.test(clean));
}

function looksLikeNonSeriousWhiskeyProduct(text, row = {}) {
  const clean = normalizeWhitespace(text).toLowerCase();
  const isHoneyCask = /\bhoney\s+(?:barrels?|casks?)\b|\b(?:aged|finished)\s+in\s+honey\s+barrels?\b/i.test(clean);
  const isMapleCask = /\bmaple\s+(?:syrup\s+)?(?:barrels?|casks?)\b|\b(?:aged|finished)\s+in\s+maple\s+(?:syrup\s+)?barrels?\b/i.test(clean);

  if ((row.unitsPerPack || 1) > 1) return true;
  if (/\bhoney\b/i.test(clean) && !isHoneyCask && !/\bhoneydew\b/i.test(clean)) return true;
  if (/\bmaple\b/i.test(clean) && !isMapleCask && !/\bmaplewood\b/i.test(clean)) return true;
  if (/\bw\//.test(clean) && !/\bfinished\s+w\//.test(clean)) return true;

  return [
    /\bapple\b/,
    /\bbarbecue\b/,
    /\bbbq\b/,
    /\bberry\b/,
    /\bblackberry\b/,
    /\bblack cherry\b/,
    /\bbourbon ball\b/,
    /\bbrown sugar\b/,
    /\bburnt sugar\b/,
    /\bcherry\b/,
    /\bchocolate\b/,
    /\bcinnamon\b/,
    /\bcinnamint\b/,
    /\bcocktail\b/,
    /\bcoconut\b/,
    /\bcoffee\b/,
    /\bcola\b/,
    /\bcookie\b/,
    /\bcream\b/,
    /\belderberry\b/,
    /\bfig[-\s]+vanilla\b/,
    /\bflavo(?:u)?red\b/,
    /\bflavo(?:u)?rs?\b/,
    /\bginger\b/,
    /\bgift\b/,
    /\bglass(?:es)?\b/,
    /\bhighball\b/,
    /\bholiday\b/,
    /\bhuckleberry\b/,
    /\bice mold\b/,
    /\bkit\b/,
    /\blemonade\b/,
    /\bliqueur\b/,
    /\bmint\b/,
    /\bmoonshine\b/,
    /\bornament\b/,
    /\borange peel\b/,
    /\bpancakes?\b/,
    /\bpeach\b/,
    /\bpeanut\b/,
    /\bpecan\b/,
    /\bpineapple\b/,
    /\bpeppermint\b/,
    /\bpks?\s+contain\b/,
    /\bready to drink\b/,
    /\broot beer\b/,
    /\brtd\b/,
    /\bsampler\b/,
    /\bsauce\b/,
    /\bshooter\b/,
    /\bsour mix\b/,
    /\bspicy\b/,
    /\bspiced whiskey\b/,
    /\bstir spoon\b/,
    /\bstrawberry\b/,
    /\bsyrup\b/,
    /\bt-?shirt\b/,
    /\bte?xpresso\b/,
    /\btri\s*pack\b/,
    /\bvariety\b/,
    /\bvanilla\b/,
    /\bvap\b/,
    /\bvodka\b/,
    /\bwater bottle tray\b/,
    /\bwatermelon\b/,
    /\bwhite dog\b/,
    /\bwith\s+(?:bbq|barbecue|ceramic|flask|glass|highball|ice|mug|sauce|snifter|sour|syrup|t-?shirt|water bottle)\b/,
    /\b\d+\/\d+\s*pks?\b/
  ].some((pattern) => pattern.test(clean));
}

function hasBourbonSignal(text) {
  return /\bbourbon\b/.test(scrubCompanyBourbon(text));
}

function scrubCompanyBourbon(text) {
  return normalizeWhitespace(text)
    .toLowerCase()
    .replace(/\bbourbon\s+(?:co\.?|company)\b/g, "")
    .replace(/\bbourbon\s+barrel\s+foods?\b/g, "");
}

function inferWyomingCategory(name) {
  const text = cleanProductName(name).toLowerCase();
  if (/\brye\b/.test(scrubCompanyBourbon(text)) && !hasBourbonSignal(text)) return "Rye Whiskey";
  if (/\b(wheat whiskey|wheat)\b/i.test(text) && !hasBourbonSignal(text)) return "Wheat Whiskey";
  if (/\bcorn whiskey\b/i.test(text)) return "Corn Whiskey";
  if (/\b(american single malt|single malt (?:american )?whisk(?:e)?y|bulleit single malt|bear fight|stranahan|balcones (?:brimstone|lineage|texas 1|texas single malt)|10th mountain single malt)\b/i.test(text)) return "American Single Malt";
  if (/\b(canadian|crown royal|canadian crest|caribou crossing)\b/i.test(text)) return "Canadian Whisky";
  if (isSeriousTennesseeWhiskey(text)) return "Tennessee Whiskey";
  if (/\bbottled?\s+in\s+bond\b/i.test(text) || /\bbib\b/i.test(text)) return "Bottled in Bond Bourbon";
  if (hasBourbonSignal(text)) return "Bourbon";
  if (/\bblended whiskey\b/i.test(text)) return "Blended Whiskey";
  return "American Whiskey";
}

function isSeriousTennesseeWhiskey(text) {
  const clean = normalizeWhitespace(text).toLowerCase();
  if (/\b(rye|honey|apple|fire|cola|cocktail|lemonade|cinnamon|can|rtd)\b/.test(clean)) return false;

  return [
    /\bgeorge dickel\b/,
    /\bgentleman jack\b/,
    /\bjack daniel'?s\b/,
    /\bjack daniels\b/,
    /\buncle nearest\b/
  ].some((pattern) => pattern.test(clean));
}

function parsePackageDetails(value) {
  const clean = cleanProductName(value);
  const match = clean.match(/\b(?:(\d+)\/)?(\d+)\s*Pk\/\s*(\d+(?:\.\d+)?)\s*(ML|M|L)\b/i) ||
    clean.match(/\b(\d+)\/\s*(\d+(?:\.\d+)?)\s*(ML|M|L)\b/i);
  if (!match) {
    return {
      raw: "",
      casePack: null,
      unitsPerPack: 1,
      size: null
    };
  }

  const slashWithoutPk = !/Pk\//i.test(match[0]);
  const outerPack = slashWithoutPk ? null : match[1] ? Number(match[1]) : null;
  const pack = slashWithoutPk ? Number(match[1]) : Number(match[2]);
  const amount = slashWithoutPk ? Number(match[2]) : Number(match[3]);
  const unit = (slashWithoutPk ? match[3] : match[4]).toUpperCase();
  const unitsPerPack = outerPack ? pack : 1;
  const casePack = outerPack || pack;

  return {
    raw: match[0],
    casePack: Number.isFinite(casePack) ? casePack : null,
    unitsPerPack: Number.isFinite(unitsPerPack) ? unitsPerPack : 1,
    size: normalizeSize(amount, unit)
  };
}

function normalizeSize(amount, unit) {
  if (!Number.isFinite(amount)) return null;
  if (unit === "ML" || unit === "M") return amount + "ml";
  if (amount === 1) return "1L";
  if (amount === 1.75) return "1.75L";
  return amount + "L";
}

function estimateBottlePrice(caseListPrice, packageDetails) {
  if (!Number.isFinite(caseListPrice)) return null;
  if (!packageDetails || !Number.isFinite(packageDetails.casePack) || packageDetails.casePack <= 0) return null;
  if ((packageDetails.unitsPerPack || 1) > 1) return null;
  return Math.round((caseListPrice / packageDetails.casePack) * 100) / 100;
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

function parseSourceNotes(value) {
  return unique([...cleanProductName(value).matchAll(/>([^<>]+)</g)].map((match) => match[1]));
}

function cleanDisplayName(value) {
  return cleanProductName(value)
    .replace(/\s*>[^<>]*</g, "")
    .replace(/\s+\b(?:(?:\d+)\/)?(?:\d+)\s*Pk\/\s*\d+(?:\.\d+)?\s*(?:ML|M|L)\b.*$/i, "")
    .replace(/\s+\b(?:\d+)\/\s*\d+(?:\.\d+)?\s*(?:ML|M|L)\b.*$/i, "")
    .replace(/^-\s*/, "")
    .replace(/\s+-\s*$/g, "")
    .trim();
}

function cleanProductName(value) {
  return normalizeWhitespace(value)
    .replace(/[â€˜â€™]/g, "'")
    .replace(/[â€œâ€]/g, "\"")
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
        sourceNotes: unique(row.sourceNotes)
      });
      continue;
    }

    existing.sourceNotes = unique([...(existing.sourceNotes || []), ...(row.sourceNotes || [])]);
    existing.sourcePageUrl = existing.sourcePageUrl || row.sourcePageUrl;
  }

  return Array.from(byRecord.values()).sort((a, b) => a.name.localeCompare(b.name) || String(a.size).localeCompare(String(b.size)));
}

function normalizeWyomingBottle(record) {
  const fields = [
    "itemId",
    "recordId",
    "name",
    "rawName",
    "category",
    "rawPackage",
    "casePack",
    "listPrice",
    "estimatedBottlePrice",
    "priceBasis",
    "availability",
    "sourceNotes",
    "proof",
    "age",
    "size"
  ];

  const normalized = {
    id: slugify([record.name, record.size, record.itemId].filter(Boolean).join(" ")),
    identityKey: makeWyomingIdentityKey(record),
    name: record.name,
    producer: "",
    supplier: "",
    category: record.category,
    bottleKind: inferBottleKind({ name: record.name, category: record.category }),
    proof: record.proof,
    age: record.age,
    ageYears: record.ageYears,
    size: record.size,
    aliases: unique([record.name, record.rawName, record.itemId, record.recordId]),
    sourceRefs: [
      {
        sourceId: SOURCE.id,
        sourceRecordId: record.sourceRecordId,
        sourceUrl: record.sourceUrl || SOURCE.url,
        retrievedAt: record.retrievedAt,
        fields
      }
    ],
    prices: []
  };

  if (Number.isFinite(record.estimatedBottlePrice)) {
    normalized.prices.push({
      sourceId: SOURCE.id,
      region: SOURCE.region,
      retailPrice: record.estimatedBottlePrice,
      caseListPrice: Number.isFinite(record.listPrice) ? record.listPrice : null,
      priceBasis: record.priceBasis,
      casePack: record.casePack,
      size: record.size,
      availability: record.availability,
      retrievedAt: record.retrievedAt
    });
  }

  return normalized;
}

function makeWyomingIdentityKey(record) {
  return [
    slugify(record.name),
    slugify(record.size || ""),
    String(record.proof || ""),
    slugify(record.itemId)
  ].filter(Boolean).join("|");
}

function buildImportPayload(rows, retrievedAt, rawRecordCount = rows.length) {
  const bottles = mergeCatalogRecords(rows.map(normalizeWyomingBottle));
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
  if (!args.input) throw new Error("Provide --input data/raw/wyoming-liquor/whiskey-domestic-products.json");

  const rawText = fs.readFileSync(path.resolve(args.input), "utf8").replace(/^\uFEFF/, "");
  const payload = JSON.parse(rawText);
  const retrievedAt = payload.retrievedAt || new Date().toISOString();
  const rows = parseWyomingLiquorJson(payload, {
    mode: args.mode,
    retrievedAt
  });
  const importPayload = buildImportPayload(rows, retrievedAt, Array.isArray(payload.products) ? payload.products.length : rows.length);
  const output = JSON.stringify(importPayload, null, 2) + "\n";

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
  cleanDisplayName,
  includeRow,
  normalizeWyomingBottle,
  normalizeWyomingRow,
  parseAgeFromName,
  parsePackageDetails,
  parseProofFromName,
  parseWyomingLiquorJson
};
