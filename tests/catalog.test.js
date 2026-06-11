const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  makeCanonicalIdentityKey,
  mergeCatalogRecords,
  normalizeImportedRecord,
  normalizeSize,
  parseAge,
  parseCurrency,
  parseProof,
  slugify
} = require("../src/logic/catalog.js");
const { parseNcAbcPriceListHtml } = require("../tools/import-nc-abc.js");

test("slugify creates stable identity fragments", () => {
  assert.equal(slugify("Elijah Craig Barrel Proof Small Batch"), "elijah-craig-barrel-proof-small-batch");
});

test("parses age, size, and currency values", () => {
  assert.deepEqual(parseAge("004Y"), { raw: "004Y", label: "4 years", years: 4 });
  assert.deepEqual(parseAge("000M"), { raw: "000M", label: "NAS", years: null });
  assert.equal(normalizeSize(".75L"), "750ml");
  assert.equal(parseCurrency("$74.95"), 74.95);
  assert.equal(parseProof(""), null);
  assert.equal(parseProof("0"), null);
});

test("NC ABC parser keeps serious whiskey rows by default", () => {
  const html = fs.readFileSync(path.join(__dirname, "fixtures", "nc-abc-price-list-snippet.html"), "utf8");
  const rows = parseNcAbcPriceListHtml(html, {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });

  assert.equal(rows.length, 2);
  assert.equal(rows[0].ncCode, "23-566");
  assert.equal(rows[0].supplier, "Heaven Hill");
  assert.equal(rows[0].category, "Bourbon");
  assert.equal(rows[0].proof, 124.2);
  assert.equal(rows[0].retailPrice, 74.95);
  assert.equal(rows[0].detailUrl, "https://abc2.nc.gov/Pricing/ViewItemDetails/17830");
  assert.equal(rows[1].category, "Rye Whiskey");
});

test("NC ABC parser still supports bourbon-only mode", () => {
  const html = fs.readFileSync(path.join(__dirname, "fixtures", "nc-abc-price-list-snippet.html"), "utf8");
  const rows = parseNcAbcPriceListHtml(html, {
    mode: "bourbon",
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });

  assert.deepEqual(rows.map((row) => row.ncCode), ["23-566"]);
});

test("NC ABC parser widens to serious whiskey and rejects flavored specialties", () => {
  const row = (category, code, supplier, name, age, proof, size, retail, mxb) => `
<h5 class="pt-3"><u>${category}</u></h5>
<div class="list-generic row " onclick="window.location = '/Pricing/ViewItemDetails/${code.replace(/\D/g, "")}'">
  <div class="col-1 border-right border-white">${code}</div>
  <div class="col-2 border-right border-white">${supplier}</div>
  <div class="col-3 border-right border-white">${name}</div>
  <div class="col-1 border-right border-white">${age}</div>
  <div class="col-1 border-right border-white">${proof}</div>
  <div class="col-1 border-right border-white">${size}</div>
  <div class="col-1 border-right border-white">${retail}</div>
  <div class="col-2">${mxb}</div>
</div>`;
  const html = [
    row("Scotch Whisky -- Single Malt", "35-001", "Moet Hennessy", "Ardbeg Corryvreckan", "000M", "114.2", ".75L", "$118.95", "$120.00"),
    row("Canadian Whisky -- Foreign BTL", "38-001", "Diageo", "Crown Royal XO", "000M", "80", ".75L", "$44.95", "$48.00"),
    row("North Carolina Products", "66-036", "Great Wagon Road", "Rua American S.M. Whiskey", "000M", "92", ".75L", "$59.95", "$63.00"),
    row("American Whiskey Specialties", "31-268", "Beam Suntory", "Jim Beam Apple", "000M", "70", ".75L", "$17.95", "$20.00"),
    row("Special Packages", "17-292", "Nikka", "Nikka Coffey Malt Whisky", "000M", "90", ".75L", "$79.95", "$82.00"),
    row("Special Packages", "18-010", "Sazerac", "Buffalo Trace (BTB)", "000M", "90", "1.00L", "$35.95", "$38.00"),
    row("Special Packages", "17-283", "Brown Forman", "Herradura Double Reposado (BTB)", "000M", "80", ".75L", "$59.95", "$62.00"),
    row("Special Packages", "17-879", "Sazerac", "El Mayor Extra Anejo Bourbon Finished", "000M", "80", ".75L", "$89.95", "$92.00")
  ].join("\n");

  const rows = parseNcAbcPriceListHtml(html, {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });

  assert.deepEqual(rows.map((item) => item.category), [
    "Scotch Whisky",
    "Canadian Whisky",
    "American Single Malt",
    "Japanese Whisky",
    "Bourbon"
  ]);
  assert.equal(rows.some((item) => item.name === "Jim Beam Apple"), false);
  assert.equal(rows.some((item) => item.name === "Herradura Double Reposado (BTB)"), false);
  assert.equal(rows.some((item) => item.name === "El Mayor Extra Anejo Bourbon Finished"), false);
});

