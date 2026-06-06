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
const { readXlsxRows } = require("./xlsx.js");

const SOURCE = {
  id: "kentucky_abc_active_brands",
  name: "Kentucky ABC Active Brands",
  url: "https://ky.productregistrationonline.com/brands",
  region: "KY",
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
      if (entry.toLowerCase().endsWith(".xlsx") && entry.includes("summary-export")) {
        files.push(path.join(dir, entry));
      }
    }
  }
  return unique(files).map((file) => path.resolve(file));
}

function parseKentuckyAbcFiles(files, options = {}) {
  const parsedRows = files.flatMap((file) => parseKentuckyAbcXlsx(
    fs.readFileSync(file),
    {
      ...options,
      sourceFile: path.relative(process.cwd(), file)
    }
  ));

  const byRegistration = new Map();
  for (const row of parsedRows.filter((row) => includeRow(row, options.mode || "american"))) {
    const key = makeRegistrationKey(row);
    const existing = byRegistration.get(key);
    if (existing) {
      existing.distributors = mergeDistributors(existing.distributors, row.distributors);
    } else {
      byRegistration.set(key, row);
    }
  }

  return {
    parsedRows,
    rows: Array.from(byRegistration.values())
      .sort((a, b) => a.name.localeCompare(b.name) || String(a.approvalNumber).localeCompare(String(b.approvalNumber)))
  };
}

function parseKentuckyAbcXlsx(buffer, options = {}) {
  return parseKentuckyAbcRows(readXlsxRows(buffer, "xl/worksheets/sheet1.xml"), options);
}

function parseKentuckyAbcRows(rows, options = {}) {
  const retrievedAt = options.retrievedAt || new Date().toISOString();
  const headerIndex = rows.findIndex((row) => row.includes("Approval Number") && row.includes("Brand Description"));
  if (headerIndex < 0) return [];

  const headers = rows[headerIndex].map(normalizeWhitespace);
  const index = Object.fromEntries(headers.map((header, columnIndex) => [header, columnIndex]));

  return rows.slice(headerIndex + 1)
    .map((row) => normalizeKentuckyAbcRow(row, index, {
      retrievedAt,
      sourceFile: options.sourceFile || ""
    }))
    .filter(Boolean);
}

function normalizeKentuckyAbcRow(row, index, options = {}) {
  const value = (field) => index[field] >= 0 ? normalizeWhitespace(row[index[field]]) : "";
  const approvalNumber = value("Approval Number");
  const brandDescription = cleanProductName(value("Brand Description"));
  const labelDescription = cleanProductName(value("Label Description"));
  if (!approvalNumber || (!brandDescription && !labelDescription)) return null;

  const name = buildDisplayName(brandDescription, labelDescription);
  const abv = parseAbv(value("Percent Alcohol"));
  const unitSize = parseNumber(value("Unit Size"));
  const unitMeasure = value("Unit Measure").toUpperCase();
  const size = normalizeSize(unitSize, unitMeasure);
  const distributor = normalizeDistributor(value("Distributor Name"), value("Distributor Number"));
  const age = parseAgeFromName(name);

  return {
    sourceId: SOURCE.id,
    sourceRecordId: approvalNumber,
    approvalNumber,
    colaNumber: value("Tax Trade Bureau ID"),
    itemNumber: value("Item Number"),
    itemType: value("Item Type"),
    status: value("Status"),
    brandDescription,
    labelDescription,
    name,
    vintage: value("Vintage"),
    appellation: value("Appellation"),
    containerType: value("Container Type"),
    packageConfig: value("Pkg Configuration"),
    isVap: /^yes$/i.test(value("Value Added Pkg")),
    isCombo: /^yes$/i.test(value("Combo Pkg")),
    abv,
    proof: Number.isFinite(abv) ? roundTo(abv * 2, 2) : null,
    sellingUnits: parseNumber(value("Selling Units")),
    unitSize,
    unitMeasure,
    size,
    supplierNumber: value("Supplier Number"),
    supplierName: titleCase(value("Supplier Name")),
    distributors: distributor ? [distributor] : [],
    approvalDate: normalizeDate(value("Inception Date")),
    endDate: normalizeDate(value("End Date")),
    revisedDate: normalizeDate(value("Revised Date")),
    category: inferKentuckyCategory(name),
    age: age.label,
    ageYears: age.years,
    sourceFile: options.sourceFile || "",
    sourceUrl: SOURCE.url,
    region: SOURCE.region,
    retrievedAt: options.retrievedAt || new Date().toISOString()
  };
}

