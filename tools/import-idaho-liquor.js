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
  id: "idaho_liquor_price_book",
  name: "Idaho State Liquor Division Monthly Price Book",
  url: "https://liquor.idaho.gov/wp-content/uploads/2026/05/0626-Price-Book-Category.pdf",
  region: "ID",
  sourceType: "control_state_catalog"
};

const SERIOUS_CATEGORY_NAMES = new Set([
  "AMERICAN BLENDED WHISKEY",
  "AMERICAN MALT WHISKEY",
  "BOTTLED IN BOND",
  "BOURBON",
  "BOURBON, BLENDED",
  "CANADIAN",
  "CORN WHISKEY",
  "IMPORTED WHISKEY",
  "IRISH",
  "RYE WHISKEY",
  "SCOTCH, BLENDED",
  "SCOTCH, SINGLE MALT HIGHLANDS",
  "SCOTCH, SINGLE MALT ISLANDS",
  "SCOTCH, SINGLE MALT LOWLANDS",
  "SCOTCH, SINGLE MALT SPEYSIDE",
  "TENNESSEE WHISKEY"
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

function parseIdahoPriceBookText(text, options = {}) {
  const retrievedAt = options.retrievedAt || new Date().toISOString();
  const effectivePeriod = parseEffectivePeriod(text);
  const rows = [];
  let sourceCategory = null;

  for (const line of String(text || "").split(/\r?\n/)) {
    const categoryMatch = line.match(/^Category:\s+(\d+)\s+(.+)$/i);
    if (categoryMatch) {
      sourceCategory = {
        code: categoryMatch[1],
        name: normalizeWhitespace(categoryMatch[2])
      };
      continue;
    }

    const row = normalizeIdahoRow(line, { retrievedAt, effectivePeriod, sourceCategory });
    if (row && includeRow(row, options.mode || "serious")) rows.push(row);
  }

  return rows;
}

function parseEffectivePeriod(text) {
  const match = String(text || "").match(/Effective\s+(\d{2}\/\d{2}\/\d{2})\s+through\s+(\d{2}\/\d{2}\/\d{2})/i);
  if (!match) return { effectiveFrom: "", effectiveThrough: "" };
  return {
    effectiveFrom: match[1],
    effectiveThrough: match[2]
  };
}

function normalizeIdahoRow(line, options = {}) {
  const clean = normalizeWhitespace(line);
  if (!/^\d+\s+/.test(clean)) return null;
  if (options.sourceCategory) {
    const categoryRow = normalizeIdahoCategoryRow(clean, options);
    if (categoryRow) return categoryRow;
  }

  const tokens = clean.split(/\s+/);
  const idahoCode = tokens.shift();
  const sizeToken = tokens.pop();
  const licenseeToken = tokens.pop();
  const retailToken = tokens.pop();
  if (!idahoCode || !sizeToken || !licenseeToken || !retailToken) return null;

  const numericTail = [];
  while (tokens.length && /^\d+$/.test(tokens[tokens.length - 1])) {
    numericTail.unshift(tokens.pop());
  }

  const rawName = tokens.join(" ");
  const parsedLicensee = parseLicenseePriceAndChange(licenseeToken);
  const sizeInfo = parseRepSizeToken(sizeToken);

  if (!rawName || !Number.isFinite(parseCurrency(retailToken)) || !sizeInfo.size) return null;

  return {
    sourceId: SOURCE.id,
    sourceRecordId: idahoCode,
    idahoCode,
    name: titleCaseProductName(rawName),
    rawName,
    sourceCategoryCode: "",
    sourceCategory: "",
    category: inferIdahoCategory(rawName, ""),
    pack: parseNumber(numericTail[0]),
    intermediateCode: numericTail.slice(1).join(" "),
    retailPrice: parseCurrency(retailToken),
    licenseePrice: parsedLicensee.licenseePrice,
    changeCode: parsedLicensee.changeCode,
    repCode: sizeInfo.repCode,
    size: sizeInfo.size,
    rawSizeToken: sizeToken,
    proof: null,
    age: parseAgeFromName(rawName).label,
    ageYears: parseAgeFromName(rawName).years,
    sourceUrl: SOURCE.url,
    region: SOURCE.region,
    retrievedAt: options.retrievedAt || new Date().toISOString(),
    effectiveFrom: options.effectivePeriod ? options.effectivePeriod.effectiveFrom : "",
    effectiveThrough: options.effectivePeriod ? options.effectivePeriod.effectiveThrough : ""
  };
}

function normalizeIdahoCategoryRow(clean, options = {}) {
  const tokens = clean.replace(/\s+\*{1,2}$/g, "").split(/\s+/);
  const idahoCode = tokens.shift();
  if (!idahoCode || tokens.length < 6) return null;

  const licenseeToken = tokens.pop();
  let packToken = tokens.pop();
  let retailToken = tokens.pop();

  const stuckRetailPack = packToken && packToken.match(/^(\d+(?:\.\d{2}))(\d{1,3})$/);
  if (stuckRetailPack) {
    retailToken = stuckRetailPack[1];
    packToken = stuckRetailPack[2];
  }

  const proofToken = tokens.pop();
  const sizeToken = tokens.pop();
  const rawName = tokens.join(" ");
  const size = normalizeCategorySize(sizeToken);
  const proof = parseNumber(proofToken);
  const retailPrice = parseCurrency(retailToken);
  const licenseePrice = parseCurrency(licenseeToken);
  if (!rawName || !size || !Number.isFinite(retailPrice)) return null;

  const age = parseAgeFromName(rawName);
  const sourceCategory = options.sourceCategory || {};
  return {
    sourceId: SOURCE.id,
    sourceRecordId: idahoCode,
    idahoCode,
    name: titleCaseProductName(rawName),
    rawName,
    sourceCategoryCode: sourceCategory.code || "",
    sourceCategory: sourceCategory.name || "",
    category: inferIdahoCategory(rawName, sourceCategory.name || ""),
    pack: parseNumber(packToken),
    intermediateCode: "",
    retailPrice,
    licenseePrice,
    changeCode: "",
    repCode: "",
    size,
    rawSizeToken: sizeToken,
    proof,
    age: age.label,
    ageYears: age.years,
    sourceUrl: SOURCE.url,
    region: SOURCE.region,
    retrievedAt: options.retrievedAt || new Date().toISOString(),
    effectiveFrom: options.effectivePeriod ? options.effectivePeriod.effectiveFrom : "",
    effectiveThrough: options.effectivePeriod ? options.effectivePeriod.effectiveThrough : ""
  };
}

function includeRow(row, mode) {
  if (mode === "all") return true;

  const sourceCategory = normalizeWhitespace(row.sourceCategory).toUpperCase();
  const text = [row.sourceCategory, row.rawName, row.name].join(" ").toLowerCase();
  if (mode === "whiskey" || mode === "serious") {
    if (looksLikeNonSeriousWhiskeyProduct(text)) return false;
    if (SERIOUS_CATEGORY_NAMES.has(sourceCategory)) return true;
    if (sourceCategory) return false;
    return hasWhiskeySignal(text);
  }

  return (row.category === "Bourbon" || row.category === "Bottled in Bond Bourbon") &&
    !looksLikeNonBourbonProduct(text);
}

function looksLikeNonBourbonProduct(text) {
  if (/\bhigh\s+rye\s+bourbon\b/.test(text)) return false;
  if (/\bw\/|\b(?:gift|glass|glasses|mug|multipack|water\s+bottle)\b/.test(text)) return true;
  if (/\b(?:apple|cherry|cinnamon|cocktail|fire|honey|peach|rye\s+bourbon)\b/.test(text)) return true;
  return [
    "bourbon barrel gin",
    "bourbon barreled gin",
    "bourbon cream",
    "bourbon liqueur",
    "cinnamon bourbon",
    "ex-bourbon",
    "gin bourbon barreled",
    "honey bourbon"
  ].some((phrase) => text.includes(phrase));
}

function looksLikeNonSeriousWhiskeyProduct(text) {
  const clean = normalizeWhitespace(text).toLowerCase();
  const isHoneyCask = /\bhoney\s+(?:barrels?|casks?)\b|\b(?:aged|finished)\s+in\s+honey\s+barrels?\b/i.test(clean);
  const isMapleCask = /\bmaple\s+(?:syrup\s+)?(?:barrels?|casks?)\b|\b(?:aged|finished)\s+in\s+maple\s+(?:syrup\s+)?barrels?\b/i.test(clean);

  if (/\bhoney\b/i.test(clean) && !isHoneyCask && !/\bhoneydew\b/i.test(clean)) return true;
  if (/\bmaple\b/i.test(clean) && !isMapleCask && !/\bmaplewood\b/i.test(clean)) return true;
  if (/\bw\//.test(clean) && !/\bfinished\s+w\//.test(clean)) return true;

  return [
    /\bapple\b/,
    /\bbanana\b/,
    /\bblackberry\b/,
    /\bbourbon cream\b/,
    /\bbrown sugar\b/,
    /\bbutterscotch\b/,
    /\bcherry\b/,
    /\bchocolate\b/,
    /\bcinnamon\b/,
    /\bcocktail\b/,
    /\bcoffee\b/,
    /\bcream\b/,
    /\bflavo(?:u)?red\b/,
    /\bgin\b/,
    /\bglass(?:es)?\b/,
    /\bhighball\b/,
    /\bliqueur\b/,
    /\bmoonshine\b/,
    /\bmultipack\b/,
    /\borange\b/,
    /\bpeach\b/,
    /\bpeanut\b/,
    /\bpecan\b/,
    /\bpregame bucket\b/,
    /\bready\s*to\s*drink\b/,
    /\brtd\b/,
    /\bsalted caramel\b/,
    /\bsalsa bowls?\b/,
    /\bshot\b/,
    /\bsouthern comfort\b/,
    /\btequila\b/,
    /\bvanilla\b/,
    /\bvodka\b/,
    /\bw\/\s*(?:2-?50ml|glass|glasses|highball|mug|wellie)\b/
  ].some((pattern) => pattern.test(clean));
}

function hasWhiskeySignal(text) {
  return /\b(bourbon|rye|scotch|whiskey|whisky|tennessee|canadian|irish|single malt|wheat|corn whiskey|bottled in bond|bib)\b/i.test(text);
}

function inferIdahoCategory(rawName, sourceCategory) {
  const category = normalizeWhitespace(sourceCategory).toUpperCase();
  const text = normalizeWhitespace(rawName).toLowerCase();

  if (category.includes("SCOTCH") || /\bscotch\b/i.test(text)) return "Scotch Whisky";
  if (category === "CANADIAN" || /\bcanadian\b|\bcrown royal\b|\bpendleton\b|\bmister sam\b/i.test(text)) return "Canadian Whisky";
  if (category === "IRISH" || /\birish\b|\bjameson\b|\bbushmills\b|\bredbreast\b|\btullamore\b/i.test(text)) return "Irish Whiskey";
  if (/\b(japanese|hibiki|nikka|suntory|toki|yamazaki)\b/i.test(text)) return "Japanese Whisky";
  if (category === "IMPORTED WHISKEY") return "Single Malt / World Whisky";
  if (category === "RYE WHISKEY" || (/\brye\b/i.test(text) && !/\bhigh\s+rye\s+bourbon\b/i.test(text))) return "Rye Whiskey";
  if (category === "AMERICAN MALT WHISKEY" || /\b(american single malt|single malt whiskey|single malt whisky|single malt)\b/i.test(text)) return "American Single Malt";
  if (/\b(wheat whiskey|wheat whis key|wheat\b.*\bwhis(?:key|ky))\b/i.test(text)) return "Wheat Whiskey";
  if (category === "CORN WHISKEY" || /\bcorn whiskey\b/i.test(text)) return "Corn Whiskey";
  if (category === "TENNESSEE WHISKEY" || /\b(jack daniel|george dickel|uncle nearest)\b/i.test(text)) return "Tennessee Whiskey";
  if (category === "BOTTLED IN BOND" || /\bbib\b|bottled in bond/i.test(text)) return "Bottled in Bond Bourbon";
  if (category === "BOURBON" || category === "BOURBON, BLENDED" || /\bbourbon\b/i.test(text)) return "Bourbon";
  if (category === "AMERICAN BLENDED WHISKEY") return "American Whiskey";
  return "American Whiskey";
}

function parseLicenseePriceAndChange(value) {
  const match = normalizeWhitespace(value).match(/^(\d+(?:\.\d+)?)([A-Z])?$/);
  return {
    licenseePrice: match ? parseCurrency(match[1]) : null,
    changeCode: match ? match[2] || "" : ""
  };
}

function normalizeCategorySize(value) {
  const amount = parseNumber(value);
  if (!Number.isFinite(amount)) return null;
  if (amount === 50 || amount === 100 || amount === 200 || amount === 300 || amount === 375 || amount === 600 || amount === 700 || amount === 750) {
    return amount + "ml";
  }
  if (amount === 1000) return "1L";
  if (amount === 1750) return "1.75L";
  return amount + "ml";
}

function parseRepSizeToken(value) {
  const token = normalizeWhitespace(value);
  const sizes = [
    ["1750", "1.75L"],
    ["1000", "1L"],
    ["750", "750ml"],
    ["700", "700ml"],
    ["375", "375ml"],
    ["200", "200ml"],
    ["100", "100ml"],
    ["50", "50ml"]
  ];

  for (const [suffix, label] of sizes) {
    const prefixLength = token.length - suffix.length;
    if (prefixLength >= 2 && token.endsWith(suffix)) {
      return {
        repCode: token.slice(0, prefixLength),
        size: label
      };
    }
  }

  return {
    repCode: token,
    size: null
  };
}

function parseNumber(value) {
  const parsed = Number(normalizeWhitespace(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function titleCaseProductName(value) {
  const clean = normalizeWhitespace(value);
  if (!clean) return "";
  if (/[a-z]/.test(clean)) return clean;

  return clean.toLowerCase().replace(/\b([a-z0-9']+)\b/g, (word) => {
    if (/^\d+(yr|yo|pr|pf)$/.test(word)) return word.toUpperCase();
    if (["bib", "btb", "psb", "rwr", "vap"].includes(word)) return word.toUpperCase();
    if (word === "co") return "Co";
    if (["and", "by", "in", "of", "on", "to"].includes(word)) return word.slice(0, 1).toUpperCase() + word.slice(1);
    if (word.length <= 2 && /^[a-z]+$/.test(word)) return word.toUpperCase();
    return word.slice(0, 1).toUpperCase() + word.slice(1);
  });
}

function parseAgeFromName(value) {
  const clean = normalizeWhitespace(value);
  const match = clean.match(/\b(\d+(?:\.\d+)?)\s*(?:YR|YRS|YEAR|YEARS|YO)\b/i);
  if (!match) return { label: "Unknown", years: null };
  const years = Number(match[1]);
  if (!Number.isFinite(years)) return { label: "Unknown", years: null };
  return {
    label: years + " year" + (years === 1 ? "" : "s"),
    years
  };
}

function normalizeIdahoBottle(record) {
  const fields = [
    "idahoCode",
    "name",
    "sourceCategoryCode",
    "sourceCategory",
    "pack",
    "proof",
    "retailPrice",
    "licenseePrice",
    "changeCode",
    "repCode",
    "size",
    "effectiveFrom",
    "effectiveThrough"
  ];

  const normalized = {
    id: slugify([record.name, record.size, record.idahoCode].filter(Boolean).join(" ")),
    identityKey: makeIdahoIdentityKey(record),
    name: record.name,
    producer: "",
    supplier: "",
    category: record.category,
    bottleKind: inferBottleKind({ name: record.name, category: record.category }),
    proof: record.proof,
    age: record.age,
    ageYears: record.ageYears,
    size: record.size,
    aliases: unique([record.name, record.rawName, record.idahoCode]),
    sourceRefs: [
      {
        sourceId: SOURCE.id,
        sourceRecordId: record.idahoCode,
        sourceUrl: SOURCE.url,
        retrievedAt: record.retrievedAt,
        fields
      }
    ],
    prices: []
  };

  if (Number.isFinite(record.retailPrice)) {
    normalized.prices.push({
      sourceId: SOURCE.id,
      region: SOURCE.region,
      retailPrice: record.retailPrice,
      licenseePrice: Number.isFinite(record.licenseePrice) ? record.licenseePrice : null,
      size: record.size,
      changeCode: record.changeCode,
      effectiveFrom: record.effectiveFrom,
      effectiveThrough: record.effectiveThrough,
      retrievedAt: record.retrievedAt
    });
  }

  return normalized;
}

function makeIdahoIdentityKey(record) {
  return [
    slugify(record.name),
    slugify(record.size || ""),
    slugify(record.idahoCode)
  ].filter(Boolean).join("|");
}

function buildImportPayload(rows, retrievedAt) {
  const bottles = mergeCatalogRecords(rows.map(normalizeIdahoBottle));
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
  if (!args.input) throw new Error("Provide --input data/raw/idaho-liquor/numpricebook-2025-09.txt");

  const retrievedAt = new Date().toISOString();
  const text = fs.readFileSync(path.resolve(args.input), "utf8");
  const rows = parseIdahoPriceBookText(text, { mode: args.mode, retrievedAt });
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
  normalizeIdahoBottle,
  normalizeIdahoRow,
  parseEffectivePeriod,
  parseIdahoPriceBookText,
  parseLicenseePriceAndChange,
  parseRepSizeToken,
  titleCaseProductName
};
