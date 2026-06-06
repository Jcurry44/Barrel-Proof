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
  id: "montgomery_county_abs_price_book",
  name: "Montgomery County ABS Price Book",
  url: "https://www.montgomerycountymd.gov/ABS/Resources/Files/suppliers/pricebook/pricebook.pdf",
  region: "MD-Montgomery",
  sourceType: "county_control_price_book"
};

const KNOWN_SECTION_HEADINGS = new Set([
  "AMERICAN WHISKEY",
  "BLENDED WHISKEY",
  "BOTTLED IN BOND",
  "BOURBON",
  "CANADIAN WHISKEY",
  "FLAVORED WHISKEY",
  "SINGLE MALT SCOTCH",
  "STRAIGHT RYE WHISKEY",
  "TENNESSEE WHISKEY",
  "WHISKEY"
]);

function parseArgs(argv) {
  const args = {
    mode: "bourbon",
    input: "data/raw/montgomery-county-abs/text/pricebook.txt"
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input") args.input = argv[++i];
    if (arg === "--out") args.out = argv[++i];
    if (arg === "--mode") args.mode = argv[++i];
  }

  return args;
}

function parseMontgomeryText(text, options = {}) {
  const retrievedAt = options.retrievedAt || new Date().toISOString();
  const lines = String(text || "").split(/\r?\n/);
  const effective = inferEffectivePeriod(lines);
  const entries = [];
  let currentSection = "";
  let current = null;

  const flush = () => {
    if (!current) return;
    const parsed = parseEntry(current, {
      ...effective,
      retrievedAt,
      sourceFile: options.sourceFile || ""
    });
    if (parsed) entries.push(parsed);
    current = null;
  };

  for (const rawLine of lines) {
    const line = normalizeWhitespace(rawLine);
    if (!line || isHeaderLine(line)) continue;

    const newRecord = line.match(/^(\d{3,6})\s+([A-Z0-9.\/-]+)\s+(.+)$/i);
    if (newRecord) {
      flush();
      current = {
        productCode: newRecord[1],
        rawSize: newRecord[2],
        section: currentSection,
        lines: [newRecord[3]]
      };
      continue;
    }

    if (current && isSectionHeading(line) && hasTerminalFields(current.lines.join(" "))) {
      flush();
      currentSection = line;
      continue;
    }

    if (!current && isSectionHeading(line)) {
      currentSection = line;
      continue;
    }

    if (current) current.lines.push(line);
  }

  flush();

  return entries
    .filter((row) => includeRow(row, options.mode || "bourbon"))
    .sort((a, b) => a.name.localeCompare(b.name) || String(a.size).localeCompare(String(b.size)));
}

function parseEntry(entry, options = {}) {
  const joined = normalizeWhitespace(entry.lines.join(" "));
  const match = joined.match(/^(.*?)\s+([A-Z]{1,3})\s+(\d+)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+(.+?)\s+(LIQUOR|WINE|BEER|KEGS)\b(.*)$/i);
  if (!match) return null;

  const afterTerminalDescription = normalizeWhitespace(match[8] || "");
  const rawName = cleanProductName([match[1], afterTerminalDescription].filter(Boolean).join(" "));
  if (!rawName) return null;

  const age = parseAgeFromName(rawName);
  return {
    sourceId: SOURCE.id,
    sourceRecordId: makeSourceRecordId(entry.productCode, entry.rawSize, options.effectiveFrom, options.sourceFile),
    sourceFile: options.sourceFile || "",
    productCode: entry.productCode,
    rawSection: entry.section,
    name: cleanDisplayName(rawName),
    rawName,
    category: inferMontgomeryCategory(entry.section, rawName),
    size: normalizeSize(entry.rawSize),
    rawSize: entry.rawSize,
    tag: match[2].toUpperCase(),
    bottlesPerCase: parseNumber(match[3]),
    wholesaleCasePrice: parseNumber(match[4]),
    wholesaleBottlePrice: parseNumber(match[5]),
    supplier: normalizeWhitespace(match[6]),
    productType: match[7].toUpperCase(),
    proof: parseProofFromName(rawName),
    age: age.label,
    ageYears: age.years,
    effectiveFrom: options.effectiveFrom || "",
    effectiveTo: options.effectiveTo || "",
    sourceUrl: SOURCE.url,
    region: SOURCE.region,
    retrievedAt: options.retrievedAt || new Date().toISOString()
  };
}

function includeRow(row, mode) {
  if (!row) return false;
  if (mode === "all") return true;
  if (row.productType !== "LIQUOR") return false;

  const section = normalizeWhitespace(row.rawSection).toUpperCase();
  const text = [row.rawSection, row.rawName, row.name].join(" ").toLowerCase();
  if (looksLikeNonBourbonProduct(text)) return false;

  if (mode === "whiskey") return /whisk|bourbon|bourb/i.test(text) && !looksLikeNonWhiskeyProduct(text);
  if (section === "BOURBON") return true;
  if (isSeriousTennesseeWhiskey(text)) return true;
  return /\b(bourbon|bourb|ksbw|straight bourbon|straight bourb|bottled in bond|bib)\b/i.test(text);
}

