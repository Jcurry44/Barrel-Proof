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
  id: "tabc_product_registration",
  name: "Texas TABC Approved Product Label Search",
  url: "https://www.tabc.texas.gov/public-information/approved-labels-search/",
  dataUrl: "https://data.texas.gov/dataset/Approved-Product-Label-Search/2cjh-3vae",
  region: "TX",
  sourceType: "state_product_registration"
};

function parseArgs(argv) {
  const args = {
    inputs: [],
    mode: "american"
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input") args.inputs.push(argv[++i]);
    if (arg === "--input-dir") args.inputDir = argv[++i];
    if (arg === "--out") args.out = argv[++i];
    if (arg === "--mode") args.mode = argv[++i];
  }

  return args;
}

function resolveInputFiles(args) {
  const files = [...args.inputs];
  if (args.inputDir) {
    const dir = path.resolve(args.inputDir);
    for (const entry of fs.readdirSync(dir)) {
      if (
        entry.toLowerCase().endsWith(".json") &&
        entry.includes("approved-product-labels-") &&
        !/\b(?:count|sample|types)\b/i.test(entry)
      ) {
        files.push(path.join(dir, entry));
      }
    }
  }
  return unique(files).map((file) => path.resolve(file));
}

function parseTexasTabcFiles(files, options = {}) {
  const parsedRows = files.flatMap((file) => parseTexasTabcJson(
    JSON.parse(fs.readFileSync(file, "utf8")),
    {
      ...options,
      sourceFile: path.relative(process.cwd(), file)
    }
  ));

  const byCertificate = new Map();
  for (const row of parsedRows.filter((row) => includeRow(row, options.mode || "american"))) {
    byCertificate.set(row.tabcCertificateNumber, row);
  }

  return {
    parsedRows,
    rows: Array.from(byCertificate.values())
      .sort((a, b) => a.name.localeCompare(b.name) || String(a.approvalDate).localeCompare(String(b.approvalDate)))
  };
}

function parseTexasTabcJson(input, options = {}) {
  const rows = Array.isArray(input) ? input : [];
  const retrievedAt = options.retrievedAt || new Date().toISOString();

  return rows
    .map((row) => normalizeTexasTabcRow(row, {
      retrievedAt,
      sourceFile: options.sourceFile || ""
    }))
    .filter(Boolean);
}

function normalizeTexasTabcRow(row, options = {}) {
  const tabcCertificateNumber = normalizeWhitespace(row.tabc_certificate_number);
  const brandName = cleanProductName(row.brand_name);
  if (!tabcCertificateNumber || !brandName) return null;

  const abv = parseAbv(row.alcohol_content_by_volume);
  const age = parseAgeFromName(brandName);
  const size = parseSizeFromName(brandName);

  return {
    sourceId: SOURCE.id,
    sourceRecordId: tabcCertificateNumber,
    tabcCertificateNumber,
    permitLicenseNumber: normalizeWhitespace(row.permit_license_number),
    brandName,
    name: cleanDisplayName(brandName),
    rawName: brandName,
    type: normalizeWhitespace(row.type),
    approvalDate: normalizeDate(row.approval_date),
    tradeName: normalizeWhitespace(row.trade_name),
    abv,
    proof: Number.isFinite(abv) ? roundTo(abv * 2, 2) : null,
    rawAlcoholContent: normalizeWhitespace(row.alcohol_content_by_volume),
    ttbNumber: normalizeWhitespace(row.ttb_number),
    certificateUrl: row.file_link && row.file_link.url ? normalizeWhitespace(row.file_link.url) : "",
    category: inferTexasTabcCategory(brandName),
    age: age.label,
    ageYears: age.years,
    size,
    sourceFile: options.sourceFile || "",
    sourceUrl: SOURCE.url,
    dataUrl: SOURCE.dataUrl,
    region: SOURCE.region,
    retrievedAt: options.retrievedAt || new Date().toISOString()
  };
}

