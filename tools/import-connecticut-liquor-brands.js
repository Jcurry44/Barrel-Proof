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
  id: "connecticut_liquor_brands",
  name: "Connecticut Liquor Brands",
  url: "https://catalog.data.gov/dataset/liquor-brands",
  dataUrl: "https://data.ct.gov/api/views/u6ds-fzyp",
  region: "CT",
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
      if (entry.toLowerCase().endsWith(".json") && entry.includes("liquor-brands-") && !entry.includes("count") && !entry.includes("sample") && !entry.includes("metadata")) {
        files.push(path.join(dir, entry));
      }
    }
  }
  return unique(files).map((file) => path.resolve(file));
}

function parseConnecticutFiles(files, options = {}) {
  const parsedRows = files.flatMap((file) => parseConnecticutJson(
    JSON.parse(fs.readFileSync(file, "utf8")),
    {
      ...options,
      sourceFile: path.relative(process.cwd(), file)
    }
  ));

  const byRegistration = new Map();
  for (const row of parsedRows.filter((row) => includeRow(row, options.mode || "bourbon"))) {
    byRegistration.set(row.ctRegistrationNumber, row);
  }

  return {
    parsedRows,
    rows: Array.from(byRegistration.values())
      .sort((a, b) => a.name.localeCompare(b.name) || String(a.ctRegistrationNumber).localeCompare(String(b.ctRegistrationNumber)))
  };
}

function parseConnecticutJson(input, options = {}) {
  const rows = Array.isArray(input) ? input : [];
  const retrievedAt = options.retrievedAt || new Date().toISOString();

  return rows
    .map((row) => normalizeConnecticutRow(row, {
      retrievedAt,
      sourceFile: options.sourceFile || ""
    }))
    .filter(Boolean);
}