function looksLikeNonBourbonProduct(text) {
  const isHighRyeBourbon = /\bhigh\s+rye\b/.test(text) && /\bbourb(?:on)?\b/.test(text);
  return [
    /\bapple\b/,
    /\bblackberry\b/,
    /\bcherry\b/,
    /\bcinnamon\b/,
    /\bcocktail\b/,
    /\bcola\b/,
    /\bcoke\b/,
    /\bcream\b/,
    /\bfire\b/,
    /\bflavo(?:u)?red\b/,
    /\bginger\s+ale\b/,
    /\bhoney\b/,
    /\bice\s+mold\b/,
    /\bjigger\b/,
    /\bliqueur\b/,
    /\blowball\s+tumbler\b/,
    /\bold\s+fashion(?:ed)?\b/,
    /\bmanhattan\b/,
    /\bpeach\b/,
    /\bpineapple\b/,
    /\bready\s*to\s*drink\b/,
    /\broot\s+beer\b/,
    /\brocks\s+glass\b/,
    /\brtd\b/,
    /\bscotch\b/,
    /\bsour\s+mix\b/,
    /\bsyrup\b/,
    /\bstraight\s+rye\b/,
    /\brye\b/,
    /\brye\s+whisk(?:e)?y\b/,
    /\bdark\s+rye\b/,
    /\bwhite\s+dog\b/,
    /\bmash\s*#?1\b/,
    /\b(?:2pk|3pk|gift|vaps?|kit)\b/,
    /w\/\s*(?:caps|cocktail|equity|glass|glasses|gls|ice|lowball|rocks|sour)\b/
  ].some((pattern) => pattern.test(text)) && !isHighRyeBourbon;
}

function looksLikeNonWhiskeyProduct(text) {
  return /\b(beer|brandy|cognac|cordial|gin|liqueur|rum|scotch|tequila|vodka|wine)\b/i.test(text);
}

function inferMontgomeryCategory(section, name) {
  const cleanSection = normalizeWhitespace(section);
  const text = cleanProductName(name).toLowerCase();
  if (isSeriousTennesseeWhiskey(text)) return "Tennessee Whiskey";
  if (cleanSection.toUpperCase() === "BOTTLED IN BOND" || /\bbottled?\s+in\s+bond\b|\bbib\b/i.test(text)) return "Bottled in Bond Bourbon";
  if (cleanSection.toUpperCase().includes("BOURB") || /\b(bourbon|bourb|ksbw)\b/i.test(text)) return "Bourbon";
  return cleanSection || "Montgomery County ABS price book";
}

function isSeriousTennesseeWhiskey(text) {
  const clean = normalizeWhitespace(text).toLowerCase();
  if (/\b(apple|cola|coke|fire|honey|rtd|rye|sour\s+mix)\b/.test(clean)) return false;
  return /\b(jack daniels black|jack daniels bonded|jack daniels single|george dickel|gentleman jack|uncle nearest)\b/.test(clean);
}

function isHeaderLine(line) {
  return [
    /^Alcohol Beverage Services$/i,
    /^PRICE BOOK$/i,
    /^PAGE\s+\d+$/i,
    /^Product Size Description Tag BPC Wholesale$/i,
    /^Case Price$/i,
    /^Wholesale$/i,
    /^Bottle Price$/i,
    /^Supplier Type RTD$/i
  ].some((pattern) => pattern.test(line));
}

function isSectionHeading(line) {
  return KNOWN_SECTION_HEADINGS.has(normalizeWhitespace(line).toUpperCase());
}

function hasTerminalFields(text) {
  return /\s[A-Z]{1,3}\s+\d+\s+[\d,]+\.\d{2}\s+[\d,]+\.\d{2}\s+.+?\s+(LIQUOR|WINE|BEER|KEGS)\b/i.test(text);
}

