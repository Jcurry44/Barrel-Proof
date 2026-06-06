#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const {
  makeIdentityKey,
  mergeCatalogRecords,
  normalizeImportedRecord,
  normalizeWhitespace,
  parseProof
} = require("../src/logic/catalog.js");
const { parseNcAbcPriceListHtml } = require("./import-nc-abc.js");

const SOURCE = {
  id: "nc_abc_warehouse_stock",
  name: "North Carolina ABC Daily Warehouse Stock Report",
  url: "https://abc2.nc.gov/StoresBoards/Stocks",
  region: "NC",
  sourceType: "control_state_inventory"
};

const PRICE_LIST_URL = "https://abc2.nc.gov/Pricing/PriceList";

function parseArgs(argv) {
  const args = {
    url: SOURCE.url,
    mode: "serious"
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input") args.input = argv[++i];
    if (arg === "--price-list") args.priceList = argv[++i];
    if (arg === "--out") args.out = argv[++i];
    if (arg === "--mode") args.mode = argv[++i];
  }
  return args;
}

function buildPriceLookup(priceListHtml, retrievedAt) {
  if (!priceListHtml) return new Map();
  const priceRows = parseNcAbcPriceListHtml(priceListHtml, {
    mode: "all",
    retrievedAt
  });
  return new Map(priceRows.map((row) => [normalizeNcCodeDigits(row.ncCode), row]));
}

function parseNcAbcWarehouseStockHtml(html, options = {}) {
  const retrievedAt = options.retrievedAt || new Date().toISOString();
  const mode = options.mode || "serious";
  const priceByCode = new Map((options.priceRows || []).map((row) => [normalizeNcCodeDigits(row.ncCode), row]));
  const reportDate = parseReportDate(html);
  const seen = new Set();
  const rows = [];
  const rowPattern = /<tr\b[^>]*class="[^"]*\blist-generic\b[^"]*"[\s\S]*?<\/tr>/gi;

  for (const rowMatch of String(html).matchAll(rowPattern)) {
    const rowHtml = rowMatch[0];
    const cells = Array.from(rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi), (match) => normalizeWhitespace(match[1]));
    if (cells.length < 9) continue;

    const detailMatch = rowHtml.match(/window\.location\s*=\s*'([^']+)'/i);
    const itemIdMatch = rowHtml.match(/\bitem_id="([^"]+)"/i);
    const [ncCodeRaw, stockName, listingType, totalAvailableRaw, size, casesPerPalletRaw, supplier, supplierAllotmentRaw, brokerName] = cells;
    const ncCodeDigits = normalizeNcCodeDigits(ncCodeRaw);
    const detailPath = detailMatch ? detailMatch[1] : "";
    const itemId = itemIdMatch ? itemIdMatch[1] : "";
    const key = [itemId, ncCodeDigits, normalizeWhitespace(size).toUpperCase()].join("|");
    if (seen.has(key)) continue;
    seen.add(key);

    const priceRow = priceByCode.get(ncCodeDigits);
    const row = {
      sourceId: SOURCE.id,
      sourceRecordId: ncCodeRaw,
      ncCode: formatNcCode(ncCodeDigits),
      ncCodeRaw,
      stockItemId: itemId,
      supplier,
      producer: supplier,
      name: normalizeWhitespace(stockName),
      rawCategory: priceRow ? priceRow.rawCategory : "",
      category: priceRow && !isBroadMixedCategory(priceRow.rawCategory, priceRow.category)
        ? priceRow.category
        : inferNcWarehouseCategory(stockName),
      ageRaw: priceRow ? priceRow.ageRaw : parseAgeFromName(stockName),
      age: priceRow ? priceRow.age : "",
      ageYears: priceRow ? priceRow.ageYears : null,
      proof: priceRow ? priceRow.proof : parseProofFromName(stockName),
      size,
      listingType,
      totalAvailable: parseInteger(totalAvailableRaw),
      casesPerPallet: parseInteger(casesPerPalletRaw),
      supplierAllotment: parseInteger(supplierAllotmentRaw),
      brokerName,
      detailUrl: detailPath ? "https://abc2.nc.gov" + detailPath : "",
      sourceUrl: SOURCE.url,
      priceListSourceUrl: priceRow ? PRICE_LIST_URL : "",
      reportDate,
      region: SOURCE.region,
      retrievedAt,
      identityName: priceRow ? priceRow.name : ""
    };

    if (includeRow(row, mode)) rows.push(row);
  }

  return rows;
}

