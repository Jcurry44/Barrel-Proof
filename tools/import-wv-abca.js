#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const {
  inferBottleKind,
  mergeCatalogRecords,
  normalizeWhitespace,
  slugify,
  unique
} = require("../src/logic/catalog.js");

const SOURCE = {
  id: "wv_abca_liquor_search",
  name: "West Virginia ABCA Liquor Search",
  url: "https://www.wvabca.com/liquorsearch.aspx",
  dataUrl: "https://api.wvabca.com/API.svc/GetProductNameSearch",
  region: "WV",
  sourceType: "state_product_catalog_search"
};

function parseArgs(argv) {
  const args = {
    mode: "serious",
    inputDir: "data/raw/wv-abca"
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input") args.input = argv[++i];
    if (arg === "--input-dir") args.inputDir = argv[++i];
    if (arg === "--out") args.out = argv[++i];
    if (arg === "--mode") args.mode = argv[++i];
  }

  return args;
}

function resolveInputFiles(args) {
  if (args.input) return [path.resolve(args.input)];
  const dir = path.resolve(args.inputDir || "data/raw/wv-abca");
  return fs.readdirSync(dir)
    .filter((entry) => /-search\.json$/i.test(entry))
    .sort()
    .map((entry) => path.join(dir, entry));
}

function parseWestVirginiaSearchFiles(files, options = {}) {
  const rows = [];
  for (const file of files) {
    const sourceFile = path.relative(process.cwd(), file);
    const searchTerm = searchTermFromFile(file);
    rows.push(...parseWestVirginiaSearchRows(readSearchRows(file), {
      ...options,
      sourceFile,
      searchTerm
    }));
  }

  return dedupeRows(rows);
}

function readSearchRows(file) {
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.d)) return parsed.d;
  if (typeof parsed.d === "string") {
    const nested = JSON.parse(parsed.d);
    return Array.isArray(nested) ? nested : [];
  }
  if (Array.isArray(parsed.GetProductNameSearchResult)) return parsed.GetProductNameSearchResult;
  return [];
}

function parseWestVirginiaSearchRows(rows, options = {}) {
  const retrievedAt = options.retrievedAt || new Date().toISOString();
  return (rows || [])
    .flatMap((row) => normalizeWestVirginiaRow(row, {
      retrievedAt,
      searchTerm: options.searchTerm || "",
      sourceFile: options.sourceFile || ""
    }))
    .filter((row) => includeRow(row, options.mode || "serious"));
}

function normalizeWestVirginiaRow(row, options = {}) {
  const productId = normalizeWhitespace(row.ProductID);
  const configId = normalizeWhitespace(row.ConfigID);
  const rawName = cleanProductName(row.ProductName);
  if (!productId || !rawName) return [];

  const sizes = parseBottleSizes(row.BottleSize);
  const sizeVariants = sizes.length ? sizes : [null];
  const details = parseProductDetails(rawName);

  return sizeVariants.map((size) => ({
    sourceId: SOURCE.id,
    sourceRecordId: [productId, size || "unknown-size"].join(":"),
    productId,
    configId,
    name: details.name,
    rawName,
    category: inferWestVirginiaCategory(rawName),
    proof: details.proof,
    age: details.age,
    ageYears: details.ageYears,
    size,
    rawBottleSize: normalizeWhitespace(row.BottleSize),
    sourceFile: options.sourceFile || "",
    searchTerms: unique([options.searchTerm]),
    sourceUrl: SOURCE.url,
    dataUrl: SOURCE.dataUrl,
    region: SOURCE.region,
    retrievedAt: options.retrievedAt || new Date().toISOString()
  }));
}

function includeRow(row, mode) {
  if (!row) return false;
  if (mode === "all") return true;

  const text = [row.rawName, row.name, row.category].join(" ").toLowerCase();

  if (mode === "whiskey" || mode === "serious") {
    if (looksLikeNonSeriousWhiskeyProduct(text)) return false;
    return /\b(whiskey|whisky|bourbon|rye|scotch|canadian|irish|japanese|single malt|tennessee|bib|bottled in bond)\b/i.test(text) ||
      isSeriousTennesseeWhiskey(text);
  }

  if (looksLikeNonBourbonProduct(text)) return false;
  if (/\bbourbon\b/i.test(text)) return true;
  if (/\b(b\.?i\.?b\.?|bib|bottled?\s+in\s+bond)\b/i.test(text)) return true;
  return isSeriousTennesseeWhiskey(text);
}

