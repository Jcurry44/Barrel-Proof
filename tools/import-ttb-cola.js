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

const SEARCH_URL = "https://www.ttbonline.gov/colasonline/publicSearchColasBasic.do";
const DETAIL_URL = "https://www.ttbonline.gov/colasonline/viewColaDetails.do";

const SOURCE = {
  id: "ttb_cola_public_registry",
  name: "TTB COLA Public Registry",
  url: "https://www.ttb.gov/what-we-do/online-services/public-cola-registry",
  searchUrl: SEARCH_URL,
  region: "US",
  sourceType: "federal_label_registry"
};

const FIELD_ALIASES = {
  ttbId: ["ttb id", "ttb id number", "ttbid"],
  permitNo: ["permit no.", "permit no", "permit number", "plant registry/basic permit/brewers no"],
  serialNumber: ["serial number", "serial no.", "serial no", "serial #"],
  completedDate: ["completed date", "approval date", "date completed"],
  fancifulName: ["fanciful name"],
  brandName: ["brand name"],
  origin: ["origin", "origin code"],
  classType: ["class/type", "class type", "class and type", "product class/type"],
  status: ["status"],
  applicant: ["applicant", "permittee", "company name", "company"]
};

function parseArgs(argv) {
  const args = {
    inputs: [],
    mode: "bourbon"
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input") args.inputs.push(argv[++i]);
    if (arg === "--input-dir") args.inputDir = argv[++i];
    if (arg === "--out") args.out = argv[++i];
    if (arg === "--app-out") args.appOut = argv[++i];
    if (arg === "--mode") args.mode = argv[++i];
  }

  return args;
}

function resolveInputFiles(args) {
  const files = [...args.inputs];
  if (args.inputDir) {
    const dir = path.resolve(args.inputDir);
    for (const entry of fs.readdirSync(dir)) {
      if (entry.toLowerCase().endsWith(".csv")) files.push(path.join(dir, entry));
    }
  }
  return unique(files).map((file) => path.resolve(file));
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        cell += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => normalizeWhitespace(value))) rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => normalizeWhitespace(value))) rows.push(row);
  return rows;
}

function parseTtbColaCsv(csv, options = {}) {
  const rows = parseCsv(csv);
  if (!rows.length) return [];

  const headers = rows[0].map(cleanCell);
  const headerMap = buildHeaderMap(headers);
  const retrievedAt = options.retrievedAt || new Date().toISOString();
  const sourceFile = options.sourceFile || "";

  return rows.slice(1)
    .map((row) => normalizeTtbSearchRow(row, headerMap, { retrievedAt, sourceFile }))
    .filter(Boolean)
    .filter((row) => includeRow(row, options.mode || "bourbon"));
}

function buildHeaderMap(headers) {
  const normalized = headers.map((header) => header.toLowerCase());
  const map = {};

  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    const index = normalized.findIndex((header) => aliases.includes(header));
    map[field] = index;
  }

  return map;
}

function normalizeTtbSearchRow(row, headerMap, options = {}) {
  const value = (field) => headerMap[field] >= 0 ? cleanCell(row[headerMap[field]]) : "";
  const ttbId = value("ttbId");
  if (!ttbId) return null;

  const brandName = value("brandName");
  const fancifulName = value("fancifulName");
  const name = buildProductName({ brandName, fancifulName, ttbId });
  const classType = value("classType");
  const completedDate = value("completedDate");

  return {
    sourceId: SOURCE.id,
    sourceRecordId: ttbId,
    ttbId,
    permitNo: value("permitNo"),
    serialNumber: value("serialNumber"),
    completedDate,
    approvalDate: completedDate,
    brandName,
    fancifulName,
    name,
    origin: value("origin"),
    classType,
    category: classType,
    status: value("status"),
    applicant: value("applicant"),
    sourceUrl: SOURCE.searchUrl,
    detailUrl: buildTtbDetailUrl(ttbId),
    region: SOURCE.region,
    sourceFile: options.sourceFile || "",
    retrievedAt: options.retrievedAt || new Date().toISOString()
  };
}

function buildProductName(row) {
  const parts = unique([row.brandName, row.fancifulName]);
  if (parts.length) return parts.join(" ");
  return "TTB COLA " + row.ttbId;
}

