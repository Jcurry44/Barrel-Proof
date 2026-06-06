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
  id: "vermont_802_spirits_price_list",
  name: "Vermont 802Spirits Complete Price List",
  url: "https://www.802spirits.com/monthly-sales",
  dataUrl: "https://www.802spirits.com/sites/spirits/files/documents/2026MayCompleteList.pdf",
  region: "VT",
  sourceType: "control_state_catalog"
};

const SERIOUS_WHISKEY_CATEGORIES = new Set([
  "whiskey bourbon",
  "whiskey american",
  "whiskey scotch",
  "whiskey canadian",
  "whiskey rye",
  "whiskey irish",
  "whiskey other",
  "whiskey mini"
]);

function parseArgs(argv) {
  const args = {
    mode: "serious",
    input: "data/raw/vermont-802/text/2026-may-complete-list.txt"
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input") args.input = argv[++i];
    if (arg === "--out") args.out = argv[++i];
    if (arg === "--mode") args.mode = argv[++i];
  }

  return args;
}

function parseVermontPriceListText(text, options = {}) {
  const retrievedAt = options.retrievedAt || new Date().toISOString();
  const lines = String(text || "").split(/\r?\n/).map(normalizeWhitespace).filter(Boolean);
  const asOf = parseAsOfMonth(lines);
  const rows = [];
  let category = "";

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (isHeaderLine(line)) continue;

    if (!/^\d{6}$/.test(line)) {
      if (isCategoryLine(line)) category = line;
      continue;
    }

    const parsed = parseProductBlock(line, lines.slice(i + 1), {
      category,
      retrievedAt,
      asOf
    });
    if (!parsed) continue;

    rows.push(parsed.row);
    i += parsed.consumed;
  }

  return rows
    .filter((row) => includeRow(row, options.mode || "serious"))
    .sort((a, b) => a.name.localeCompare(b.name) || String(a.size).localeCompare(String(b.size)));
}

function parseProductBlock(code, rest, options = {}) {
  for (let i = 0; i < Math.min(rest.length - 5, 12); i += 1) {
    if (!isSize(rest[i])) continue;
    if (!isMoney(rest[i + 1]) || !isMoney(rest[i + 2]) || !isMoney(rest[i + 3])) continue;
    if (!isNumber(rest[i + 4])) continue;
    if (isHeaderLine(rest[i + 5]) || /^\d{6}$/.test(rest[i + 5])) continue;

    const rawName = cleanProductName(rest.slice(0, i).join(" "));
    if (!rawName) return null;

    const age = parseAgeFromName(rawName);
    return {
      consumed: i + 5,
      row: {
        sourceId: SOURCE.id,
        sourceRecordId: code,
        code,
        rawCategory: options.category || "",
        name: cleanDisplayName(rawName),
        rawName,
        category: inferVermontCategory(options.category || "", rawName),
        size: normalizeSize(rest[i]),
        rawSize: rest[i],
        regularPrice: parseCurrency(rest[i + 1]),
        salePrice: parseCurrency(rest[i + 2]),
        savings: parseCurrency(rest[i + 3]),
        price: parseCurrency(rest[i + 2]) || parseCurrency(rest[i + 1]),
        proof: parseNumber(rest[i + 4]),
        status: rest[i + 5],
        age: age.label,
        ageYears: age.years,
        asOf: options.asOf,
        sourceUrl: SOURCE.url,
        dataUrl: SOURCE.dataUrl,
        region: SOURCE.region,
        retrievedAt: options.retrievedAt || new Date().toISOString()
      }
    };
  }

  return null;
}

function includeRow(row, mode) {
  if (!row) return false;
  if (mode === "all") return true;

  const category = row.rawCategory.toLowerCase();
  const text = [row.rawCategory, row.rawName, row.name].join(" ").toLowerCase();
  if (looksLikeNonSeriousWhiskey(row, text)) return false;

  if (mode === "whiskey" || mode === "serious") return SERIOUS_WHISKEY_CATEGORIES.has(category);
  if (category === "whiskey bourbon") return true;
  if (isSeriousTennesseeWhiskey(text)) return true;
  return /\b(bourbon|ksbw|straight bourbon|bottled in bond|bib)\b/i.test(text);
}