function looksLikeNonBourbonProduct(text) {
  const clean = normalizeWhitespace(text).toLowerCase();

  if (/\brye\b/.test(clean) && !/\bbourbon\b/.test(clean)) return true;

  return [
    /\bapple butter\b/,
    /\bapple fizz\b/,
    /\bbanana\b/,
    /\bblackberry\b/,
    /\bbourbon ball\b/,
    /\bbourbon cream\b/,
    /\bbourbon mule\b/,
    /\bcherry\b/,
    /\bcocktail\b/,
    /\bcoca cola\b/,
    /\bcola\b/,
    /\bcream\b/,
    /\bfamily of brands\b/,
    /\bfire\b/,
    /\bflavor(?:ed|s)?\b/,
    /\bfizz\b/,
    /\bginger\b/,
    /\bchocolate\b/,
    /\bclub\s+pack\b/,
    /\bhoneycomb\b/,
    /\bhoney\s*&\s*bourbon\b/,
    /\bhoney\s+bourbon\b/,
    /\bhoney\s+vanilla\b/,
    /\blemonade\b/,
    /\bliqueur\b/,
    /\bmango\b/,
    /\bmultipacks?\b/,
    /\bpallet\b/,
    /\bpeach honey\b/,
    /\bpecan bourbon\b/,
    /\bratafia\b/,
    /\broot\s*beer\b/,
    /\brtd\b/,
    /\bsalty\b/,
    /\bsour\b/,
    /\bvariety\b/,
    /\bvodka\b/,
    /\bwatermelon\b/,
    /\bwinter jack\b/,
    /\bwith\s+(?:4\s+)?flavors?\b/,
    /\bwith\s+(?:glasses?|stir spoon|ice mold|jack\s*&\s*coke glass)\b/,
    /\bw\/\s*(?:glass|glasses)\b/,
    /\b\d+\s*-\s*\d+\s*packs?\b/,
    /\b\d+\s*packs?\b/,
    /\b\d+\s*pk\b/,
    /\b\d+\s+cases?\b/
  ].some((pattern) => pattern.test(clean));
}

function looksLikeNonSeriousWhiskeyProduct(text) {
  const clean = normalizeWhitespace(text).toLowerCase();
  const isHoneyCask = /\bhoney\s+(?:barrels?|casks?)\b|\b(?:aged|finished)\s+in\s+honey\s+barrels?\b/i.test(clean);
  const isMapleCask = /\bmaple\s+(?:syrup\s+)?(?:barrels?|casks?)\b|\b(?:aged|finished)\s+in\s+maple\s+(?:syrup\s+)?barrels?\b/i.test(clean);

  if (/\bhoney\b/i.test(clean) && !isHoneyCask && !/\bhoneydew\b/i.test(clean)) return true;
  if (/\bmaple\b/i.test(clean) && !isMapleCask && !/\bmaplewood\b/i.test(clean)) return true;

  return [
    /\bapple butter\b/,
    /\bapple fizz\b/,
    /\bapple\b/,
    /\bbanana\b/,
    /\bblackberry\b/,
    /\bbourbon ball\b/,
    /\bbourbon cream\b/,
    /\bbourbon mule\b/,
    /\bcherry\b/,
    /\bcocktail\b/,
    /\bcoca cola\b/,
    /\bcola\b/,
    /\bcream\b/,
    /\bfamily of brands\b/,
    /\bfire\b/,
    /\bflavor(?:ed|s)?\b/,
    /\bfizz\b/,
    /\bginger\b/,
    /\bchocolate\b/,
    /\bclub\s+pack\b/,
    /\bhoneycomb\b/,
    /\blemonade\b/,
    /\bliqueur\b/,
    /\bmango\b/,
    /\bmultipacks?\b/,
    /\bpallet\b/,
    /\bpeach\b/,
    /\bpecan bourbon\b/,
    /\bratafia\b/,
    /\broot\s*beer\b/,
    /\brtd\b/,
    /\bsalty\b/,
    /\bsour\s+mix\b/,
    /\bvariety\b/,
    /\bvodka\b/,
    /\bwatermelon\b/,
    /\bwinter jack\b/,
    /\bwith\s+(?:4\s+)?flavors?\b/,
    /\bwith\s+(?:glasses?|stir spoon|ice mold|jack\s*&\s*coke glass)\b/,
    /\bw\/\s*(?:glass|glasses)\b/,
    /\b\d+\s*-\s*\d+\s*packs?\b/,
    /\b\d+\s*packs?\b/,
    /\b\d+\s*pk\b/,
    /\b\d+\s+cases?\b/
  ].some((pattern) => pattern.test(clean));
}

