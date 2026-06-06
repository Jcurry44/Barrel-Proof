#!/usr/bin/env node

const fs = require("node:fs");
const https = require("node:https");
const path = require("node:path");
const {
  mergeCatalogRecords,
  normalizeImportedRecord,
  normalizeWhitespace,
  parseAge,
  parseCurrency,
  parseProof
} = require("../src/logic/catalog.js");

const SOURCE = {
  id: "nc_abc",
  name: "North Carolina ABC Quarterly Price List",
  url: "https://abc2.nc.gov/Pricing/PriceList",
  region: "NC",
  sourceType: "control_state_catalog"
};

const SERIOUS_WHISKEY_CATEGORIES = new Set([
  "AMERICAN WHISKEY BLENDED",
  "AMERICAN WHISKEY SPECIALTIES",
  "BONDED BOURBON",
  "BOURBON SPECIALTIES",
  "BOURBON WHISKEY",
  "BOUTIQUE COLLECTION - BOURBON",
  "BOUTIQUE COLLECTION - SCOTCH",
  "BOUTIQUE COLLECTION - WHISKEY",
  "CANADIAN WHISKY -- FOREIGN BTL",
  "CANADIAN WHISKY -- U.S. BTL",
  "CORN WHISKEY",
  "IRISH WHISKEY",
  "NORTH CAROLINA PRODUCTS",
  "OTHER IMPORTED WHISKY",
  "OTHER IMPORTED WHISKY (CONTINUED)",
  "RYE WHISKEY",
  "SCOTCH WHISKY -- FOREIGN BTL",
  "SCOTCH WHISKY -- SINGLE MALT",
  "SCOTCH WHISKY -- U.S. BTL",
  "SPECIAL PACKAGES",
  "TENNESSEE WHISKEY",
  "TENNESSEE WHISKEY SPECIALTIES"
]);

const NAME_MATCH_CATEGORIES = new Set([
  "AMERICAN WHISKEY SPECIALTIES",
  "NORTH CAROLINA PRODUCTS",
  "SPECIAL PACKAGES"
]);

function parseArgs(argv) {
  const args = {
    mode: "serious",
    url: SOURCE.url
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input") args.input = argv[++i];
    if (arg === "--out") args.out = argv[++i];
    if (arg === "--app-out") args.appOut = argv[++i];
    if (arg === "--url") args.url = argv[++i];
    if (arg === "--mode") args.mode = argv[++i];
  }
  return args;
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error("HTTP " + response.statusCode + " for " + url));
          response.resume();
          return;
        }
        response.setEncoding("utf8");
        let body = "";
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => resolve(body));
      })
      .on("error", reject);
  });
}

function parseNcAbcPriceListHtml(html, options = {}) {
  const retrievedAt = options.retrievedAt || new Date().toISOString();
  const rows = [];
  const lines = String(html).split(/\r?\n/);
  let currentCategory = "";
  let currentRow = null;

  for (const line of lines) {
    const categoryMatch = line.match(/<h5[^>]*>\s*<u>([\s\S]*?)<\/u>\s*<\/h5>/i);
    if (categoryMatch) {
      currentCategory = normalizeWhitespace(categoryMatch[1]);
      currentRow = null;
      continue;
    }

    if (line.includes("list-generic row")) {
      const detailMatch = line.match(/window\.location\s*=\s*'([^']+)'/i);
      currentRow = {
        category: currentCategory,
        detailPath: detailMatch ? detailMatch[1] : "",
        cells: []
      };
    }

    if (!currentRow) continue;

    const cellMatches = line.matchAll(/<div class="col-[^"]*"[^>]*>([\s\S]*?)<\/div>/g);
    for (const match of cellMatches) {
      currentRow.cells.push(normalizeWhitespace(match[1]));
    }

    if (currentRow.cells.length >= 7) {
      const [ncCode, supplier, name, ageRaw, proofRaw, size, retailRaw, mxbRaw] = currentRow.cells;
      rows.push({
        sourceId: SOURCE.id,
        sourceRecordId: ncCode,
        ncCode,
        supplier,
        producer: supplier,
        name,
        rawCategory: currentRow.category,
        category: inferNcCategory(currentRow.category, name),
        ageRaw,
        age: parseAge(ageRaw).label,
        ageYears: parseAge(ageRaw).years,
        proof: parseProof(proofRaw),
        size,
        retailPrice: parseCurrency(retailRaw),
        mxbPrice: parseCurrency(mxbRaw),
        detailUrl: currentRow.detailPath ? "https://abc2.nc.gov" + currentRow.detailPath : "",
        sourceUrl: SOURCE.url,
        region: SOURCE.region,
        retrievedAt
      });
      currentRow = null;
    }
  }

  return rows.filter((row) => includeRow(row, options.mode || "serious"));
}

