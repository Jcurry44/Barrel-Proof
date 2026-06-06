const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildImportPayload,
  normalizeSize,
  parseTexasTabcJson
} = require("../tools/import-texas-tabc.js");
const { buildAppCatalogPayload } = require("../tools/build-imported-catalog.js");

test("Texas TABC importer keeps clean bourbon label rows", () => {
  const rows = parseTexasTabcJson([
    {
      tabc_certificate_number: "1103522",
      permit_license_number: "S19953",
      brand_name: "BLANTON'S STRAIGHT FROM THE BARREL BOURBON WHISKEY",
      type: "SPIRITS",
      approval_date: "2020-12-14T00:00:00.000",
      trade_name: "SAZERAC COMPANY INC.",
      alcohol_content_by_volume: "65.15",
      ttb_number: "20238001000168",
      file_link: { url: "https://storage.googleapis.com/tabc-public-labels/example.pdf" }
    }
  ], {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  }).filter((row) => row && require("../tools/import-texas-tabc.js").includeRow(row, "bourbon"));

  assert.equal(rows.length, 1);
  assert.equal(rows[0].tabcCertificateNumber, "1103522");
  assert.equal(rows[0].name, "Blanton's Straight From The Barrel Bourbon Whiskey");
  assert.equal(rows[0].category, "Bourbon");
  assert.equal(rows[0].abv, 65.15);
  assert.equal(rows[0].proof, 130.3);
  assert.equal(rows[0].ttbNumber, "20238001000168");
});

test("Texas TABC importer rejects non-bourbon and flavored false positives", () => {
  const rows = parseTexasTabcJson([
    {
      tabc_certificate_number: "1",
      brand_name: "KAVALAN EX-BOURBON CASK WHISKY CASK STRE",
      type: "SPIRITS",
      alcohol_content_by_volume: "57.8"
    },
    {
      tabc_certificate_number: "2",
      brand_name: "1835 CHERRY FLAVORED BOURBON WHISKEY",
      type: "SPIRITS",
      alcohol_content_by_volume: "35"
    },
    {
      tabc_certificate_number: "3",
      brand_name: "NEW RIFF BOTTLED IN BOND RYE",
      type: "SPIRITS",
      alcohol_content_by_volume: "50"
    }
  ], {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  }).filter((row) => row && require("../tools/import-texas-tabc.js").includeRow(row, "bourbon"));

  assert.equal(rows.length, 0);
});

test("Texas TABC importer keeps serious Tennessee whiskey", () => {
  const rows = parseTexasTabcJson([
    {
      tabc_certificate_number: "4",
      brand_name: "GEORGE DICKEL BOTTLED IN BOND TENNESSEE WHISKY",
      type: "SPIRITS",
      alcohol_content_by_volume: "50",
      trade_name: "DIAGEO NORTH AMERICA INC"
    }
  ], {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  }).filter((row) => row && require("../tools/import-texas-tabc.js").includeRow(row, "bourbon"));

  assert.equal(rows.length, 1);
  assert.equal(rows[0].category, "Tennessee Whiskey");
  assert.equal(rows[0].proof, 100);
});

test("Texas TABC importer can widen to serious whiskey beyond bourbon", () => {
  const rows = parseTexasTabcJson([
    {
      tabc_certificate_number: "5",
      brand_name: "NEW RIFF BOTTLED IN BOND RYE",
      type: "SPIRITS",
      alcohol_content_by_volume: "50"
    },
    {
      tabc_certificate_number: "6",
      brand_name: "KAVALAN EX-BOURBON CASK WHISKY CASK STRENGTH",
      type: "SPIRITS",
      alcohol_content_by_volume: "57.8"
    },
    {
      tabc_certificate_number: "7",
      brand_name: "FOUND NORTH BATCH 001",
      type: "SPIRITS",
      alcohol_content_by_volume: "61.2"
    },
    {
      tabc_certificate_number: "8",
      brand_name: "JACK DANIEL'S TENNESSEE HONEY",
      type: "SPIRITS",
      alcohol_content_by_volume: "35"
    }
  ], {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  }).filter((row) => row && require("../tools/import-texas-tabc.js").includeRow(row, "american"));

  assert.deepEqual(rows.map((row) => row.category), [
    "Rye Whiskey",
    "Single Malt / World Whisky",
    "Canadian Whisky"
  ]);
});

test("Texas TABC helpers normalize sizes", () => {
  assert.equal(normalizeSize("750 ML"), "750ml");
  assert.equal(normalizeSize("1.75L"), "1.75L");
});

test("Texas TABC payload becomes label-registration app catalog data", () => {
  const rows = parseTexasTabcJson([
    {
      tabc_certificate_number: "1103522",
      brand_name: "BLANTON'S STRAIGHT FROM THE BARREL BOURBON WHISKEY",
      type: "SPIRITS",
      approval_date: "2020-12-14T00:00:00.000",
      trade_name: "SAZERAC COMPANY INC.",
      alcohol_content_by_volume: "65.15",
      ttb_number: "20238001000168"
    }
  ], {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  }).filter((row) => row && require("../tools/import-texas-tabc.js").includeRow(row, "bourbon"));
  const payload = buildImportPayload(rows, "2026-05-28T00:00:00.000Z", rows.length);
  const appCatalog = buildAppCatalogPayload([payload], "2026-05-28T00:00:00.000Z");

  assert.equal(payload.bottleCount, 1);
  assert.equal(appCatalog.bottles[0].id.startsWith("tabc-"), true);
  assert.equal(appCatalog.bottles[0].sourceRetailPrice, null);
  assert.equal(appCatalog.bottles[0].sourcePriceLabel, "No retail price in TABC registry");
  assert.equal(appCatalog.bottles[0].labelApprovals[0].tabcCertificateNumber, "1103522");
});
