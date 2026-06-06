const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  buildImportPayload,
  normalizeOuncesToSize,
  parseOhlqBrandMasterJson,
  titleCaseProductName
} = require("../tools/import-ohlq.js");
const { buildAppCatalogPayload } = require("../tools/build-imported-catalog.js");

test("OHLQ importer keeps serious whiskey rows by default", () => {
  const json = fs.readFileSync(path.join(__dirname, "fixtures", "ohlq-brandmaster-snippet.json"), "utf8");
  const rows = parseOhlqBrandMasterJson(json, {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });

  assert.equal(rows.length, 2);
  assert.equal(rows[0].ohlqCode, "0014B");
  assert.equal(rows[0].name, "Ancient Age");
  assert.equal(rows[0].category, "Bourbon");
  assert.equal(rows[0].size, "750ml");
  assert.equal(rows[0].retailPrice, 12.99);
});

test("OHLQ importer still supports a bourbon-only mode", () => {
  const json = fs.readFileSync(path.join(__dirname, "fixtures", "ohlq-brandmaster-snippet.json"), "utf8");
  const rows = parseOhlqBrandMasterJson(json, {
    mode: "bourbon",
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });

  assert.deepEqual(rows.map((row) => row.ohlqCode), ["0014B"]);
});

test("OHLQ importer can widen to American whiskey", () => {
  const json = fs.readFileSync(path.join(__dirname, "fixtures", "ohlq-brandmaster-snippet.json"), "utf8");
  const rows = parseOhlqBrandMasterJson(json, {
    mode: "whiskey",
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });

  assert.deepEqual(rows.map((row) => row.ohlqCode), ["0014B", "0013B"]);
  assert.deepEqual(rows.map((row) => row.category), ["Bourbon", "Rye Whiskey"]);
});

test("OHLQ importer filters flavored whiskey while keeping serious finishes", () => {
  const json = JSON.stringify({
    data: [
      ["1000B", "A.M. SCOTT'S SINGLE BARREL HONEY BOURBON", "Whiskey", "American", "Bourbon", "25.40", "Active", "54.99", "51.69"],
      ["1001B", "STARLIGHT HONEY BARREL FINISHED RYE WHISKEY BTB", "Whiskey", "American", "Bourbon", "25.40", "Active", "74.99", "70.49"],
      ["1002B", "CREAM OF KENTUCKY SMALL BATCH BOURBON", "Whiskey", "American", "Bourbon", "25.40", "Active", "69.99", "65.79"],
      ["1003B", "FIREBALL CINNAMON WHISKY", "Whiskey", "Canadian", "Blend", "25.40", "Active", "12.99", "12.21"],
      ["1004B", "ARDBEG HEAVY VAPOURS", "Whiskey", "Scotch", "Single Malt", "25.40", "Active", "79.49", "74.72"]
    ]
  });
  const rows = parseOhlqBrandMasterJson(json, {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });

  assert.deepEqual(rows.map((row) => row.name), [
    "Starlight Honey Barrel Finished Rye Whiskey BTB",
    "Cream OF Kentucky Small Batch Bourbon",
    "Ardbeg Heavy Vapours"
  ]);
  assert.deepEqual(rows.map((row) => row.category), [
    "Rye Whiskey",
    "Bourbon",
    "Scotch Whisky"
  ]);
});

test("OHLQ size and title cleanup are stable", () => {
  assert.equal(normalizeOuncesToSize("25.40"), "750ml");
  assert.equal(normalizeOuncesToSize("59.20"), "1.75L");
  assert.equal(titleCaseProductName("OLD GRAND DAD 100"), "Old Grand Dad 100");
  assert.equal(titleCaseProductName("WILLETT FAMILY ESTATE 10YR BOURBON BTB"), "Willett Family Estate 10YR Bourbon BTB");
});

test("OHLQ payload becomes source-backed app catalog data", () => {
  const json = fs.readFileSync(path.join(__dirname, "fixtures", "ohlq-brandmaster-snippet.json"), "utf8");
  const rows = parseOhlqBrandMasterJson(json, {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });
  const payload = buildImportPayload(rows, "2026-05-28T00:00:00.000Z");
  const appCatalog = buildAppCatalogPayload([payload], "2026-05-28T00:00:00.000Z");

  assert.equal(payload.rawRecordCount, 2);
  assert.equal(payload.bottleCount, 2);
  assert.equal(appCatalog.bottles[0].id.startsWith("ohlq-"), true);
  assert.equal(appCatalog.bottles[0].sourceRetailPrice, 12.99);
  assert.equal(appCatalog.bottles[0].sourcePriceLabel, "OHLQ retail");
});