function includeRow(row, mode) {
  if (!row) return false;
  if (mode === "all") return true;
  if (row.status && row.status.toLowerCase() !== "active") return false;
  if (row.isVap || row.isCombo) return false;

  const text = [row.name, row.brandDescription, row.labelDescription].join(" ").toLowerCase();
  if (looksLikeNonWhiskeyProduct(text, row)) return false;
  if (mode === "whiskey") return isSeriousWhiskeyProduct(text);
  if (mode === "rye") return isSeriousRyeWhiskey(text);
  if (mode === "bourbon") return /\bbourbon\b/i.test(text) || isSeriousTennesseeWhiskey(text);
  return isSeriousWhiskeyProduct(text);
}

function looksLikeNonWhiskeyProduct(text, row = {}) {
  if (row.unitMeasure && !["", "ML", "LT"].includes(row.unitMeasure)) return true;
  if (/\b(can|keg)\b/i.test(row.containerType || "")) return true;
  if (Number.isFinite(row.abv) && row.abv > 0 && row.abv < 20) return true;

  const hasWhiskeyWord = /\b(whisk(?:e)?y|whisky|bourbon|tennessee)\b/.test(text);
  const isWhiskey = hasWhiskeyWord || isSeriousRyeWhiskey(text);
  const isBeerBarrelBourbon = /\bbeer\s+barrel\s+bourbon\b/.test(text);
  const isLegitCaskFinish = isWhiskey && /\b(?:rum|wine|port|cognac|armagnac|sherry|oloroso|madeira|marsala|px|cabernet)\s+cask\s+finish(?:ed)?\b/.test(text);
  const isHoneyBarrelFinish = /\bfinished\s+in\s+honey\s+barrels?\b|\bhoney\s+barrels?\b/.test(text);

  if (/\b(?:dry[-\s]?hopped|grissette?|malt\s+beverage|night\s+whale)\b/.test(text)) return true;
  if (/\bbarrel\s+aged\b/.test(text) && !hasWhiskeyWord) return true;
  if (/\bbourbon\s+barrel(?:s|-|\s)+(?:aged|stout|ale|cabernet|red|wine|porter|quad)\b/.test(text)) return true;
  if (/\b(cabernet|chardonnay|merlot|pinot|red blend|sauvignon|stout|ale|ales|porter|lager|ipa|cider|beer|brewing|brewery|wine|chateau|sangria)\b/.test(text) && !isBeerBarrelBourbon && !isLegitCaskFinish) return true;
  if (/\bhoney\b/.test(text) && !isHoneyBarrelFinish) return true;

  return [
    /\bapple\b/,
    /\bbanana\b/,
    /\bblackberry\b/,
    /\bbrandy\b/,
    /\bbrulee\b/,
    /\bcaramel\b/,
    /\bcherry\b/,
    /\bchocolate\b/,
    /\bcinnamon\b/,
    /\bcoconut\b/,
    /\bcocktails?\b/,
    /\bcoffee\b/,
    /\bcola\b/,
    /\bcoke\b/,
    /\bcream\b/,
    /\bcreme\b/,
    /\bfire\b/,
    /\bflavo(?:u)?red\b/,
    /\bgin\s+(?!cask\s+finish)/,
    /\bginger\b/,
    /\bginger\s+ale\b/,
    /\bgrape\b/,
    /\bhabanero\b/,
    /\bhighball\b/,
    /\bliqueur\b/,
    /\blemonade\b/,
    /\bmarion\s+berry\b/,
    /\bmaple\s+cream\b/,
    /\bmint\b/,
    /\bmoonshine\b/,
    /\bnatural\s+flavou?r\b/,
    /\bold\s+fashion(?:ed)?\b/,
    /\bpeach\b/,
    /\bpecan\s+pie\b/,
    /\bpeanut\s+butter\b/,
    /\bpineapple\b/,
    /\braspberry\b/,
    /\brtd\b/,
    /\bpunch\b/,
    /\bspiced\b/,
    /\btabasco\b/,
    /\btea\b/,
    /\btequila\s+(?!cask\s+finish)/,
    /\bbutterscotch\b/,
    /\btoffee\b/,
    /\bvodka\b/,
    /\bwhiskey\s+sour\b/,
    /\b(?:2pk|3pk|gift|pack|sampler)\b/
  ].some((pattern) => pattern.test(text));
}