function looksLikeNonSeriousWhiskey(row, text) {
  const isHighRyeBourbon = /\bhigh\s+rye\b/.test(text) && /\bbourbon\b/.test(text);
  const isHoneyCask = /\bhoney\s+(?:barrels?|casks?)\b|\b(?:aged|finished)\s+in\s+honey\s+barrels?\b/i.test(text);
  const isMapleCask = /\bmaple\s+(?:syrup\s+)?(?:barrels?|casks?)\b|\b(?:aged|finished)\s+in\s+maple\s+(?:syrup\s+)?barrels?\b/i.test(text);

  if (!SERIOUS_WHISKEY_CATEGORIES.has(row.rawCategory.toLowerCase())) return true;
  if (/party\s+bucket/i.test(row.rawCategory)) return true;
  if (Number.isFinite(row.proof) && row.proof > 0 && row.proof < 70) return true;
  if (/\bhoney\b/i.test(text) && !isHoneyCask && !/\bhoneydew\b/i.test(text)) return true;
  if (/\bmaple\b/i.test(text) && !isMapleCask && !/\bmaplewood\b/i.test(text)) return true;

  return [
    /\bapple\b/,
    /\bbanana\b/,
    /\bblackberry\b/,
    /\bbutterscotch\b/,
    /\bcandy\b/,
    /\bcaramel\b/,
    /\bcherry\b/,
    /\bcinnamon\b/,
    /\bcoconut\b/,
    /\bcocktail\b/,
    /\bcola\b/,
    /\bcoke\b/,
    /\bcoffee\b/,
    /\bcream\b/,
    /\bcreme\b/,
    /\bfireball\b/,
    /\bfire\b/,
    /\bflavo(?:u)?red\b/,
    /\bglasses?\b/,
    /\bliqueur\b/,
    /\bmocha\b/,
    /\bmoonshine\b/,
    /\bmoon\s*shine\b/,
    /\bnatural\s+flavou?rs?\b/,
    /\bpeach\b/,
    /\bpeanut\s+butter\b/,
    /\bpecan\b/,
    /\bpineapple\b/,
    /\bpumpkin\b/,
    /\brtd\b/,
    /\bsalted\b/,
    /\bsouthern\s+comfort\b/,
    /\bspiced\b/,
    /\bstrawberry\b/,
    /\btea\b/,
    /\bvanilla\b/,
    /\bwhite\s+dog\b/,
    /\bw\/(?:flask|glass(?:es)?|gl|gls|jigg|mug|pourer|rocks?)\b/,
    /\bw\/\s*(?:flask|glass(?:es)?|gl|gls|jigg|mug|pourer|rocks?)\b/,
    /\b(?:2pk|3pk|4pk|6pk|12pk|gift|vap)\w*\b/
  ].some((pattern) => pattern.test(text)) && !isHighRyeBourbon;
}

function inferVermontCategory(category, name) {
  const cleanCategory = normalizeWhitespace(category);
  const text = cleanProductName(name).toLowerCase();
  const sourceCategory = cleanCategory.toLowerCase();

  if (sourceCategory === "whiskey scotch" || /\bscotch\b/i.test(text)) return "Scotch Whisky";
  if (sourceCategory === "whiskey irish" || /\birish\b/i.test(text)) return "Irish Whiskey";
  if (/\bjapanese\b|\b(akashi|akkeshi|fuji|fuyu|hatozaki|hibiki|kaiyo|nikka|suntory|tenjaku|tottori|yamazaki)\b/i.test(text)) return "Japanese Whisky";
  if (/\b(amrut|kavalan|paul\s+john|starward|mackmyra|penderyn|abasolo|english\s+whisk(?:e)?y)\b/i.test(text)) return "Single Malt / World Whisky";
  if (sourceCategory === "whiskey canadian" && /\brye\b/i.test(text)) return "Rye Whiskey";
  if (sourceCategory === "whiskey canadian" || /\bcanadian\b/i.test(text)) return "Canadian Whisky";
  if (sourceCategory === "whiskey rye" || /\brye\s+whisk(?:e)?y\b|\bstraight\s+rye\b|\brye\b/i.test(text)) return "Rye Whiskey";
  if (/\bwhistlepig\b/i.test(text)) return "Rye Whiskey";
  if (/\byellowstone\b/i.test(text)) return "Bourbon";
  if (/\bamerican\s+single\s+malt\b|\bsingle\s+malt\b.*\bwhisk(?:e)?y\b/i.test(text)) return "American Single Malt";
  if (/\bw\.?\s*l\.?\s+weller\b|\bweller\b|\bsweet\s+wheat\b|\bwheated?\b.*\bbourbon\b|\bbourbon\b.*\bwheated?\b/i.test(text)) return "Wheated Bourbon";
  if (/\bwheat\s+whisk(?:e)?y\b|\bstraight\s+wheat\b|\bamerican\s+wheat\s+whisky\b/i.test(text)) return "Wheat Whiskey";
  if (isSeriousTennesseeWhiskey(text)) return "Tennessee Whiskey";
  if (/\bbottled?\s+in\s+bond\b|\bbib\b/i.test(text)) return "Bottled in Bond Bourbon";
  if (cleanCategory.toLowerCase() === "whiskey bourbon" || /\bbourbon\b/i.test(text)) return "Bourbon";
  if (/\bblended\s+whisk(?:e)?y\b|\bblend of straight whisk(?:e)?ys\b|\bblended\s+whisky\b/i.test(text)) return "Blended Whiskey";
  if (/\bcorn\s+whisk(?:e)?y\b/i.test(text)) return "American Whiskey";
  if (sourceCategory === "whiskey american" || /\b(tin\s*cup|tincup|traveller|village\s+garage)\b|\bamerican\s+whisk(?:e)?y\b|\blight\s+whisk(?:e)?y\b|\bsour\s+mash\s+whisk(?:e)?y\b|\bstraight\s+whisk(?:e)?y\b/i.test(text)) return "American Whiskey";
  if (/\bwhisk(?:e)?y\b|\bwhisky\b/i.test(text)) return "Whiskey";
  return cleanCategory || "Vermont 802Spirits price list";
}