function includeRow(row, mode) {
  const text = [row.rawCategory, row.name].join(" ").toLowerCase();
  const nameText = normalizeWhitespace(row.name).toLowerCase();
  if (mode === "all") return true;
  if (looksLikeNonSeriousWhiskeyProduct(text)) return false;
  if (isDisallowedRawCategory(row.rawCategory) && !isSeriousRawCategory(row.rawCategory)) return false;
  const hasWhiskeySignal = hasDirectWhiskeySignal(nameText) || hasWhiskeyBrandSignal(nameText);
  if (isBroadMixedCategory(row.rawCategory, row.category)) {
    return hasWhiskeySignal && !hasDisallowedSpiritSignalWithoutWhiskey(nameText);
  }
  if (isSeriousRawCategory(row.rawCategory)) return !hasDisallowedSpiritSignalWithoutWhiskey(nameText);
  if (hasDirectWhiskeySignal(nameText)) return !hasDisallowedSpiritSignalWithoutWhiskey(nameText);
  return hasWhiskeyBrandSignal(nameText) && !hasDisallowedSpiritSignalWithoutWhiskey(nameText);
}

function normalizeNcCodeDigits(value) {
  return normalizeWhitespace(value).replace(/\D/g, "").padStart(5, "0");
}

function formatNcCode(value) {
  const digits = normalizeNcCodeDigits(value);
  if (digits.length === 5) return digits.slice(0, 2) + "-" + digits.slice(2);
  return digits;
}