function isSeriousTennesseeWhiskey(text) {
  const clean = normalizeWhitespace(text).toLowerCase();
  if (/\brye\b/.test(clean)) return false;

  return [
    /\bgeorge dickel\s*#?8\b/,
    /\bgeorge dickel\s*#?12\b/,
    /\bgeorge dickel barrel select\b/,
    /\bgentleman jack\b/,
    /\bjack daniel'?s 27 gold\b/,
    /\bjack daniel'?s black\b/,
    /\bjack daniel'?s bonded\b/,
    /\bjack daniel'?s bonded triple mash\b/,
    /\bjack daniel'?s single barrel\b/,
    /\bjack daniel'?s sinatra\b/,
    /\bjack daniel'?s tennessee whiskey\b/,
    /\bjack daniels single barrel\b/,
    /\bjesse james barrel strength tennessee whiskey\b/,
    /\bole smoky tennessee whiskey\b/,
    /\bthree chord tennessee straight whiskey\b/,
    /\buncle nearest\b/
  ].some((pattern) => pattern.test(clean));
}

function inferWestVirginiaCategory(name) {
  const text = normalizeWhitespace(name).toLowerCase();
  if (/\bscotch\b|\b(macallan|glenfiddich|glenlivet|laphroaig|ardbeg|lagavulin)\b/i.test(text)) return "Scotch Whisky";
  if (/\bcanadian\b|\bcrown royal\b|\bcaribou crossing\b/i.test(text)) return "Canadian Whisky";
  if (/\birish\b|\bjameson\b|\bbushmills\b|\bredbreast\b|\btullamore\b/i.test(text)) return "Irish Whiskey";
  if (/\bjapanese\b|\bhibiki\b|\bnikka\b|\bsuntory\b|\btoki\b|\byamazaki\b/i.test(text)) return "Japanese Whisky";
  if (/\brye\b/i.test(text) && !/\bhigh\s+rye\s+bourbon\b/i.test(text)) return "Rye Whiskey";
  if (/\bwheat whiskey\b|\bbernheim\b/i.test(text)) return "Wheat Whiskey";
  if (/\bsingle malt\b/i.test(text)) return "American Single Malt";
  if (isSeriousTennesseeWhiskey(text)) return "Tennessee Whiskey";
  if (/\bbottled?\s+in\s+bond\b|\bbib\b/i.test(text)) return "Bottled in Bond Bourbon";
  if (/\bbourbon\b/i.test(text)) return "Bourbon";
  if (/\bwhiskey|whisky\b/i.test(text)) return "American Whiskey";
  return "West Virginia product search match";
}

function parseBottleSizes(value) {
  return unique(normalizeWhitespace(value)
    .split(",")
    .map((size) => normalizeSizeLabel(size))
    .filter(Boolean));
}

function normalizeSizeLabel(value) {
  const clean = normalizeWhitespace(value).toUpperCase().replace(/\s+/g, "");
  if (!clean) return null;
  if (clean === "1000" || clean === "1000ML" || clean === "1L" || clean === "1.00L") return "1L";
  if (clean === "1750" || clean === "1750ML" || clean === "1.75L") return "1.75L";
  if (clean === "3000" || clean === "3000ML" || clean === "3L") return "3L";
  if (/^\d+$/.test(clean)) return Number(clean) + "ml";
  if (/^\d+ML$/.test(clean)) return Number(clean.replace(/\D/g, "")) + "ml";
  return clean;
}

function parseProductDetails(rawName) {
  const raw = cleanProductName(rawName);
  const proof = parseProofFromName(raw);
  const age = parseAgeFromName(raw);
  const name = titleCaseProductName(raw
    .replace(proofPattern(), " ")
    .replace(agePattern(), " ")
    .replace(/\s+/g, " ")
    .trim());

  return {
    name: name || raw,
    proof,
    age: age.label,
    ageYears: age.years
  };
}