function inferEffectivePeriod(lines) {
  const found = lines.map((line) => normalizeWhitespace(line))
    .find((line) => /^EFFECTIVE FROM/i.test(line));
  const match = String(found || "").match(/EFFECTIVE FROM\s+(\d{1,2}\/\d{1,2}\/\d{2,4})\s+TO\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  if (!match) return { effectiveFrom: "", effectiveTo: "" };
  return {
    effectiveFrom: normalizeDate(match[1]),
    effectiveTo: normalizeDate(match[2])
  };
}

function makeSourceRecordId(productCode, size, effectiveFrom, sourceFile) {
  return [productCode, normalizeSize(size), effectiveFrom, path.basename(sourceFile || "")].filter(Boolean).join(":");
}

function cleanProductName(value) {
  return normalizeWhitespace(value)
    .replace(/[Ã¢â‚¬ËœÃ¢â‚¬â„¢]/g, "'")
    .replace(/[Ã¢â‚¬Å“Ã¢â‚¬Â]/g, "\"")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanDisplayName(value) {
  return titleCase(cleanProductName(value)
    .replace(/\s*-\s*(?:50|100|200|375|700|750)ML\b/ig, "")
    .replace(/\s*-\s*1(?:\.00)?L(?:TR)?\b/ig, "")
    .replace(/\s*-\s*1\.75L\b/ig, "")
    .replace(/\s+\d+(?:\.\d+)?\s*(?:PROOF|PRF|P)\b/ig, "")
    .replace(/\s+/g, " ")
    .trim());
}

function titleCase(value) {
  const keepUpper = new Set(["BIB", "KSBW", "KY", "MD", "SB", "XO"]);
  return cleanProductName(value).toLowerCase().replace(/\b([a-z0-9][a-z0-9']*)\b/g, (token) => {
    const upper = token.toUpperCase();
    if (keepUpper.has(upper)) return upper;
    if (/^\d+xo$/i.test(token)) return upper;
    return token.charAt(0).toUpperCase() + token.slice(1);
  });
}

function normalizeSize(value) {
  const clean = normalizeWhitespace(value).toUpperCase();
  if (!clean) return null;
  if (clean === "1000ML" || clean === "1.00L" || clean === "1LTR") return "1L";
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

function normalizeDate(value) {
  const match = normalizeWhitespace(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!match) return normalizeWhitespace(value);
  const year = match[3].length === 2 ? "20" + match[3] : match[3];
  return [year, match[1].padStart(2, "0"), match[2].padStart(2, "0")].join("-");
}

function parseNumber(value) {
  const clean = normalizeWhitespace(value).replace(/,/g, "");
  if (!clean) return null;
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseProofFromName(value) {
  const match = cleanProductName(value).match(/\b(\d+(?:\.\d+)?)\s*(?:PROOF|PRF|P)\b/i);
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

function normalizeMontgomeryBottle(record) {
  const fields = [
    "productCode",
    "rawSection",
    "name",
    "rawName",
    "size",
    "tag",
    "bottlesPerCase",
    "wholesaleCasePrice",
    "wholesaleBottlePrice",
    "supplier",
    "effectiveFrom",
    "effectiveTo",
    "proof",
    "age"
  ];

  return {
    id: slugify([record.name, record.size, record.productCode].filter(Boolean).join(" ")),
    identityKey: makeMontgomeryIdentityKey(record),
    name: record.name,
    producer: "",
    supplier: record.supplier,
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
        sourceUrl: record.sourceUrl,
        retrievedAt: record.retrievedAt,
        fields
      }
    ],
    prices: Number.isFinite(record.wholesaleBottlePrice) ? [
      {
        sourceId: SOURCE.id,
        region: SOURCE.region,
        retailPrice: record.wholesaleBottlePrice,
        wholesaleBottlePrice: record.wholesaleBottlePrice,
        wholesaleCasePrice: record.wholesaleCasePrice,
        bottlesPerCase: record.bottlesPerCase,
        tag: record.tag,
        effectiveFrom: record.effectiveFrom,
        effectiveTo: record.effectiveTo,
        size: record.size,
        retrievedAt: record.retrievedAt
      }
    ] : []
  };
}

function makeMontgomeryIdentityKey(record) {
  return [slugify(record.name), slugify(record.size || ""), slugify(record.productCode)].filter(Boolean).join("|");
}

function buildImportPayload(rows, retrievedAt, rawRecordCount, sourceFiles = []) {
  const bottles = mergeCatalogRecords(rows.map(normalizeMontgomeryBottle));
  return {
    schemaVersion: 1,
    source: SOURCE,
    retrievedAt,
    sourceFiles,
    rawRecordCount,
    bottleCount: bottles.length,
    records: rows,
    bottles
  };
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.input) throw new Error("Provide --input data/raw/montgomery-county-abs/text/pricebook.txt");

  const inputPath = path.resolve(args.input);
  const retrievedAt = new Date().toISOString();
  const parsedRows = parseMontgomeryText(fs.readFileSync(inputPath, "utf8"), {
    mode: args.mode,
    retrievedAt,
    sourceFile: path.relative(process.cwd(), inputPath)
  });
  const payload = buildImportPayload(parsedRows, retrievedAt, parsedRows.length, [path.relative(process.cwd(), inputPath)]);
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
  normalizeDate,
  normalizeSize,
  parseEntry,
  parseMontgomeryText
};