function parseInteger(value) {
  const parsed = Number(normalizeWhitespace(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseReportDate(html) {
  const spanMatch = String(html).match(/Stock Report Date[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i);
  if (spanMatch) return normalizeWhitespace(spanMatch[1]);
  const inputMatch = String(html).match(/\bname="ReportDate"[^>]*\bvalue="([^"]*)"/i);
  return inputMatch ? normalizeWhitespace(inputMatch[1]) : "";
}

function parseAgeFromName(name) {
  const match = normalizeWhitespace(name).match(/\b(\d{1,2})(?:\s*years?|\s*yrs?|\s*y)\b/i);
  return match ? match[1] + "Y" : "";
}

function parseProofFromName(name) {
  const proofMatch = normalizeWhitespace(name).match(/\b(\d{2,3}(?:\.\d+)?)\s*(?:pf|proof)\b/i);
  return proofMatch ? parseProof(proofMatch[1]) : null;
}

function isSeriousRawCategory(rawCategory) {
  const key = normalizeWhitespace(rawCategory).toUpperCase();
  return /\b(AMERICAN WHISKEY|BONDED BOURBON|BOURBON|CANADIAN WHISKY|CORN WHISKEY|IRISH WHISKEY|OTHER IMPORTED WHISKY|RYE WHISKEY|SCOTCH WHISKY|TENNESSEE WHISKEY|BOUTIQUE COLLECTION - (BOURBON|SCOTCH|WHISKEY))\b/.test(key);
}

function isBroadMixedCategory(rawCategory, category) {
  const key = normalizeWhitespace([rawCategory, category].filter(Boolean).join(" ")).toUpperCase();
  return /\b(NORTH CAROLINA PRODUCTS|SPECIAL PACKAGES|MINIATURES|ONE & TWO HUNDRED ML)\b/.test(key);
}

function isDisallowedRawCategory(rawCategory) {
  const key = normalizeWhitespace(rawCategory).toUpperCase();
  return /\b(BRANDY|COCKTAILS?|CORDIALS?|GIN|LIQUEURS?|MEZCAL|MOONSHINE|RUM|SCHNAPPS|TEQUILA|VODKA|WINE)\b/.test(key);
}

function hasDirectWhiskeySignal(text) {
  return /\b(american\s+s\.?m\.?|bib|bonded|bottled\s+in\s+bond|bourbon|canadian|corn\s+whiskey|irish|japanese|rye|scotch|single\s+malt|s\.?m\.?|tennessee|wheat\s+whiskey|wheated|whiskey|whisky)\b/i.test(text);
}

function hasWhiskeyBrandSignal(text) {
  return /\b(1792|ardbeg|balvenie|bardstown|barrell|basil hayden|ben holladay|blade\s*&\s*bow|blanton|blood oath|blue note|blue run|buffalo trace|bulleit|bushmills|buzzard'?s roost|caribou crossing|chattanooga|chicken cock|chivas|crown royal|dewars?|eagle rare|elijah craig|four roses|found north|garrison brothers|george dickel|glendronach|glenfiddich|glenlivet|glenmorangie|green river|hakushu|hatozaki|heaven hill|hibiki|high west|hurst knoll|jack daniel|jameson|jefferson'?s|johnnie walker|knob creek|lagavulin|laphroaig|larceny|little book|macallan|maker'?s mark|michter'?s|new riff|nikka|old ezra|old fitzgerald|old forester|old grand[- ]dad|orphan barrel|peerless|penelope|pendleton|pinhook|rabbit hole|rare character|redbreast|redwood empire|remus|russell'?s reserve|ry3|sagamore|sazerac|shenk'?s|stagg|star hill farms|tullamore|uncle nearest|weller|whiskey jypsi|whistlepig|wild turkey|willett|woodford reserve|yellowstone|yoichi)\b/i.test(text);
}

function hasDisallowedSpiritSignalWithoutWhiskey(text) {
  const clean = normalizeWhitespace(text).toLowerCase();
  const caskFinish = /\b(cask|finish|finished)\b/.test(clean);
  const whiskeySignal = hasDirectWhiskeySignal(clean) || hasWhiskeyBrandSignal(clean);
  if (whiskeySignal && caskFinish && /\b(armagnac|cognac|marsala|madeira|port|rum|sherry|tokaji|wine)\b/i.test(clean)) return false;
  if (hasDirectWhiskeySignal(clean) && !/\b(corazon|el mayor|espolon|herradura|hornitos|patron|tequila|tromba|vodka|gin|rum|brandy|cognac|cordial|liqueur|wine)\b/i.test(clean)) return false;
  return /\b(1800|adictivo|amaretto|aperitif|brandy|cachaca|codigo|cognac|corazon|cordial|espolon|gin|grappa|hornitos|jagermeister|mezcal|mineragua|patron|planteray|ron\b|rum|schnapps|teremana|tequila|tromba|vermouth|vodka|volteo|wine)\b/i.test(clean);
}

function looksLikeNonSeriousWhiskeyProduct(text) {
  const clean = normalizeWhitespace(text).toLowerCase();
  const isHoneyCask = /\bhoney\s+(?:barrels?|casks?)\b|\b(?:aged|finished)\s+in\s+honey\s+barrels?\b/i.test(clean);
  const isMapleCask = /\bmaple\s+(?:syrup\s+)?(?:barrels?|casks?)\b|\b(?:aged|finished)\s+in\s+maple\s+(?:syrup\s+)?barrels?\b/i.test(clean);

  if (/\bhoney\b/i.test(clean) && !isHoneyCask && !/\bhoneydew\b/i.test(clean)) return true;
  if (/\bmaple\b/i.test(clean) && !isMapleCask && !/\bmaplewood\b/i.test(clean)) return true;

  return [
    /\bapple\b/,
    /\bbanana\b/,
    /\bblackberry\b/,
    /\bbourbon ball\b/,
    /\bbourbon cream\b/,
    /\bcans?\b/,
    /\bcherry\b/,
    /\bchocolate\b/,
    /\bcinnamon\b/,
    /\bcocktails?\b/,
    /\bcola\b/,
    /\bcream\b/,
    /\bcodigo\b/,
    /\bel mayor\b/,
    /\bfire\b/,
    /\bflavo(?:u)?red\b/,
    /\bginger\b/,
    /\bgift\b/,
    /\bglass(?:es)?\b/,
    /\bherradura\b/,
    /\blemonade\b/,
    /\bliqueur\b/,
    /\bmango\b/,
    /\bmoonshine\b/,
    /\bon the rocks\b/,
    /\bpack\b/,
    /\bpeach\b/,
    /\bpeanut\b/,
    /\bpineapple\b/,
    /\bready\s*to\s*drink\b/,
    /\brtd\b/,
    /\bsalted caramel\b/,
    /\bsampler\b/,
    /\bsouthern comfort\b/,
    /\bsour\s+mix\b/,
    /\bsuper\s+lyte\b/,
    /\btallboy\b/,
    /\bvanilla\b/,
    /\bvap\b/,
    /\bwatermelon\b/,
    /\bwhiskey sour\b/,
    /\bw\/\s*(?:bottle topper|glass|glasses|ice|sour|topper)\b/,
    /\b\d+\s*pk\b/
  ].some((pattern) => pattern.test(clean));
}

function inferNcWarehouseCategory(name) {
  const text = normalizeWhitespace(name).toLowerCase();
  if (/\b(scotch|ardbeg|balvenie|chivas|dewars?|glendronach|glenfiddich|glenlivet|glenmorangie|johnnie walker|lagavulin|laphroaig|macallan)\b/i.test(text)) return "Scotch Whisky";
  if (/\b(japanese|hakushu|hatozaki|hibiki|nikka|suntory|tenjaku|toki|yoichi)\b/i.test(text)) return "Japanese Whisky";
  if (/\b(canadian|caribou crossing|crown royal|found north|pendleton)\b/i.test(text)) return "Canadian Whisky";
  if (/\b(irish|bushmills|jameson|redbreast|tullamore)\b/i.test(text)) return "Irish Whiskey";
  if (/\brye\b|\bwhistlepig\b|\bry3\b/i.test(text)) return "Rye Whiskey";
  if (/\bwheated\b.*\bbourbon\b|\bbourbon\b.*\bwheated\b/i.test(text)) return "Wheated Bourbon";
  if (/\b(wheat whiskey|wheated)\b/i.test(text)) return "Wheat Whiskey";
  if (/\b(american\s+s\.?m\.?|single\s+malt|s\.?m\.?|bulleit single malt|ealderman|rua)\b/i.test(text)) return "American Single Malt";
  if (/\b(jack daniel|george dickel|tennessee|uncle nearest)\b/i.test(text)) return "Tennessee Whiskey";
  if (/\bbib\b|bonded|bottled in bond/i.test(text)) return "Bottled in Bond Bourbon";
  if (/\bbourbon\b/i.test(text)) return "Bourbon";
  if (/\bcorn\s+whiskey\b/i.test(text)) return "Corn Whiskey";
  if (hasWhiskeyBrandSignal(text) || hasDirectWhiskeySignal(text)) return "American Whiskey";
  return "Whiskey";
}

function normalizeWarehouseRecord(row) {
  const normalized = normalizeImportedRecord(row);
  if (row.identityName) {
    normalized.identityKey = makeIdentityKey({
      name: row.identityName,
      producer: row.producer || row.supplier,
      size: row.size,
      proof: row.proof
    });
  }
  if (normalized.sourceRefs[0]) {
    normalized.sourceRefs[0].fields = [
      "name",
      "supplier",
      "listingType",
      "totalAvailable",
      "size",
      "casesPerPallet",
      "supplierAllotment",
      "brokerName"
    ];
  }
  return normalized;
}

function buildImportPayload(rows, retrievedAt, sourceFiles = []) {
  const normalizedRows = rows.map(normalizeWarehouseRecord);
  const bottles = mergeCatalogRecords(normalizedRows);
  return {
    schemaVersion: 1,
    source: SOURCE,
    retrievedAt,
    rawRecordCount: rows.length,
    bottleCount: bottles.length,
    sourceFiles,
    records: rows,
    bottles
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const retrievedAt = new Date().toISOString();
  if (!args.input) throw new Error("--input is required for the saved NC ABC warehouse stock HTML");

  const inputPath = path.resolve(args.input);
  const html = fs.readFileSync(inputPath, "utf8");
  const priceListHtml = args.priceList ? fs.readFileSync(path.resolve(args.priceList), "utf8") : "";
  const priceByCode = buildPriceLookup(priceListHtml, retrievedAt);
  const rows = parseNcAbcWarehouseStockHtml(html, {
    mode: args.mode,
    retrievedAt,
    priceRows: Array.from(priceByCode.values())
  });
  const sourceFiles = [path.relative(process.cwd(), inputPath)];
  if (args.priceList) sourceFiles.push(path.relative(process.cwd(), path.resolve(args.priceList)));
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
  parseNcAbcWarehouseStockHtml
};