function normalizeConnecticutRow(row, options = {}) {
  const ctRegistrationNumber = normalizeWhitespace(row.ct_registration_number);
  const brandName = cleanProductName(row.brand_name);
  if (!ctRegistrationNumber || !brandName) return null;

  const proof = parseProofFromName(brandName);
  const age = parseAgeFromName(brandName);

  return {
    sourceId: SOURCE.id,
    sourceRecordId: ctRegistrationNumber,
    ctRegistrationNumber,
    brandName,
    name: titleCase(brandName),
    status: normalizeWhitespace(row.status),
    effectiveDate: normalizeDate(row.effective),
    expirationDate: normalizeDate(row.expiration),
    outOfStateShipper: titleCase(row.out_of_state_shipper),
    supervisorCredential: normalizeWhitespace(row.supervisor_credential),
    wholesalers: parseWholesalers(row.wholesalers),
    proof,
    category: inferConnecticutCategory(brandName),
    age: age.label,
    ageYears: age.years,
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
  if (row.status && row.status.toLowerCase() !== "active") return false;

  const text = [row.brandName, row.name, row.outOfStateShipper].join(" ").toLowerCase();
  if (looksLikeNonWhiskeyProduct(text)) return false;
  if (mode === "whiskey") return isSeriousWhiskeyProduct(text);
  if (mode === "rye") return isSeriousRyeWhiskey(text);
  if (mode === "bourbon") return /\bbourbon\b/i.test(text) || isSeriousTennesseeWhiskey(text);
  return isSeriousWhiskeyProduct(text);
}

function looksLikeNonWhiskeyProduct(text) {
  const isWhiskey = /\b(whisk(?:e)?y|whisky|bourbon|rye|tennessee)\b/.test(text);
  const isBeerBarrelBourbon = /\bbeer\s+barrel\s+bourbon\b/.test(text);
  const isLegitCaskFinish = isWhiskey && /\b(?:rum|wine|port|cognac|armagnac|sherry|oloroso|madeira|marsala|px|cabernet)\s+cask\s+finish(?:ed)?\b/.test(text);
  const isHoneyBarrelFinish = /\bfinished\s+in\s+honey\s+barrels?\b|\bhoney\s+barrels?\b/.test(text);

  if (/\bbourbon\s+barrel(?:s|-|\s)+(?:aged|stout|ale|cabernet|red|wine|porter|quad)\b/.test(text)) return true;
  if (/\b(cabernet|chardonnay|merlot|pinot|red blend|sauvignon|stout|ale|ales|porter|lager|ipa|cider|beer|brewing|brewery|wine|chateau|sangria)\b/.test(text) && !isBeerBarrelBourbon && !isLegitCaskFinish) return true;
  if (/\bhoney\b/.test(text) && !isHoneyBarrelFinish) return true;

  return [
    /\bapple\b/,
    /\bbanana\b/,
    /\bblackberry\b/,
    /\bbrandy\b/,
    /\bcherry\b/,
    /\bcinnamon\b/,
    /\bcocktails?\b/,
    /\bcoffee\b/,
    /\bcaramel\b/,
    /\bcola\b/,
    /\bcoke\b/,
    /\bcream\b/,
    /\bcreme\b/,
    /\bflavo(?:u)?red\b/,
    /\bfire\b/,
    /\bgin\s+(?!cask\s+finish)/,
    /\bginger\b/,
    /\bhabanero\b/,
    /\bhighball\b/,
    /\bliqueur\b/,
    /\blemonade\b/,
    /\bmoonshine\b/,
    /\bnatural\s+flavou?r\b/,
    /\bold\s+fashion(?:ed)?\b/,
    /\bpeach\b/,
    /\bpeanut\s+butter\b/,
    /\bpineapple\b/,
    /\brtd\b/,
    /\bspiced\b/,
    /\btea\b/,
    /\btequila\s+(?!cask\s+finish)/,
    /\bvodka\b/,
    /\bwhiskey\s+sour\b/,
    /\b(?:2pk|3pk|gift|pack|sampler)\b/
  ].some((pattern) => pattern.test(text));
}

function inferConnecticutCategory(name) {
  const text = cleanProductName(name).toLowerCase();
  if (isSeriousTennesseeWhiskey(text)) return "Tennessee Whiskey";
  if (isSeriousRyeWhiskey(text)) return "Rye Whiskey";
  if (/\bwheated?\s+bourbon\b|\bbourbon\b.*\bwheated?\b/i.test(text)) return "Wheated Bourbon";
  if (/\bwheat\s+whisk(?:e)?y\b/i.test(text)) return "Wheat Whiskey";
  if (/\bcanadian\s+whisk(?:e)?y\b|\bcanadian\b.*\bwhisk(?:e)?y\b|\bfound\s+north\b/i.test(text)) return "Canadian Whisky";
  if (/\bamerican\s+single\s+malt\b/i.test(text)) return "American Single Malt";
  if (/\bscotch\b/i.test(text)) return "Scotch Whisky";
  if (/\birish\s+whisk(?:e)?y\b/i.test(text)) return "Irish Whiskey";
  if (/\bjapanese\s+whisk(?:e)?y\b|\b(akashi|akkeshi|yamazaki|hakushu|hibiki|chichibu|nikka)\b/i.test(text)) return "Japanese Whisky";
  if (/\bsingle\s+malt\b/i.test(text)) return "Single Malt / World Whisky";
  if (/\bamerican\s+whisk(?:e)?y\b|\blight\s+whisk(?:e)?y\b|\bcorn\s+whisk(?:e)?y\b/i.test(text)) return "American Whiskey";
  if (/\bblended\s+whisk(?:e)?y\b|\bblended\s+whisky\b/i.test(text)) return "Blended Whiskey";
  if (/\bbottled?\s+in\s+bond\b|\bbib\b/i.test(text)) return "Bottled in Bond Bourbon";
  if (/\bbourbon\b/i.test(text)) return "Bourbon";
  if (/\bwhisk(?:e)?y\b|\bwhisky\b/i.test(text)) return "Whiskey";
  return "Connecticut liquor brand registration";
}

function isSeriousWhiskeyProduct(text) {
  return /\b(whisk(?:e)?y|whisky|bourbon|tennessee)\b/i.test(text) || isSeriousRyeWhiskey(text);
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
  return /\b(jack daniel'?s|jack daniel|george dickel|uncle nearest|nearest green|tennessee whiskey)\b/.test(clean);
}

function parseWholesalers(value) {
  return normalizeWhitespace(value)
    .split(/\s*,\s*/)
    .map((entry) => {
      const match = entry.match(/^(.*?)\s*\(([^)]+)\)$/);
      return match ? { name: titleCase(match[1]), credential: normalizeWhitespace(match[2]) } : { name: titleCase(entry), credential: "" };
    })
    .filter((entry) => entry.name || entry.credential);
}

function cleanProductName(value) {
  return normalizeWhitespace(value)
    .replace(/[ÃƒÂ¢Ã¢â€šÂ¬Ã‹Å“ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢]/g, "'")
    .replace(/[ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÂ¢Ã¢â€šÂ¬Ã‚Â]/g, "\"")
    .trim();
}

function titleCase(value) {
  const keepUpper = new Set(["BBN", "BIB", "BTL", "CT", "DBA", "JDSBBP", "LLC", "MSW", "OESF", "OESK", "OESO", "OESQ", "OESV", "OBSF", "OBSK", "OBSO", "OBSQ", "OBSV", "PX", "SB", "TN", "USA", "XO"]);
  return cleanProductName(value).toLowerCase().replace(/\b([a-z0-9][a-z0-9']*)\b/g, (token) => {
    const upper = token.toUpperCase();
    if (keepUpper.has(upper)) return upper;
    if (/^\d+yo$|^\d+yr$|^\d+p$|^\d+pf$|^\d+xo$/i.test(token)) return upper;
    if (["and", "by", "for", "in", "of", "on", "the", "to", "with"].includes(token)) return token;
    return token.charAt(0).toUpperCase() + token.slice(1);
  });
}

function normalizeDate(value) {
  const clean = normalizeWhitespace(value);
  const match = clean.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return [match[1], match[2], match[3]].join("-");
  return clean;
}

function parseProofFromName(value) {
  const match = cleanProductName(value).match(/\b(\d+(?:\.\d+)?)\s*(?:P|PF|PROOF)\b/i);
  if (!match) return null;
  const proof = Number(match[1]);
  return Number.isFinite(proof) && proof > 0 && proof <= 200 ? proof : null;
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

function normalizeConnecticutBottle(record) {
  const fields = [
    "ctRegistrationNumber",
    "brandName",
    "status",
    "effectiveDate",
    "expirationDate",
    "outOfStateShipper",
    "supervisorCredential",
    "wholesalers"
  ];

  return {
    id: slugify([record.name, record.ctRegistrationNumber].filter(Boolean).join(" ")),
    identityKey: ["connecticut-liquor-brands", record.ctRegistrationNumber].join("|"),
    name: record.name,
    producer: record.outOfStateShipper || "",
    supplier: record.outOfStateShipper || "",
    category: record.category,
    bottleKind: inferBottleKind({ name: record.name, category: record.category }),
    proof: record.proof,
    age: record.age,
    ageYears: record.ageYears,
    size: null,
    aliases: unique([record.brandName, record.name, record.ctRegistrationNumber]),
    sourceRefs: [
      {
        sourceId: SOURCE.id,
        sourceRecordId: record.sourceRecordId,
        sourceUrl: SOURCE.url,
        retrievedAt: record.retrievedAt,
        fields
      }
    ],
    prices: [],
    labelApprovals: [
      {
        ctRegistrationNumber: record.ctRegistrationNumber,
        brandName: record.brandName,
        status: record.status,
        effectiveDate: record.effectiveDate,
        expirationDate: record.expirationDate,
        outOfStateShipper: record.outOfStateShipper,
        supervisorCredential: record.supervisorCredential,
        wholesalers: record.wholesalers
      }
    ]
  };
}

function buildImportPayload(rows, retrievedAt, rawRecordCount, sourceFiles = []) {
  const bottles = mergeCatalogRecords(rows.map(normalizeConnecticutBottle));
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
  if (!inputFiles.length) throw new Error("Provide --input JSON files or --input-dir data/raw/connecticut-liquor-brands.");

  const retrievedAt = new Date().toISOString();
  const { parsedRows, rows } = parseConnecticutFiles(inputFiles, {
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
  normalizeConnecticutRow,
  parseConnecticutFiles,
  parseConnecticutJson,
  parseWholesalers
};