function inferKentuckyCategory(name) {
  const text = cleanProductName(name).toLowerCase();
  if (/\bamerican\s+single\s+malt\b/i.test(text)) return "American Single Malt";
  if (isSeriousTennesseeWhiskey(text)) return "Tennessee Whiskey";
  if (isSeriousRyeWhiskey(text)) return "Rye Whiskey";
  if (/\bwheated?\b.*\bbourbon\b|\bbourbon\b.*\bwheated?\b/i.test(text)) return "Wheated Bourbon";
  if (/\bwheat\s+whisk(?:e)?y\b/i.test(text)) return "Wheat Whiskey";
  if (/\bcanadian\s+whisk(?:e)?y\b|\bcanadian\b.*\bwhisk(?:e)?y\b|\bfound\s+north\b/i.test(text)) return "Canadian Whisky";
  if (/\bscotch\b/i.test(text) && !/\bscotch\s+cask\b/i.test(text)) return "Scotch Whisky";
  if (/\b(?:speyside|islay|highland)\b/i.test(text) && !/\b(?:speyside|islay|highland|scotch)\s+cask\b/i.test(text)) return "Scotch Whisky";
  if (/\birish\s+whisk(?:e)?y\b/i.test(text)) return "Irish Whiskey";
  if (/\bjapanese\s+whisk(?:e)?y\b|\b(akashi|akkeshi|yamazaki|hakushu|hibiki|chichibu|nikka)\b/i.test(text)) return "Japanese Whisky";
  if (/\benglish\s+whisk(?:e)?y\b/i.test(text)) return "Single Malt / World Whisky";
  if (/\bsingle\s+malt\b/i.test(text)) return "Single Malt / World Whisky";
  if (/\bamerican\s+whisk(?:e)?y\b|\blight\s+whisk(?:e)?y\b|\bcorn\s+whisk(?:e)?y\b/i.test(text)) return "American Whiskey";
  if (/\bblended\s+whisk(?:e)?y\b|\bblended\s+whisky\b/i.test(text)) return "Blended Whiskey";
  if (/\bbottled?\s+in\s+bond\b|\bbib\b/i.test(text)) return "Bottled in Bond Bourbon";
  if (/\bbourbon\b/i.test(text)) return "Bourbon";
  if (/\bwhisk(?:e)?y\b|\bwhisky\b/i.test(text)) return "Whiskey";
  return "Kentucky ABC active brand registration";
}

function isSeriousWhiskeyProduct(text) {
  return /\b(whisk(?:e)?y|whisky|bourbon)\b/i.test(text) ||
    isSeriousTennesseeWhiskey(text) ||
    /\bfound\s+north\b/i.test(text) ||
    isSeriousRyeWhiskey(text);
}