function includeRow(row, mode) {
  const rawCategory = normalizeCategoryKey(row.rawCategory || row.category);
  const text = [row.rawCategory, row.category, row.name].join(" ").toLowerCase();
  if (mode === "all") return true;
  if (mode === "whiskey" || mode === "serious") {
    if (looksLikeNonSeriousWhiskeyProduct(text)) return false;
    if (!SERIOUS_WHISKEY_CATEGORIES.has(rawCategory)) return false;
    if (NAME_MATCH_CATEGORIES.has(rawCategory)) return hasWhiskeySignal(text) || hasNcWhiskeyBrandSignal(text);
    return true;
  }
  return /\bbourbon\b|bonded bourbon|bourbon specialties/i.test(text) && !looksLikeNonSeriousWhiskeyProduct(text);
}

function normalizeCategoryKey(value) {
  return normalizeWhitespace(value)
    .replace(/[\u2013\u2014]/g, "-")
    .toUpperCase();
}

function hasWhiskeySignal(text) {
  return /\b(american\s+s\.?m\.?|bourbon|bib|bonded|canadian|corn\s+whiskey|irish|japanese|rye|scotch|single\s+malt|s\.?m\.?\s+whiskey|tennessee|whiskey|whisky)\b/i.test(text);
}

function hasNcWhiskeyBrandSignal(text) {
  return /\b(1792|baker'?s|bardstown|barrell|ben holladay|blue note|buffalo trace|bushmills|caribou crossing|chattanooga|chicken cock|elijah craig|heaven'?s door|high west|joseph magnus|knob creek|larceny|michter'?s|mister sam|new riff|old ezra|old fitzgerald|old forester|penelope|pinhook|rare character|rebel|remus|shenk'?s|stagg|still austin|tullamore|weller|whistlepig|whiskey jypsi|wyoming whiskey|yellowstone)\b/i.test(text);
}

function looksLikeNonSeriousWhiskeyProduct(text) {
  const clean = normalizeWhitespace(text).toLowerCase();
  const isHoneyCask = /\bhoney\s+(?:barrels?|casks?)\b|\b(?:aged|finished)\s+in\s+honey\s+barrels?\b/i.test(clean);
  const isMapleCask = /\bmaple\s+(?:syrup\s+)?(?:barrels?|casks?)\b|\b(?:aged|finished)\s+in\s+maple\s+(?:syrup\s+)?barrels?\b/i.test(clean);

  if (/\bhoney\b/i.test(clean) && !isHoneyCask && !/\bhoneydew\b/i.test(clean)) return true;
  if (/\bmaple\b/i.test(clean) && !isMapleCask && !/\bmaplewood\b/i.test(clean)) return true;

  return [
    /\bapple\b/,
    /\bapples\b/,
    /\bbanana\b/,
    /\bblackberry\b/,
    /\bbourbon ball\b/,
    /\bbourbon cream\b/,
    /\bbrown sugar\b/,
    /\bburnt sugar\b/,
    /\bcans?\b/,
    /\bcherry\b/,
    /\bchocolate\b/,
    /\bcinnamon\b/,
    /\bcocktails?\b/,
    /\bcola\b/,
    /\bcookie\b/,
    /\bcream\b/,
    /\bel mayor\b/,
    /\bfire\b/,
    /\bflavo(?:u)?red\b/,
    /\bfruit punch\b/,
    /\bginger\b/,
    /\bgift\b/,
    /\bglass(?:es)?\b/,
    /\bhabanero\b/,
    /\blemonade\b/,
    /\bliqueur\b/,
    /\bmango\b/,
    /\bmoonshine\b/,
    /\bon the rocks\b/,
    /\bpancakes?\b/,
    /\bpeach\b/,
    /\bpeanut\b/,
    /\bpina\b/,
    /\bpineapple\b/,
    /\bpineapples\b/,
    /\bready\s*to\s*drink\b/,
    /\brtd\b/,
    /\bsalty\b/,
    /\bsalted caramel\b/,
    /\bsampler\b/,
    /\bs'?mores\b/,
    /\bsouthern comfort\b/,
    /\bsour\s+mix\b/,
    /\bspiced pear\b/,
    /\bsuper\s+lyte\b/,
    /\bvanilla\b/,
    /\bvap\b/,
    /\bwatermelon\b/,
    /\bwhiskey sour\b/,
    /\bw\/\s*(?:bottle topper|glass|glasses|ice|sour|topper)\b/,
    /\b\d+\s*pk\b/,
    /\b\d+\/\d+\s*pk\b/
  ].some((pattern) => pattern.test(clean));
}