function isSeriousTennesseeWhiskey(text) {
  const clean = normalizeWhitespace(text).toLowerCase();
  if (/\b(apple|cola|coke|fire|honey|rye)\b/.test(clean)) return false;
  return /\b(jack daniel's black|jack daniels black|jack daniel's bonded|jack daniels bonded|jack daniel's single|jack daniels single|george dickel|gentleman jack|uncle nearest)\b/.test(clean);
}

function parseAsOfMonth(lines) {
  const found = lines.find((line) => /^[A-Z][a-z]+\s+\d{4}$/.test(line));
  return found || "";
}

function isHeaderLine(line) {
  return [
    /^Vermont 802Spirits Current Complete Price List$/i,
    /^Code$/i,
    /^Brand$/i,
    /^Size$/i,
    /^Regular$/i,
    /^Price$/i,
    /^Sale Price$/i,
    /^Save$/i,
    /^Proof$/i,
    /^Status$/i
  ].some((pattern) => pattern.test(line));
}

function isCategoryLine(line) {
  if (/^[A-Z][a-z]+\s+\d{4}$/.test(line)) return false;
  if (isMoney(line) || isNumber(line) || isSize(line)) return false;
  if (/^(High|Medium|Low) Volume$|^New$/i.test(line)) return false;
  if (line.length > 55) return false;
  return /^[A-Za-z][A-Za-z &'/-]+$/.test(line);
}

function isSize(value) {
  return /^(\d+(?:\.\d+)?L|LITER|\d+ML)$/i.test(normalizeWhitespace(value));
}

function isMoney(value) {
  return /^\d+(?:\.\d{2})$/.test(normalizeWhitespace(value));
}

function isNumber(value) {
  return /^\d+(?:\.\d+)?$/.test(normalizeWhitespace(value));
}

function cleanProductName(value) {
  return normalizeWhitespace(value)
    .replace(/[Ã¢â‚¬ËœÃ¢â‚¬â„¢]/g, "'")
    .replace(/[Ã¢â‚¬Å“Ã¢â‚¬Â]/g, "\"")
    .trim();
}

function cleanDisplayName(value) {
  return titleCase(cleanProductName(value)
    .replace(/\s+(?:50|100|200|375|700|750)ML\b/ig, "")
    .replace(/\s+1\.75L\b/ig, "")
    .replace(/\s+1L\b/ig, "")
    .replace(/\s+LITER\b/ig, "")
    .replace(/\s+/g, " ")
    .trim());
}

function titleCase(value) {
  const keepUpper = new Set(["BIB", "KSBW", "PET", "XO"]);
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
  if (clean === "LITER" || clean === "1.00L") return "1L";
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

function parseNumber(value) {
  const parsed = Number(normalizeWhitespace(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
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

function normalizeVermontBottle(record) {
  const fields = [
    "code",
    "rawCategory",
    "name",
    "rawName",
    "size",
    "regularPrice",
    "salePrice",
    "savings",
    "proof",
    "status",
    "asOf"
  ];

  return {
    id: slugify([record.name, record.size, record.code].filter(Boolean).join(" ")),
    identityKey: makeVermontIdentityKey(record),
    name: record.name,
    producer: "",
    supplier: "",
    category: record.category,
    bottleKind: inferBottleKind({ name: record.name, category: record.category }),
    proof: record.proof,
    age: record.age,
    ageYears: record.ageYears,
    size: record.size,
    aliases: unique([record.name, record.rawName, record.code]),
    sourceRefs: [
      {
        sourceId: SOURCE.id,
        sourceRecordId: record.sourceRecordId,
        sourceUrl: record.sourceUrl,
        retrievedAt: record.retrievedAt,
        fields
      }
    ],
    prices: Number.isFinite(record.price) ? [
      {
        sourceId: SOURCE.id,
        region: SOURCE.region,
        retailPrice: record.price,
        regularRetail: record.regularPrice,
        salePrice: record.salePrice,
        savings: record.savings,
        status: record.status,
        asOf: record.asOf,
        size: record.size,
        retrievedAt: record.retrievedAt
      }
    ] : []
  };
}

function makeVermontIdentityKey(record) {
  return [slugify(record.name), slugify(record.size || ""), slugify(record.code)].filter(Boolean).join("|");
}

function buildImportPayload(rows, retrievedAt, rawRecordCount) {
  const bottles = mergeCatalogRecords(rows.map(normalizeVermontBottle));
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
  if (!args.input) throw new Error("Provide --input data/raw/vermont-802/text/2026-may-complete-list.txt");

  const inputPath = path.resolve(args.input);
  const retrievedAt = new Date().toISOString();
  const text = fs.readFileSync(inputPath, "utf8");
  const rows = parseVermontPriceListText(text, {
    mode: args.mode,
    retrievedAt,
    sourceFile: path.relative(process.cwd(), inputPath)
  });
  const payload = buildImportPayload(rows, retrievedAt, rows.length);
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
  parseProductBlock,
  parseVermontPriceListText
};