test("normalizes imported rows into source-backed bottle records", () => {
  const normalized = normalizeImportedRecord({
    sourceId: "nc_abc",
    sourceRecordId: "23-566",
    region: "NC",
    supplier: "Heaven Hill",
    name: "Elijah Craig Barrel Proof Small Batch",
    category: "Bourbon Whiskey",
    ageRaw: "000M",
    proof: 124.2,
    size: ".75L",
    retailPrice: "$74.95",
    sourceUrl: "https://abc2.nc.gov/Pricing/PriceList",
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });

  assert.equal(normalized.bottleKind, "bourbon");
  assert.equal(normalized.size, "750ml");
  assert.equal(normalized.prices[0].retailPrice, 74.95);
  assert.equal(normalized.sourceRefs[0].sourceId, "nc_abc");
});

test("bottle kind inference covers world whisky categories", () => {
  assert.equal(normalizeImportedRecord({
    sourceId: "test",
    name: "The Macallan Double Cask 18 Year Old Whisky",
    category: "Scotch Whisky",
    proof: 86,
    size: "750ml"
  }).bottleKind, "scotch_whisky");
  assert.equal(normalizeImportedRecord({
    sourceId: "test",
    name: "Found North Batch 010 Whisky",
    category: "Canadian Whisky",
    proof: 130.2,
    size: "750ml"
  }).bottleKind, "canadian_whisky");
  assert.equal(normalizeImportedRecord({
    sourceId: "test",
    name: "Hibiki Harmony Whisky",
    category: "Japanese Whisky",
    proof: 86,
    size: "750ml"
  }).bottleKind, "japanese_whisky");
});

test("merge keeps source references and prices for duplicate identity rows", () => {
  const base = normalizeImportedRecord({
    sourceId: "nc_abc",
    sourceRecordId: "23-566",
    supplier: "Heaven Hill",
    name: "Elijah Craig Barrel Proof Small Batch",
    category: "Bourbon Whiskey",
    proof: 124.2,
    size: ".75L",
    retailPrice: "$74.95"
  });
  const duplicate = normalizeImportedRecord({
    sourceId: "other_source",
    sourceRecordId: "abc",
    supplier: "Heaven Hill",
    name: "Elijah Craig Barrel Proof Small Batch",
    category: "Bourbon Whiskey",
    proof: 124.2,
    size: ".75L",
    retailPrice: "$79.99"
  });

  const merged = mergeCatalogRecords([base, duplicate]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].sourceRefs.length, 2);
  assert.equal(merged[0].prices.length, 2);
});

test("merge prefers complete names over source-truncated names", () => {
  const truncated = normalizeImportedRecord({
    sourceId: "nc_abc",
    sourceRecordId: "00-028",
    supplier: "Garrison Brothers Distillery",
    name: "Garrison Brothers Small Batch Bo...",
    category: "Bourbon",
    proof: 94,
    size: ".75L",
    retailPrice: "$79.95",
    sourceUrl: "https://abc2.nc.gov/Pricing/PriceList",
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });
  const complete = normalizeImportedRecord({
    sourceId: "nc_abc_warehouse_stock",
    sourceRecordId: "00028",
    supplier: "Garrison Brothers Distillery",
    name: "Garrison Brothers Small Batch Bourbon",
    category: "Bourbon",
    proof: 94,
    size: ".75L",
    sourceUrl: "https://abc2.nc.gov/StoresBoards/Stocks",
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });
  complete.identityKey = truncated.identityKey;

  const merged = mergeCatalogRecords([truncated, complete]);

  assert.equal(merged[0].name, "Garrison Brothers Small Batch Bourbon");
  assert.equal(merged[0].sourceRefs.length, 2);
  assert.equal(merged[0].prices.length, 1);
});