function includeRow(row, mode) {
  if (!row) return false;
  if (mode === "all") return true;
  if (row.type.toUpperCase() !== "SPIRITS") return false;
  if (Number.isFinite(row.abv) && row.abv > 0 && row.abv < 20) return false;

  const text = [row.brandName, row.name, row.tradeName].join(" ").toLowerCase();
  if (looksLikeNonWhiskeyProduct(text)) return false;
  if (mode === "whiskey") return isSeriousWhiskeyProduct(text);
  if (mode === "rye") return isSeriousRyeWhiskey(text);
  if (mode === "bourbon") {
    if (looksLikeBourbonContextOnly(text)) return false;
    return /\bbourbon\b/i.test(text) || isSeriousTennesseeWhiskey(text);
  }
  return isSeriousWhiskeyProduct(text);
}

function looksLikeBourbonContextOnly(text) {
  return [
    /\bbourbon\s+(?:barrels?|barreled|casks?|casked)\b/,
    /\bbourbon\/\w+/,
    /\b(?:aged|barrel|barreled|cask|finish|finished)\s+in\s+bourbon\b/,
    /\bex[-\s]?bourbon\b/,
    /\brye\b/
  ].some((pattern) => pattern.test(text)) && !(/\bhigh\s+rye\b/.test(text) && /\bbourbon\b/.test(text));
}

function looksLikeNonWhiskeyProduct(text) {
  const isWhiskey = /\b(whisk(?:e)?y|whisky|bourbon|rye|tennessee)\b/.test(text);
  const isLegitCaskFinish = isWhiskey && /\b(?:rum|wine|port|cognac|armagnac|sherry|oloroso|madeira|marsala|px|cabernet|bourbon)\s+cask\s+finish(?:ed)?\b/.test(text);
  const isHoneyBarrelFinish = /\bfinished\s+in\s+honey\s+barrels?\b|\bhoney\s+barrels?\b/.test(text);

  if (/\b(?:wine|beer|ale|porter|stout|lager|ipa|cider|sangria)\b/i.test(text) && !isLegitCaskFinish) return true;
  if (/\bhoney\b/.test(text) && !isHoneyBarrelFinish) return true;

  return [
    /\bapple\b/,
    /\bbanana\b/,
    /\bblackberry\b/,
    /\bbrandy\b/,
    /\bbutterscotch\b/,
    /\bcaramel\b/,
    /\bcherry\b/,
    /\bchocolate\b/,
    /\bcinnamon\b/,
    /\bcoconut\b/,
    /\bcocktails?\b/,
    /\bcoffee\b/,
    /\bcola\b/,
    /\bcoke\b/,
    /\bcordial\b/,
    /\bcream\b/,
    /\bcreme\b/,
    /\bfire\b/,
    /\bflavo(?:u)?red\b/,
    /\bgin\s+(?!cask\s+finish)/,
    /\bginger\b/,
    /\bhighball\b/,
    /\bhoneyed\b/,
    /\birish\s+mist\b/,
    /\bliqueur\b/,
    /\blemonade\b/,
    /\bmezcal\b/,
    /\bmint\b/,
    /\bmoonshine\b/,
    /\bnatural\s+flavou?rs?\b/,
    /\bold\s+fashion(?:ed)?\b/,
    /\bpeach\b/,
    /\bpecan\b/,
    /\bpeanut\s+butter\b/,
    /\bpineapple\b/,
    /\bpunch\b/,
    /\broot\s+berr(?:y)?\b/,
    /\brtd\b/,
    /\brum\s+(?!cask\s+finish)/,
    /\bbrown\s+sugar\b/,
    /\bspice\b/,
    /\bspiced\b/,
    /\btabasco\b/,
    /\btequila\s+(?!cask\s+finish)/,
    /\bvanilla\b/,
    /\bvodka\b/,
    /\bwhiskey\s+sour\b/,
    /\b(?:2pk|3pk|gift|pack|sampler|vap)\b/
  ].some((pattern) => pattern.test(text));
}