function inferNcCategory(category, name) {
  const rawCategory = normalizeCategoryKey(category);
  const text = normalizeWhitespace(name).toLowerCase();
  if (rawCategory.includes("SCOTCH") || /\b(scotch|ardbeg|balvenie|chivas|dewars?|glenfiddich|glenlivet|glenmorangie|johnnie walker|lagavulin|laphroaig|macallan)\b/i.test(text)) return "Scotch Whisky";
  if (/\b(japanese|hatozaki|hibiki|nikka|suntory|tenjaku|toki)\b/i.test(text)) return "Japanese Whisky";
  if (rawCategory.includes("OTHER IMPORTED WHISKY")) return "Single Malt / World Whisky";
  if (/\bwhistlepig\b/i.test(text)) return "Rye Whiskey";
  if (rawCategory.includes("CANADIAN")) return "Canadian Whisky";
  if (rawCategory.includes("IRISH")) return "Irish Whiskey";
  if (rawCategory.includes("RYE") || /\brye\b/i.test(text)) return "Rye Whiskey";
  if (/\b(wheat whiskey|wheated)\b/i.test(text)) return "Wheat Whiskey";
  if (/\b(american\s+s\.?m\.?|single\s+malt|s\.?m\.?\s+whiskey|bulleit single malt|ealderman|rua)\b/i.test(text)) return "American Single Malt";
  if (rawCategory.includes("TENNESSEE") || /\b(jack daniel|george dickel|uncle nearest)\b/i.test(text)) return "Tennessee Whiskey";
  if (rawCategory.includes("BONDED BOURBON") || /\bbib\b|bonded|bottled in bond/i.test(text)) return "Bottled in Bond Bourbon";
  if (rawCategory.includes("BOURBON") || /\bbourbon\b/i.test(text)) return "Bourbon";
  if (/\b(1792|baker'?s|bardstown|ben holladay|buffalo trace|elijah craig|knob creek|larceny|old ezra|old fitzgerald|old forester|rebel|stagg|weller|yellowstone)\b/i.test(text)) return "Bourbon";
  if (rawCategory.includes("CORN WHISKEY")) return "Corn Whiskey";
  if (hasNcWhiskeyBrandSignal(text)) return "American Whiskey";
  if ((rawCategory === "NORTH CAROLINA PRODUCTS" || rawCategory === "SPECIAL PACKAGES") && hasWhiskeySignal(text)) return "American Whiskey";
  if (rawCategory.includes("AMERICAN WHISKEY")) return "American Whiskey";
  return normalizeWhitespace(category);
}

function buildImportPayload(rows, retrievedAt) {
  const normalizedRows = rows.map((row) => normalizeImportedRecord(row));
  const bottles = mergeCatalogRecords(normalizedRows);
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

function toAppBottle(bottle) {
  const sourcePrice = bottle.prices.find((price) => Number.isFinite(price.retailPrice));
  return {
    id: "nc-abc-" + bottle.id,
    name: bottle.name,
    distillery: bottle.producer,
    producer: bottle.producer,
    supplier: bottle.supplier,
    category: bottle.category,
    proof: bottle.proof,
    age: bottle.age,
    size: bottle.size,
    sourceRetailPrice: sourcePrice ? sourcePrice.retailPrice : null,
    sourcePriceLabel: "NC ABC retail",
    rarity: "Source-backed",
    mashBill: "Unknown",
    imageTone: bottle.bottleKind === "rye" ? "copper" : "bronze",
    aliases: bottle.aliases,
    profile: [],
    bestFor: [],
    reviewScore: null,
    hypeIndex: null,
    story: "",
    sourceRefs: bottle.sourceRefs,
    prices: bottle.prices
  };
}

function writeAppCatalog(payload, appOutPath) {
  const appPayload = {
    schemaVersion: 1,
    generatedAt: payload.retrievedAt,
    source: payload.source,
    bottleCount: payload.bottleCount,
    bottles: payload.bottles.map(toAppBottle)
  };
  const js = "(function attachImportedCatalog(global) {\n" +
    "  global.BarrelImportedCatalog = " + JSON.stringify(appPayload, null, 2) + ";\n" +
    "})(typeof window !== \"undefined\" ? window : globalThis);\n";
  fs.mkdirSync(path.dirname(appOutPath), { recursive: true });
  fs.writeFileSync(appOutPath, js);
}

async function main() {
  const args = parseArgs(process.argv);
  const retrievedAt = new Date().toISOString();
  const html = args.input
    ? fs.readFileSync(path.resolve(args.input), "utf8")
    : await fetchText(args.url);
  const rows = parseNcAbcPriceListHtml(html, { mode: args.mode, retrievedAt });
  const payload = buildImportPayload(rows, retrievedAt);
  const output = JSON.stringify(payload, null, 2) + "\n";

  if (args.out) {
    const outPath = path.resolve(args.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, output);
  } else {
    process.stdout.write(output);
  }

  if (args.appOut) {
    writeAppCatalog(payload, path.resolve(args.appOut));
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
  parseNcAbcPriceListHtml
};
