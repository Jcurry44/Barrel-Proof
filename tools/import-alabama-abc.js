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
  id: "alabama_abc_quarterly_price_list",
  name: "Alabama ABC Quarterly Price List",
  url: "https://alabcboard.gov/product-management/QPL",
  dataUrl: "https://alabcboard.gov/sites/default/files/inline-files/January%202026%20Alabama%20Select%20Spirits%20Pricelist.xlsx",
  region: "AL",
  sourceType: "control_state_catalog"
};

const SHEETS = [
  { sheetName: "Jan 2026 New Products", sheetPath: "xl/worksheets/sheet1.xml", defaultCategory: "New Products" },
  { sheetName: "Luxury", sheetPath: "xl/worksheets/sheet2.xml", defaultCategory: "Luxury Products" },
  { sheetName: "Allocated Items", sheetPath: "xl/worksheets/sheet3.xml", defaultCategory: "Allocated Products" },
  { sheetName: "LTO", sheetPath: "xl/worksheets/sheet4.xml", defaultCategory: "Limited Time Offers" },
  { sheetName: "Retail", sheetPath: "xl/worksheets/sheet5.xml", defaultCategory: "Retail Listed Items" },
  { sheetName: "Wholesale Stocked", sheetPath: "xl/worksheets/sheet6.xml", defaultCategory: "Wholesale Stocked" },
  { sheetName: "Wholesale Bottle", sheetPath: "xl/worksheets/sheet7.xml", defaultCategory: "Wholesale Bottle" },
  { sheetName: "Wholesale Non-Stocked", sheetPath: "xl/worksheets/sheet8.xml", defaultCategory: "Wholesale Non-Stocked" },
  { sheetName: "Closeouts", sheetPath: "xl/worksheets/sheet9.xml", defaultCategory: "Closeout Items" }
];

const BOURBON_RESCUE_PATTERNS = [
  /\b1792\b/i,
  /\bancient age\b/i,
  /\bangel'?s envy\b/i,
  /\bbasil hayden\b/i,
  /\bbenchmark\b/i,
  /\bbuffalo trace\b/i,
  /\be\.?h\.? taylor\b/i,
  /\beagle rare\b/i,
  /\belijah craig\b/i,
  /\bevan williams\b/i,
  /\bezra brooks\b/i,
  /\bfour roses\b/i,
  /\bgarrison brothers\b/i,
  /\bheaven hill\b/i,
  /\bjack daniel/i,
  /\bjim beam\b/i,
  /\bknob creek\b/i,
  /\bmaker'?s mark\b/i,
  /\bold ezra\b/i,
  /\bold forester\b/i,
  /\brebel\b/i,
  /\bremus\b/i,
  /\brussell'?s\b/i,
  /\bstagg\b/i,
  /\bweller\b/i,
  /\bwidow jane\b/i,
  /\bwoodford\b/i
];

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

function parseAlabamaAbcXlsx(buffer, options = {}) {
  return SHEETS.flatMap((sheet) => {
    const rows = readXlsxRows(buffer, sheet.sheetPath);
    return parseAlabamaRows(rows, sheet, options);
  });
}

function parseAlabamaRows(rows, sheet, options = {}) {
  const retrievedAt = options.retrievedAt || new Date().toISOString();
  let sectionCategory = sheet.defaultCategory;
  const records = [];

  for (const row of rows || []) {
    const firstCell = normalizeWhitespace(row[0]);
    const secondCell = normalizeWhitespace(row[1]);

    if (isSectionHeader(firstCell, secondCell)) {
      sectionCategory = titleCaseProductName(firstCell);
      continue;
    }

    if (!isProductCode(firstCell) || !secondCell) continue;

    const record = normalizeAlabamaRow(row, {
      sheet,
      sectionCategory,
      retrievedAt
    });
    if (record && includeRow(record, options.mode || "serious")) records.push(record);
  }

  return records;
}