function inferTexasTabcCategory(name) {
  const text = cleanProductName(name).toLowerCase();
  if (/\bamerican\s+single\s+malt\b/i.test(text)) return "American Single Malt";
  if (isSeriousTennesseeWhiskey(text)) return "Tennessee Whiskey";
  if (isSeriousRyeWhiskey(text)) return "Rye Whiskey";
  if (/\bwheated?\b.*\bbourbon\b|\bbourbon\b.*\bwheated?\b/i.test(text)) return "Wheated Bourbon";
  if (/\bwheat\s+whisk(?:e)?y\b/i.test(text)) return "Wheat Whiskey";
  if (/\bcanadian\s+whisk(?:e)?y\b|\bcanadian\b.*\bwhisk(?:e)?y\b|\bfound\s+north\b/i.test(text)) return "Canadian Whisky";
  if (/\bscotch\b/i.test(text) && !/\bscotch\s+cask\b/i.test(text)) return "Scotch Whisky";
  if (/\birish\s+whisk(?:e)?y\b/i.test(text)) return "Irish Whiskey";
  if (/\bjapanese\b.*\bwhisk(?:e)?y\b|\b(akashi|akkeshi|yamazaki|hakushu|hibiki|chichibu|nikka)\b/i.test(text)) return "Japanese Whisky";
  if (/\bsingle\s+malt\b|\b(kavalan|amrut|paul\s+john|starward|mackmyra|penderyn|english\s+whisk(?:e)?y)\b/i.test(text)) return "Single Malt / World Whisky";
  if (/\bamerican\s+whisk(?:e)?y\b|\blight\s+whisk(?:e)?y\b|\bcorn\s+whisk(?:e)?y\b/i.test(text)) return "American Whiskey";
  if (/\bblended\s+whisk(?:e)?y\b|\bblended\s+whisky\b/i.test(text)) return "Blended Whiskey";
  if ((/\bbottled?\s+in\s+bond\b|\bbib\b/i.test(text)) && /\bbourbon\b/i.test(text)) return "Bottled in Bond Bourbon";
  if (/\bbourbon\b/i.test(text)) return "Bourbon";
  if (/\bwhisk(?:e)?y\b|\bwhisky\b/i.test(text)) return "Whiskey";
  return "Texas TABC product registration";
}

function isSeriousWhiskeyProduct(text) {
  return /\b(whisk(?:e)?y|whisky|bourbon)\b/i.test(text) ||
    isSeriousTennesseeWhiskey(text) ||
    /\bfound\s+north\b/i.test(text) ||
    isSeriousRyeWhiskey(text);
}

function isSeriousRyeWhiskey(text) {
  const clean = normalizeWhitespace(text).toLowerCase();
  if (/\b(apple|cider|cocktail|cola|coke|cream|honey|liqueur|moonshine|peach|stout|vodka)\b/.test(clean)) return false;
  return /\b(straight\s+rye|rye\s+whisk(?:e)?y|whisk(?:e)?y\s+rye|bottled?\s+in\s+bond\s+rye|bib\s+rye)\b/.test(clean) ||
    (/\brye\b/.test(clean) && !/\bbourbon\b/.test(clean));
}

function isSeriousTennesseeWhiskey(text) {
  const clean = normalizeWhitespace(text).toLowerCase();
  if (/\b(apple|cola|coke|fire|honey|moonshine|rye)\b/.test(clean)) return false;
  return /\b(jack daniel'?s (?:black|bonded|master distiller|sinatra|single barrel|tennessee whiskey)|george dickel|uncle nearest|nearest green|heaven'?s door (?:limited release )?tennessee)\b/.test(clean);
}

function cleanProductName(value) {
  return normalizeWhitespace(value)
    .replace(/[Ã¢â‚¬ËœÃ¢â‚¬â„¢]/g, "'")
    .replace(/[Ã¢â‚¬Å“Ã¢â‚¬Â]/g, "\"")
    .trim();
}

function cleanDisplayName(value) {
  return titleCase(cleanProductName(value)
    .replace(/\s+(?:50|100|200|375|700|750)\s*ML\b/ig, "")
    .replace(/\s+1\.75L\b/ig, "")
    .replace(/\s+1L\b/ig, "")
    .replace(/\s+/g, " ")
    .trim());
}