test("canonical merge collapses the same bottle across source naming variants", () => {
  const variants = [
    {
      id: "idaho",
      identityKey: "idaho|21242",
      name: "1792 Sweet Wheat",
      category: "Bourbon",
      proof: 91.2,
      age: "Unknown",
      producer: "",
      size: "750ml",
      sourceRefs: [{ sourceId: "idaho_liquor_price_book", sourceRecordId: "21242" }],
      prices: [{ sourceId: "idaho_liquor_price_book", region: "ID", retailPrice: 41.99, size: "750ml", retrievedAt: "2026-05-28" }]
    },
    {
      id: "iowa",
      identityKey: "iowa|21242",
      name: "1792 Sweet Wheat Bourbon",
      category: "Bourbon",
      proof: 91,
      age: "NAS",
      producer: "Sazerac Company Inc",
      size: "750ml",
      sourceRefs: [{ sourceId: "iowa_abd_products", sourceRecordId: "21242" }],
      prices: [{ sourceId: "iowa_abd_products", region: "IA", retailPrice: 30, size: "750ml", retrievedAt: "2026-05-28" }]
    },
    {
      id: "olcc",
      identityKey: "olcc|99900339875",
      name: "1792 Sweet Wheat Bourbon 8 Yr",
      category: "Bourbon",
      proof: 91.2,
      age: "8 years",
      ageYears: 8,
      producer: "",
      size: "750ml",
      sourceRefs: [{ sourceId: "olcc_monthly_pricing", sourceRecordId: "99900339875" }],
      prices: [{ sourceId: "olcc_monthly_pricing", region: "OR", retailPrice: 42.95, size: "750ml", retrievedAt: "2026-05-28" }]
    },
    {
      id: "pa",
      identityKey: "pa|000034657",
      name: "1792 Sweet Wheat Straight Bourbon",
      category: "Wheated Bourbon",
      proof: 91,
      age: "Unknown",
      producer: "",
      size: "750ml",
      sourceRefs: [{ sourceId: "pa_lcb_wholesale_spirits_catalog", sourceRecordId: "000034657:750ml" }],
      prices: [{ sourceId: "pa_lcb_wholesale_spirits_catalog", region: "PA", retailPrice: 39.99, size: "750ml", retrievedAt: "2026-05-28" }]
    }
  ];

  const merged = mergeCatalogRecords(variants);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].name, "1792 Sweet Wheat Straight Bourbon");
  assert.equal(merged[0].producer, "Sazerac Company Inc");
  assert.equal(merged[0].category, "Wheated Bourbon");
  assert.equal(merged[0].age, "8 years");
  assert.equal(merged[0].sourceRefs.length, 4);
  assert.equal(merged[0].prices.length, 4);
  assert.equal(makeCanonicalIdentityKey(merged[0]), "1792 sweet wheat|750ml|wheated");
});

test("canonical merge does not collapse premium age rows into the regular shelf bottle", () => {
  const aged = normalizeImportedRecord({
    sourceId: "wyoming_liquor_division",
    sourceRecordId: "921518:750ml",
    supplier: "Sazerac Company Inc",
    name: "Buffalo Trace 18 Year Kentucky Straight Bourbon Whiskey",
    category: "Bourbon",
    age: "18 years",
    ageYears: 18,
    proof: 90,
    size: ".75L",
    retailPrice: "$6.15"
  });
  const regular = normalizeImportedRecord({
    sourceId: "ohlq_brand_master",
    sourceRecordId: "1499B",
    supplier: "Sazerac Company Inc",
    name: "Buffalo Trace Kentucky Straight Bourbon Whiskey",
    category: "Bourbon",
    proof: 90,
    size: ".75L",
    retailPrice: "$26.99"
  });

  const merged = mergeCatalogRecords([aged, regular]);

  assert.equal(merged.length, 2);
  assert.deepEqual(merged.map((record) => record.name).sort(), [
    "Buffalo Trace 18 Year Kentucky Straight Bourbon Whiskey",
    "Buffalo Trace Kentucky Straight Bourbon Whiskey"
  ]);
});