function normalizeAlabamaRow(row, options = {}) {
  const productCode = normalizeWhitespace(row[0]);
  const rawName = normalizeWhitespace(row[1]);
  if (!productCode || !rawName) return null;

  const details = parseProductDetails(rawName);
  const isCloseout = options.sheet.sheetName === "Closeouts";

  return {
    sourceId: SOURCE.id,
    sourceRecordId: [options.sheet.sheetName, productCode].join(":"),
    productCode,
    name: details.name,
    rawName,
    sourceCategory: options.sectionCategory || options.sheet.defaultCategory,
    category: inferAlabamaCategory(options.sectionCategory || options.sheet.defaultCategory, rawName),
    sheetName: options.sheet.sheetName,
    pack: parseNumber(row[2]),
    bottlePrice: isCloseout ? parseCurrency(row[4]) : parseCurrency(row[3]),
    casePrice: isCloseout ? null : parseCurrency(row[4]),
    originalBottlePrice: isCloseout ? parseCurrency(row[3]) : null,
    discountPercent: isCloseout ? parseNumber(row[5]) : null,
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

  const text = [
    row.rawName,
    row.name,
    row.category,
    row.sheetName
  ].join(" ").toLowerCase();

  if (mode === "whiskey") {
    return !looksLikeNonSeriousWhiskeyProduct(text) &&
      /\b(whiskey|whisky|bourbon|rye|scotch|canadian|irish|japanese|single malt|tenn(?:essee)?|brbn|bbn)\b/i.test(text);
  }

  if (mode === "serious") {
    if (isDisallowedSourceCategory(row.sourceCategory)) return false;
    if (looksLikeNonSeriousWhiskeyProduct(text)) return false;
    if (isSeriousSourceCategory(row.sourceCategory)) return true;
    return hasSeriousWhiskeySignal(text) || BOURBON_RESCUE_PATTERNS.some((pattern) => pattern.test(text));
  }

  if (looksLikeNonBourbonProduct(text)) return false;
  if (/\b(bourbon|tenn(?:essee)?|brbn|bbn)\b/i.test(text)) return true;
  if (/\b(b\.?i\.?b\.?|bib|bottled?\s+in\s+bond)\b/i.test(text)) return true;
  if (/\b(jack daniel|george dickel)\b/i.test(text)) return true;

  const isAmericanWhiskeyArea =
    row.category.toLowerCase().includes("american whiskey") ||
    row.sheetName.toLowerCase().includes("allocated");
  return isAmericanWhiskeyArea && BOURBON_RESCUE_PATTERNS.some((pattern) => pattern.test(text));
}

function looksLikeNonBourbonProduct(text) {
  if (/\b(bourbon|brbn|bbn)\b/i.test(text)) {
    return [
      "bourbon cream",
      "cream liqueur",
      "cocktail",
      "honey liqueur",
      "liqueur",
      "rtd",
      "scotch",
      "bourbon barrel wine",
      "bourbon barrel aged wine"
    ].some((phrase) => text.includes(phrase));
  }

  return [
    "cognac",
    "cocktail",
    "liqueur",
    "mezcal",
    "rtd",
    "rum",
    "scotch",
    "tequila",
    "vodka"
  ].some((phrase) => text.includes(phrase));
}

function isSeriousSourceCategory(category) {
  const clean = normalizeWhitespace(category).toLowerCase();
  return [
    "american whiskey",
    "canadian whiskey",
    "irish whiskey",
    "japanese whiskey",
    "rye whiskey",
    "scotch whiskey",
    "scotch whisky",
    "whiskey-irish"
  ].some((phrase) => clean.includes(phrase));
}

function isDisallowedSourceCategory(category) {
  const clean = normalizeWhitespace(category).toLowerCase();
  return /^(cocktails|cordials|miscellaneous|mixers|moonshine)$/.test(clean);
}

function hasSeriousWhiskeySignal(text) {
  return /\b(american\s+single\s+malt|bourbon|brbn|bbn|b\.?i\.?b\.?|bib|bottled?\s+in\s+bond|canadian|irish|japanese|rye|scotch|single\s+malt|sour mash|tenn(?:essee)?|whiskey|whisky)\b/i.test(text);
}

function looksLikeNonSeriousWhiskeyProduct(text) {
  const clean = normalizeWhitespace(text).toLowerCase();
  const isHoneyCask = /\bhoney\s+(?:barrels?|casks?)\b|\b(?:aged|finished)\s+in\s+honey\s+barrels?\b/i.test(clean);
  const isMapleCask = /\bmaple\s+(?:syrup\s+)?(?:barrels?|casks?)\b|\b(?:aged|finished)\s+in\s+maple\s+(?:syrup\s+)?barrels?\b/i.test(clean);

  if (/\bhoney\b/i.test(clean) && !isHoneyCask && !/\bhoneydew\b/i.test(clean)) return true;
  if (/\bmaple\b/i.test(clean) && !isMapleCask && !/\bmaplewood\b/i.test(clean)) return true;
  if (/\b(corazon|tequila|mezcal|anejo|añejo|reposado|blanco|rum|vodka|gin|cognac|brandy)\b/i.test(clean)) return true;

  return [
    /\bapple\b/,
    /\bbanana\b/,
    /\bblackberry\b/,
    /\bblackcherry\b/,
    /\bblueberry\b/,
    /\bbourbon cream\b/,
    /\bbutterscotch\b/,
    /\bcaramel\b/,
    /\bcherry\b/,
    /\bchocolate\b/,
    /\bcinnamon\b/,
    /\bcocktail\b/,
    /\bcoffee\b/,
    /\bcream\b/,
    /\bflavo(?:u)?red\b/,
    /\bflavors?\b/,
    /\bginger\b/,
    /\bglass(?:es)?\b/,
    /\bgift set\b/,
    /\bice mold\b/,
    /\blemonade\b/,
    /\bliqueur\b/,
    /\bmango\b/,
    /\bmezcal\b/,
    /\bmoonshine\b/,
    /\borange\b/,
    /\bpeach\b/,
    /\bpeanut\b/,
    /\bpineapple\b/,
    /\bpack\b/,
    /\bready\s*to\s*(?:pour|serve|drink)\b/,
    /\brock\s*&\s*rye\b/,
    /\brock and rye\b/,
    /\brtd\b/,
    /\bset\b/,
    /\bshot\b/,
    /\bsmoker\b/,
    /\bsouthern comfort\b/,
    /\brum\b/,
    /\btequila\b/,
    /\btumbler\b/,
    /\bvanilla\b/,
    /\bvariety\b/,
    /\bvodka\b/
  ].some((pattern) => pattern.test(clean));
}

function inferAlabamaCategory(sourceCategory, rawName) {
  const category = normalizeWhitespace(sourceCategory).toLowerCase();
  const text = normalizeWhitespace(rawName).toLowerCase();

  if (category.includes("scotch") || /\bscotch\b/i.test(text)) return "Scotch Whisky";
  if (category.includes("japanese") || /\b(japanese|hibiki|nikka|suntory|yamazaki)\b/i.test(text)) return "Japanese Whisky";
  if (/\b(kavalan|taiwan|world whis(?:key|ky))\b/i.test(text)) return "Single Malt / World Whisky";
  if (category.includes("canadian") || /\bcanadian\b|\bcrown royal\b|\blord calvert\b|\bpendleton\b/i.test(text)) return "Canadian Whisky";
  if (category.includes("irish") || /\birish\b|\bbushmills\b|\bjameson\b|\bredbreast\b|\btullamore\b|\bwriter'?s tears\b/i.test(text)) return "Irish Whiskey";
  if (/\brye\b/i.test(text) && !/\bhigh\s+rye\s+bourbon\b/i.test(text)) return "Rye Whiskey";
  if (/\b(american\s+single\s+malt|single\s+malt)\b/i.test(text)) return "American Single Malt";
  if (/\b(wheat whiskey|wheat barrel|bernheim)\b/i.test(text)) return "Wheat Whiskey";
  if (/\b(jack daniel|george dickel|uncle nearest|tenn(?:essee)?)\b/i.test(text)) return "Tennessee Whiskey";
  if (/\b(b\.?i\.?b\.?|bib|bottled?\s+in\s+bond)\b/i.test(text)) return "Bottled in Bond Bourbon";
  if (/\b(bourbon|brbn|bbn|bour\.|ksbw|weller|blanton'?s|eagle rare|buffalo trace|stagg)\b/i.test(text)) return "Bourbon";
  if (BOURBON_RESCUE_PATTERNS.some((pattern) => pattern.test(text))) return "Bourbon";
  if (/\bsour mash\b/i.test(text)) return "American Whiskey";
  if (category.includes("american whiskey") || /\bwhiskey|whisky\b/i.test(text)) return "American Whiskey";
  return titleCaseProductName(sourceCategory || "Whiskey");
}

function parseProductDetails(rawName) {
  const raw = normalizeWhitespace(rawName);
  const proof = parseProofFromName(raw);
  const age = parseAgeFromName(raw);
  const size = parseSizeFromName(raw);
  let name = raw
    .replace(sizePattern(), " ")
    .replace(proofPattern(), " ")
    .replace(agePattern(), " ")
    .replace(/\s+PET\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  name = name.replace(/\s*-\s*$/, "").trim();

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
  return /\b(\d+(?:\.\d+)?)\s*P\s*R\.?(?=\s|$)/gi;
}

function proofMatchPattern() {
  return /\b(\d+(?:\.\d+)?)\s*P\s*R\.?(?=\s|$)/i;
}

function agePattern() {
  return /\b(\d+(?:\.\d+)?)\s*(?:YRS?|YR\.?|YO)\.?(?=\s|$)/gi;
}

function ageMatchPattern() {
  return /\b(\d+(?:\.\d+)?)\s*(?:YRS?|YR\.?|YO)\.?(?=\s|$)/i;
}

function sizePattern() {
  return /\b(1\s*\.?\s*75\s*L|1\s+75\s*L|1\.75\s*L|750\s*ML|750ML|750\s*M|700\s*ML|700ML|700\s*M|375\s*ML|375ML|375\s*M|200\s*ML|200ML|200\s*M|100\s*ML|100ML|100\s*M|50\s*ML|50ML|50\s*M|LITER|1\s*L|1L)\b/gi;
}

function normalizeSizeLabel(value) {
  const clean = normalizeWhitespace(value).toUpperCase().replace(/\s+/g, "");
  if (clean === "LITER" || clean === "1L") return "1L";
  if (clean === "1.75L" || clean === "175L") return "1.75L";
  if (clean.endsWith("ML")) return Number(clean.replace(/\D/g, "")) + "ml";
  if (clean.endsWith("M")) return Number(clean.replace(/\D/g, "")) + "ml";
  return clean || null;
}

function isProductCode(value) {
  return /^[A-Z]\d{5,}/.test(normalizeWhitespace(value));
}

function isSectionHeader(firstCell, secondCell) {
  const clean = normalizeWhitespace(firstCell);
  if (!clean || secondCell || isProductCode(clean)) return false;
  if (/^(product|number|pack|bottle|case|price|size)$/i.test(clean)) return false;
  if (/products can be ordered/i.test(clean)) return false;
  if (/limited releases from the distillers/i.test(clean)) return false;
  return /[A-Za-z]/.test(clean);
}

function parseNumber(value) {
  const clean = normalizeWhitespace(value).replace(/,/g, "");
  if (!clean) return null;
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : null;
}

function titleCaseProductName(value) {
  const clean = normalizeWhitespace(value);
  if (!clean) return "";
  if (/[a-z]/.test(clean)) return clean;

  return clean.toLowerCase().replace(/\b([a-z0-9']+)\b/g, (word) => {
    if (/^\d+(yr|yo|pr|pf)$/.test(word)) return word.toUpperCase();
    if (/^\d+x[o0]$/.test(word)) return word.toUpperCase();
    if (word === "co") return "Co";
    if (["abc", "bbn", "bib", "brbn", "btb", "eh", "ml", "pga", "pvt", "rsv", "sgl", "us"].includes(word)) return word.toUpperCase();
    if (["and", "by", "in", "of", "on", "to"].includes(word)) return word.slice(0, 1).toUpperCase() + word.slice(1);
    if (word.length <= 2 && /^[a-z]+$/.test(word)) return word.toUpperCase();
    return word.slice(0, 1).toUpperCase() + word.slice(1);
  });
}

function normalizeAlabamaBottle(record) {
  const fields = [
    "productCode",
    "name",
    "rawName",
    "sourceCategory",
    "category",
    "sheetName",
    "pack",
    "bottlePrice",
    "casePrice",
    "originalBottlePrice",
    "proof",
    "age",
    "size"
  ];

  const normalized = {
    id: slugify([record.name, record.size, record.productCode, slugify(record.sheetName)].filter(Boolean).join(" ")),
    identityKey: makeAlabamaIdentityKey(record),
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
      casePrice: Number.isFinite(record.casePrice) ? record.casePrice : null,
      originalBottlePrice: Number.isFinite(record.originalBottlePrice) ? record.originalBottlePrice : null,
      discountPercent: Number.isFinite(record.discountPercent) ? record.discountPercent : null,
      size: record.size,
      listSection: record.sheetName,
      retrievedAt: record.retrievedAt
    });
  }

  return normalized;
}

function makeAlabamaIdentityKey(record) {
  return [
    slugify(record.name),
    slugify(record.size || ""),
    slugify(record.productCode),
    slugify(record.sheetName)
  ].filter(Boolean).join("|");
}

function buildImportPayload(rows, retrievedAt) {
  const bottles = mergeCatalogRecords(rows.map(normalizeAlabamaBottle));
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
  if (!args.input) throw new Error("Provide --input data/raw/alabama-abc/january-2026-alabama-select-spirits-pricelist.xlsx");

  const retrievedAt = new Date().toISOString();
  const rows = parseAlabamaAbcXlsx(fs.readFileSync(path.resolve(args.input)), {
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
  normalizeAlabamaBottle,
  normalizeAlabamaRow,
  normalizeSizeLabel,
  parseAgeFromName,
  parseAlabamaAbcXlsx,
  parseAlabamaRows,
  parseProductDetails,
  parseProofFromName,
  parseSizeFromName,
  titleCaseProductName
};