function parseProofFromName(value) {
  const match = cleanProductName(value).match(proofMatchPattern());
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseAgeFromName(value) {
  const match = cleanProductName(value).match(ageMatchPattern());
  if (!match) return { label: "Unknown", years: null };
  const years = Number(match[1]);
  if (!Number.isFinite(years)) return { label: "Unknown", years: null };
  return {
    label: years + " year" + (years === 1 ? "" : "s"),
    years
  };
}

function proofPattern() {
  return /\b(\d+(?:\.\d+)?)\s*(?:PROOF|PRF|PF)\.?(?=\s|$)/gi;
}

function proofMatchPattern() {
  return /\b(\d+(?:\.\d+)?)\s*(?:PROOF|PRF|PF)\.?(?=\s|$)/i;
}

function agePattern() {
  return /\b(?:AGED\s*)?(\d+(?:\.\d+)?)\s*(?:YEARS?|YRS?|YR\.?|YO)\.?(?=\s|$)/gi;
}

function ageMatchPattern() {
  return /\b(?:AGED\s*)?(\d+(?:\.\d+)?)\s*(?:YEARS?|YRS?|YR\.?|YO)\.?(?=\s|$)/i;
}

function cleanProductName(value) {
  return normalizeWhitespace(value)
    .replace(/â€™/g, "'")
    .replace(/â€œ|â€/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, "\"")
    .replace(/\b(\d+)Th\b/g, "$1th")
    .replace(/\b2Xo\b/g, "2XO")
    .replace(/\bWv\b/g, "WV")
    .replace(/\bKy\b/g, "KY")
    .replace(/\bKs\b/g, "KS")
    .replace(/'S\b/g, "'s")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCaseProductName(value) {
  const clean = cleanProductName(value);
  if (!clean) return "";

  return clean.replace(/\b[A-Za-z][A-Za-z']*\b/g, (word) => {
    const lower = word.toLowerCase();
    const upperTokens = new Set(["bib", "b.i.b", "wv", "wvu", "ky", "ii", "sr", "ng"]);
    if (/[a-z]/.test(word.slice(1))) return word;
    if (upperTokens.has(lower)) return word.includes(".") ? word.toUpperCase() : lower.toUpperCase();
    if (["and", "by", "in", "of", "on", "the", "to", "with"].includes(lower)) {
      return lower.slice(0, 1).toUpperCase() + lower.slice(1);
    }
    return lower.slice(0, 1).toUpperCase() + lower.slice(1);
  });
}

function dedupeRows(rows) {
  const byRecord = new Map();
  for (const row of rows) {
    const existing = byRecord.get(row.sourceRecordId);
    if (!existing) {
      byRecord.set(row.sourceRecordId, {
        ...row,
        searchTerms: unique(row.searchTerms),
        sourceFiles: unique([row.sourceFile])
      });
      continue;
    }

    existing.searchTerms = unique([...(existing.searchTerms || []), ...(row.searchTerms || [])]);
    existing.sourceFiles = unique([...(existing.sourceFiles || []), row.sourceFile]);
  }

  return Array.from(byRecord.values()).sort((a, b) => a.name.localeCompare(b.name) || String(a.size).localeCompare(String(b.size)));
}

function normalizeWestVirginiaBottle(record) {
  const fields = [
    "productId",
    "configId",
    "name",
    "rawName",
    "category",
    "rawBottleSize",
    "size",
    "searchTerms"
  ];

  return {
    id: slugify([record.name, record.size, record.productId].filter(Boolean).join(" ")),
    identityKey: makeWestVirginiaIdentityKey(record),
    name: record.name,
    producer: "",
    supplier: "",
    category: record.category,
    bottleKind: inferBottleKind({ name: record.name, category: record.category }),
    proof: record.proof,
    age: record.age,
    ageYears: record.ageYears,
    size: record.size,
    aliases: unique([record.name, record.rawName, record.productId, record.configId]),
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
}

function makeWestVirginiaIdentityKey(record) {
  return [
    slugify(record.name),
    slugify(record.size || ""),
    slugify(record.productId)
  ].filter(Boolean).join("|");
}

function buildImportPayload(rows, retrievedAt, sourceFiles = []) {
  const bottles = mergeCatalogRecords(rows.map(normalizeWestVirginiaBottle));
  return {
    schemaVersion: 1,
    source: SOURCE,
    retrievedAt,
    sourceFiles,
    rawRecordCount: rows.length,
    bottleCount: bottles.length,
    records: rows,
    bottles
  };
}

function searchTermFromFile(file) {
  return path.basename(file).replace(/-search\.json$/i, "").replace(/-/g, " ");
}

async function main() {
  const args = parseArgs(process.argv);
  const inputFiles = resolveInputFiles(args);
  if (!inputFiles.length) throw new Error("No WV ABCA search JSON files found.");

  const retrievedAt = new Date().toISOString();
  const rows = parseWestVirginiaSearchFiles(inputFiles, {
    mode: args.mode,
    retrievedAt
  });
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
  normalizeSizeLabel,
  normalizeWestVirginiaBottle,
  normalizeWestVirginiaRow,
  parseAgeFromName,
  parseBottleSizes,
  parseProductDetails,
  parseProofFromName,
  parseWestVirginiaSearchFiles,
  parseWestVirginiaSearchRows,
  titleCaseProductName
};