test("release-family merge collapses George T. Stagg state-list variants", () => {
  const variants = [
    {
      id: "idaho",
      identityKey: "idaho|18416",
      name: "George T Stagg (Antique)",
      category: "Bourbon",
      proof: 125,
      size: "750ml",
      sourceRefs: [{ sourceId: "idaho_liquor_price_book", sourceRecordId: "18416" }],
      prices: [{ sourceId: "idaho_liquor_price_book", region: "ID", retailPrice: 149.99, size: "750ml", retrievedAt: "2026-05-28" }]
    },
    {
      id: "iowa",
      identityKey: "iowa|902684",
      name: "George T Stagg",
      category: "Bourbon",
      proof: 139,
      producer: "Sazerac Company Inc",
      size: "750ml",
      sourceRefs: [{ sourceId: "iowa_abd_products", sourceRecordId: "902684" }],
      prices: [{ sourceId: "iowa_abd_products", region: "IA", retailPrice: 150, size: "750ml", retrievedAt: "2026-05-28" }]
    },
    {
      id: "pa",
      identityKey: "pa|000006804",
      name: "George T Stagg Straight Bourbon Barrel Proof",
      category: "Bourbon",
      size: "750ml",
      aliases: ["091882068042"],
      sourceRefs: [{ sourceId: "pa_lcb_wholesale_spirits_catalog", sourceRecordId: "000006804:750ml" }],
      prices: [{ sourceId: "pa_lcb_wholesale_spirits_catalog", region: "PA", retailPrice: 149.99, size: "750ml", retrievedAt: "2026-05-28" }]
    }
  ];

  const merged = mergeCatalogRecords(variants);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].sourceRefs.length, 3);
  assert.deepEqual(merged[0].proofs, [125, 139]);
  assert.equal(merged[0].proof, 139);
});

test("barcode merge does not collapse unrelated private-barrel records", () => {
  const variants = [
    {
      id: "devils-river",
      identityKey: "devils-river|750ml|123",
      name: "BP Devils River Single Barrel Bourbon",
      category: "Bourbon",
      proof: 123,
      size: "750ml",
      upc: "96749005390",
      barcodes: ["96749005390"],
      sourceRefs: [{ sourceId: "iowa_abd_products", sourceRecordId: "17648" }],
      prices: [{ sourceId: "iowa_abd_products", region: "IA", retailPrice: 48.74, size: "750ml", retrievedAt: "2026-05-28" }]
    },
    {
      id: "larceny",
      identityKey: "larceny|750ml|92",
      name: "Larceny 92 Proof Private Barrel Buy The Barrel",
      category: "Bourbon",
      proof: 92,
      size: "750ml",
      upc: "96749005390",
      barcodes: ["96749005390"],
      sourceRefs: [{ sourceId: "iowa_abd_products", sourceRecordId: "918862" }],
      prices: [{ sourceId: "iowa_abd_products", region: "IA", retailPrice: 22.5, size: "750ml", retrievedAt: "2026-05-28" }]
    }
  ];

  const merged = mergeCatalogRecords(variants);

  assert.equal(merged.length, 2);
  assert.deepEqual(merged.map((record) => record.name).sort(), [
    "BP Devils River Single Barrel Bourbon",
    "Larceny 92 Proof Private Barrel Buy The Barrel"
  ]);
});

const catalog = require("../src/logic/catalog.js");

test("name normalization unifies spellings while keeping ages distinct", () => {
  const norm = catalog.normalizeProductNameForMerge;
  // every spelling of ER10 lands on one key…
  assert.equal(norm("Eagle Rare 10 Year Old Bourbon"), norm("Eagle Rare 10Y"));
  assert.equal(norm("Eagle Rare 10YR Kentucky Straight Bourbon Whiskey 750ml"), norm("Eagle Rare 10Y"));
  assert.equal(norm("Eagle Rare Aged 10 Years"), norm("Eagle Rare 10Y"));
  // …and ER17 stays a different bottle
  assert.notEqual(norm("Eagle Rare 17 Year"), norm("Eagle Rare 10 Year"));
  // abbreviations expand
  assert.equal(norm("Knob Creek Bbn 12YR"), norm("Knob Creek Bourbon 12 Year"));
  assert.equal(norm("Four Roses Small Batch Bourb"), norm("Four Roses Small Batch Bourbon"));
  // product-name numbers are untouched
  assert.notEqual(norm("Old Forester 1920"), norm("Old Forester 1910"));
  assert.ok(norm("Old Forester 1920").includes("1920"));
});

test("mergeCatalogRecords tracks members so retired ids can be aliased", () => {
  const records = [
    { name: "Eagle Rare 10 Year", supplier: "Sazerac", category: "Bourbon", proof: "90", size: ".75L", retailPrice: "40", sourceId: "nc_abc", sourceRecordId: "1" },
    { name: "Eagle Rare 10Y", supplier: "Sazerac", category: "Bourbon", proof: "90", size: ".75L", retailPrice: "42", sourceId: "ohlq_brand_master", sourceRecordId: "2" }
  ];
  const merged = catalog.mergeCatalogRecords(records);
  assert.equal(merged.length, 1, "spelling variants merge");
  assert.equal(merged[0].members.length, 2);
  const memberIds = merged[0].members.map((member) => member.id);
  assert.ok(memberIds.length === new Set(memberIds).size, "member ids unique");
});