function isSeriousRyeWhiskey(text) {
  const clean = normalizeWhitespace(text).toLowerCase();
  if (/\b(apple|bastard|brulee|butterscotch|chocolate|cider|cocktail|cola|coke|coconut|cream|dry[-\s]?hopped|grape|grissette?|honey|liqueur|marion\s+berry|mint|moonshine|night\s+whale|peach|pecan\s+pie|punch|raspberry|stout|tabasco|toffee|vodka)\b/.test(clean)) return false;
  return /\b(straight\s+rye|rye\s+whisk(?:e)?y|whisk(?:e)?y\s+rye|bottled?\s+in\s+bond\s+rye|bib\s+rye)\b/.test(clean) ||
    (/\brye\b/.test(clean) && !/\bbourbon\b/.test(clean));
}

function isSeriousTennesseeWhiskey(text) {
  const clean = normalizeWhitespace(text).toLowerCase();
  if (/\b(apple|cola|coke|fire|honey|moonshine|rye)\b/.test(clean)) return false;
  return /\b(jack daniel'?s|jack daniel|george dickel|uncle nearest|nearest green|tennessee whiskey)\b/.test(clean);
}

function buildDisplayName(brandDescription, labelDescription) {
  const brand = cleanProductName(brandDescription);
  const label = cleanProductName(labelDescription);
  const brandLower = brand.toLowerCase();
  const labelLower = label.toLowerCase();
  let value = brand || label;

  if (brand && label && brandLower !== labelLower) {
    if (brandLower.includes(labelLower)) value = brand;
    else if (labelLower.includes(brandLower)) value = label;
    else value = [brand, label].join(" ");
  }

  return titleCase(removeDuplicateLabelSuffix(removeDuplicateHalves(value), label));
}

function removeDuplicateHalves(value) {
  const clean = normalizeWhitespace(value);
  const words = clean.split(" ");
  if (words.length % 2 !== 0) return clean;
  const half = words.length / 2;
  const left = words.slice(0, half).join(" ").toLowerCase();
  const right = words.slice(half).join(" ").toLowerCase();
  return left === right ? words.slice(0, half).join(" ") : clean;
}

function removeDuplicateLabelSuffix(value, labelDescription) {
  const valueClean = normalizeWhitespace(value);
  const label = normalizeWhitespace(labelDescription);
  if (!valueClean || !label) return valueClean;

  const valueLower = valueClean.toLowerCase();
  const labelLower = label.toLowerCase();
  if (!valueLower.endsWith(" " + labelLower)) return valueClean;

  const prefix = valueClean.slice(0, valueClean.length - label.length).trim();
  if (prefix.toLowerCase().endsWith(labelLower)) return prefix;
  return valueClean;
}

function cleanProductName(value) {
  return normalizeWhitespace(value)
    .replace(/[ÃƒÂ¢Ã¢â€šÂ¬Ã‹Å“ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢]/g, "'")
    .replace(/[ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÂ¢Ã¢â€šÂ¬Ã‚Â]/g, "\"")
    .trim();
}

function titleCase(value) {
  const keepUpper = new Set(["ABC", "BIB", "DBA", "JDSBBP", "KBS", "LLC", "OESF", "OESK", "OESO", "OESQ", "OESV", "OBSF", "OBSK", "OBSO", "OBSQ", "OBSV", "SB", "TN", "XO"]);
  return cleanProductName(value).toLowerCase().replace(/\b([a-z0-9][a-z0-9']*)\b/g, (token) => {
    const upper = token.toUpperCase();
    if (keepUpper.has(upper)) return upper;
    if (/^\d+yo$|^\d+yr$|^\d+yr-old$|^\d+xo$/i.test(token)) return upper;
    if (["and", "by", "for", "in", "of", "on", "the", "to"].includes(token)) return token;
    return token.charAt(0).toUpperCase() + token.slice(1);
  });
}

function normalizeDate(value) {
  const clean = normalizeWhitespace(value);
  const match = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return clean;
  return [match[3], match[1].padStart(2, "0"), match[2].padStart(2, "0")].join("-");
}

function parseAbv(value) {
  const parsed = Number(normalizeWhitespace(value).replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 100 ? parsed : null;
}

function parseNumber(value) {
  const clean = normalizeWhitespace(value).replace(/,/g, "");
  if (!clean) return null;
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSize(unitSize, unitMeasure) {
  if (!Number.isFinite(unitSize) || unitSize <= 0) return null;
  const measure = normalizeWhitespace(unitMeasure).toUpperCase();
  if (measure === "ML") {
    if (unitSize === 1000) return "1L";
    if (unitSize === 1750) return "1.75L";
    return unitSize + "ml";
  }
  if (measure === "LT") {
    if (unitSize > 1.75) return null;
    if (unitSize === 1) return "1L";
    if (unitSize === 1.75) return "1.75L";
    return unitSize + "L";
  }
  return null;
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

function normalizeDistributor(name, permitNumber) {
  const cleanName = titleCase(name);
  const cleanPermit = normalizeWhitespace(permitNumber);
  if (!cleanName && !cleanPermit) return null;
  return {
    name: cleanName,
    permitNumber: cleanPermit
  };
}

function mergeDistributors(left = [], right = []) {
  const byKey = new Map();
  for (const distributor of [...left, ...right]) {
    const key = [distributor.name, distributor.permitNumber].join("|");
    if (!byKey.has(key)) byKey.set(key, distributor);
  }
  return Array.from(byKey.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function makeRegistrationKey(row) {
  return [
    row.approvalNumber,
    row.colaNumber,
    row.name,
    row.proof || "",
    row.size || ""
  ].map((value) => normalizeWhitespace(value)).join("|");
}

function roundTo(value, places) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function normalizeKentuckyAbcBottle(record) {
  const fields = [
    "approvalNumber",
    "colaNumber",
    "status",
    "brandDescription",
    "labelDescription",
    "abv",
    "proof",
    "size",
    "supplierName",
    "supplierNumber",
    "distributors",
    "approvalDate"
  ];

  return {
    id: slugify([record.name, record.approvalNumber].filter(Boolean).join(" ")),
    identityKey: ["kentucky-abc", record.approvalNumber, record.colaNumber, record.size || "", record.proof || ""].filter(Boolean).join("|"),
    name: record.name,
    producer: record.supplierName || "",
    supplier: record.supplierName || "",
    category: record.category,
    bottleKind: inferBottleKind({ name: record.name, category: record.category }),
    proof: record.proof,
    age: record.age,
    ageYears: record.ageYears,
    size: record.size,
    aliases: unique([record.name, record.brandDescription, record.labelDescription, record.approvalNumber, record.colaNumber]),
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
        kentuckyApprovalNumber: record.approvalNumber,
        colaNumber: record.colaNumber,
        status: record.status,
        brandDescription: record.brandDescription,
        labelDescription: record.labelDescription,
        approvalDate: record.approvalDate,
        endDate: record.endDate,
        revisedDate: record.revisedDate,
        abv: record.abv,
        proof: record.proof,
        supplierNumber: record.supplierNumber,
        supplierName: record.supplierName,
        distributors: record.distributors
      }
    ]
  };
}

function buildImportPayload(rows, retrievedAt, rawRecordCount, sourceFiles = []) {
  const bottles = mergeCatalogRecords(rows.map(normalizeKentuckyAbcBottle));
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
  if (!inputFiles.length) throw new Error("Provide --input XLSX files or --input-dir data/raw/kentucky-abc.");

  const retrievedAt = new Date().toISOString();
  const { parsedRows, rows } = parseKentuckyAbcFiles(inputFiles, {
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
  buildDisplayName,
  buildImportPayload,
  includeRow,
  normalizeKentuckyAbcBottle,
  normalizeKentuckyAbcRow,
  normalizeSize,
  parseKentuckyAbcFiles,
  parseKentuckyAbcRows,
  parseKentuckyAbcXlsx
};