function titleCase(value) {
  const keepUpper = new Set(["BIB", "DBA", "LLC", "TX", "XO"]);
  return cleanProductName(value).toLowerCase().replace(/\b([a-z0-9][a-z0-9']*)\b/g, (token) => {
    const upper = token.toUpperCase();
    if (keepUpper.has(upper)) return upper;
    if (/^\d+xo$/i.test(token)) return upper;
    return token.charAt(0).toUpperCase() + token.slice(1);
  });
}

function normalizeDate(value) {
  const clean = normalizeWhitespace(value);
  const match = clean.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return [match[1], match[2], match[3]].join("-");
  return clean;
}

function parseAbv(value) {
  const parsed = Number(normalizeWhitespace(value).replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 100 ? parsed : null;
}

function parseSizeFromName(value) {
  const match = cleanProductName(value).match(/\b(50|100|200|375|700|750)\s*ML\b|\b(1(?:\.00)?L|1\.75L)\b/i);
  if (!match) return null;
  return normalizeSize(match[0]);
}

function normalizeSize(value) {
  const clean = normalizeWhitespace(value).toUpperCase().replace(/\s+/g, "");
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

function roundTo(value, places) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function normalizeTexasTabcBottle(record) {
  const fields = [
    "tabcCertificateNumber",
    "permitLicenseNumber",
    "brandName",
    "type",
    "approvalDate",
    "tradeName",
    "abv",
    "proof",
    "ttbNumber",
    "certificateUrl"
  ];

  return {
    id: slugify([record.name, record.tabcCertificateNumber].filter(Boolean).join(" ")),
    identityKey: ["tabc", record.tabcCertificateNumber].join("|"),
    name: record.name,
    producer: record.tradeName || "",
    supplier: "",
    category: record.category,
    bottleKind: inferBottleKind({ name: record.name, category: record.category }),
    proof: record.proof,
    age: record.age,
    ageYears: record.ageYears,
    size: record.size,
    aliases: unique([record.brandName, record.name, record.tabcCertificateNumber, record.ttbNumber]),
    sourceRefs: [
      {
        sourceId: SOURCE.id,
        sourceRecordId: record.sourceRecordId,
        sourceUrl: record.certificateUrl || SOURCE.url,
        retrievedAt: record.retrievedAt,
        fields
      }
    ],
    prices: [],
    labelApprovals: [
      {
        tabcCertificateNumber: record.tabcCertificateNumber,
        permitLicenseNumber: record.permitLicenseNumber,
        approvalDate: record.approvalDate,
        brandName: record.brandName,
        tradeName: record.tradeName,
        type: record.type,
        abv: record.abv,
        proof: record.proof,
        ttbNumber: record.ttbNumber,
        certificateUrl: record.certificateUrl
      }
    ]
  };
}

function buildImportPayload(rows, retrievedAt, rawRecordCount, sourceFiles = []) {
  const bottles = mergeCatalogRecords(rows.map(normalizeTexasTabcBottle));
  return {
    schemaVersion: 1,
    source: SOURCE,
    sourceFiles,
    retrievedAt,
    rawRecordCount,
    uniqueRecordCount: rows.length,
    bottleCount: bottles.length,
    records: rows,
    bottles
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const inputFiles = resolveInputFiles(args);
  if (!inputFiles.length) throw new Error("Provide --input JSON files or --input-dir data/raw/texas-tabc.");

  const retrievedAt = new Date().toISOString();
  const { parsedRows, rows } = parseTexasTabcFiles(inputFiles, {
    mode: args.mode,
    retrievedAt
  });
  const sourceFiles = inputFiles.map((file) => path.relative(process.cwd(), file));
  const payload = buildImportPayload(rows, retrievedAt, parsedRows.length, sourceFiles);
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
  normalizeSize,
  normalizeTexasTabcRow,
  parseTexasTabcFiles,
  parseTexasTabcJson
};