function includeRow(row, mode) {
  if (mode === "all") return true;

  const text = [
    row.classType,
    row.brandName,
    row.fancifulName,
    row.name
  ].join(" ").toLowerCase();

  if (mode === "whiskey") {
    return ["bourbon", "whiskey", "whisky", "rye"].some((term) => text.includes(term));
  }

  return text.includes("bourbon");
}

function cleanCell(value) {
  const clean = normalizeWhitespace(String(value || "").replace(/^\uFEFF/, ""));
  return clean
    .replace(/^'+/, "")
    .replace(/'+$/, "")
    .trim();
}

function buildTtbDetailUrl(ttbId) {
  return DETAIL_URL + "?action=publicDisplaySearchBasic&ttbid=" + encodeURIComponent(cleanCell(ttbId));
}

function normalizeTtbBottle(record) {
  const sourceFields = [
    "ttbId",
    "permitNo",
    "serialNumber",
    "completedDate",
    "brandName",
    "fancifulName",
    "origin",
    "classType"
  ];

  return {
    id: slugify([record.name, record.ttbId].join(" ")),
    identityKey: ["ttb", record.ttbId].join("|"),
    name: record.name,
    producer: record.applicant || "",
    supplier: "",
    category: record.classType,
    bottleKind: inferBottleKind({ name: record.name, category: record.classType }),
    proof: null,
    age: "Unknown",
    ageYears: null,
    size: null,
    aliases: unique([record.brandName, record.fancifulName, record.name, record.ttbId]),
    sourceRefs: [
      {
        sourceId: SOURCE.id,
        sourceRecordId: record.ttbId,
        sourceUrl: record.detailUrl,
        retrievedAt: record.retrievedAt,
        fields: sourceFields
      }
    ],
    prices: [],
    labelApprovals: [
      {
        ttbId: record.ttbId,
        permitNo: record.permitNo,
        serialNumber: record.serialNumber,
        completedDate: record.completedDate,
        brandName: record.brandName,
        fancifulName: record.fancifulName,
        origin: record.origin,
        classType: record.classType,
        status: record.status,
        detailUrl: record.detailUrl
      }
    ]
  };
}

function buildImportPayload(rows, retrievedAt, sourceFiles = []) {
  const dedupedRows = Array.from(new Map(rows.map((row) => [row.ttbId, row])).values());
  const bottles = mergeCatalogRecords(dedupedRows.map(normalizeTtbBottle));

  return {
    schemaVersion: 1,
    source: SOURCE,
    sourceFiles,
    retrievedAt,
    rawRecordCount: rows.length,
    uniqueRecordCount: dedupedRows.length,
    bottleCount: bottles.length,
    records: dedupedRows,
    bottles
  };
}

function toAppBottle(bottle) {
  return {
    id: "ttb-" + bottle.id,
    name: bottle.name,
    distillery: bottle.producer || "Unknown producer",
    producer: bottle.producer,
    supplier: bottle.supplier,
    category: bottle.category || "TTB label approval",
    proof: bottle.proof,
    age: bottle.age,
    size: bottle.size,
    sourceRetailPrice: null,
    sourcePriceLabel: "No retail price in TTB registry",
    rarity: "Label approval",
    mashBill: "Unknown",
    imageTone: "bronze",
    aliases: bottle.aliases,
    profile: [],
    bestFor: [],
    reviewScore: null,
    hypeIndex: null,
    story: "Federal label approval record. Use this for product identity and release discovery, then pair it with retail/catalog data for buy decisions.",
    sourceRefs: bottle.sourceRefs,
    prices: bottle.prices,
    labelApprovals: bottle.labelApprovals
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
  const inputFiles = resolveInputFiles(args);
  if (!inputFiles.length) {
    throw new Error("Provide at least one --input CSV file or an --input-dir containing TTB CSV exports.");
  }

  const retrievedAt = new Date().toISOString();
  const rows = inputFiles.flatMap((file) => {
    const csv = fs.readFileSync(file, "utf8");
    return parseTtbColaCsv(csv, {
      mode: args.mode,
      retrievedAt,
      sourceFile: path.relative(process.cwd(), file)
    });
  });
  const payload = buildImportPayload(rows, retrievedAt, inputFiles.map((file) => path.relative(process.cwd(), file)));
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
  buildTtbDetailUrl,
  includeRow,
  normalizeTtbBottle,
  normalizeTtbSearchRow,
  parseCsv,
  parseTtbColaCsv
};
