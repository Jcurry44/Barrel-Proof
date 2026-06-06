const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  buildImportPayload,
  cleanProductName,
  normalizeSizeMl,
  parseUtahDabsRows,
  parseWorksheetXml,
  titleCaseProductName
} = require("../tools/import-utah-dabs.js");
const { buildAppCatalogPayload } = require("../tools/build-imported-catalog.js");

test("Utah DABS importer keeps serious whiskey rows by default", () => {
  const xml = fs.readFileSync(path.join(__dirname, "fixtures", "utah-dabs-sheet.xml"), "utf8");
  const rows = parseUtahDabsRows(parseWorksheetXml(xml), {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].csc, "016096");
  assert.equal(rows[0].name, "Evan Williams BIB White Label");
  assert.equal(rows[0].size, "750ml");
  assert.equal(rows[0].retailPrice, 19.99);
  assert.equal(rows[0].itemStatusLabel, "General distribution product");
  assert.equal(rows[0].vendorName, "Heaven Hill Sales Co.");
  assert.equal(rows[0].className, "WHISKEY - BOURBON & TENNESSEE");
  assert.equal(rows[0].category, "Bottled in Bond Bourbon");
});

test("Utah DABS importer keeps rye, Scotch, Canadian, Irish, Tennessee, and world whisky", () => {
  const rows = parseUtahDabsRows([
    ["CSC", "Description", "Class", "Class name", "Size", "Retail Price", "Item Status", "On Spa", "Vendor Name", "Vendor Cd", "Div", "Dept", "Div Name", "Dept Name"],
    ["016096", "EVAN WILLIAMS BIB WHITE LABEL      750ml", "AWH", "WHISKEY - BOURBON & TENNESSEE", "750", "$19.99", "1", "", "HEAVEN HILL SALES CO.", "100", "01", "10", "SPIRITS", "WHISKEY"],
    ["019200", "HIGH WEST DOUBLE RYE 750ml", "AWU", "WHISKEY - RYE", "750", "$39.99", "L", "", "HIGH WEST", "101", "01", "10", "SPIRITS", "WHISKEY"],
    ["001435", "PENDLETON 20 YR DIRECTOR'S RESERVE 750ml", "AWB", "WHISKEY - CANADIAN", "750", "$199.99", "L", "", "HOOD RIVER DISTILLERS", "102", "01", "10", "SPIRITS", "WHISKEY"],
    ["004096", "ARDBEG 10 YR SM SCOTCH 750ml", "AWS", "WHISKEY - SCOTCH SINGLE MALT", "750", "$62.99", "1", "", "MOET HENNESSY", "103", "01", "10", "SPIRITS", "WHISKEY"],
    ["007001", "REDBREAST 12YR IRISH WHISKEY 750ml", "AWN", "WHISKEY - IRISH", "750", "$74.99", "1", "", "PERNOD RICARD", "104", "01", "10", "SPIRITS", "WHISKEY"],
    ["008001", "THE TOTTORI JAPANESE WHISKY 750ml", "AWX", "WHISKEY - MISC IMPORTED", "750", "$46.55", "S", "", "BENCHMARK", "105", "01", "10", "SPIRITS", "WHISKEY"],
    ["000804", "JACK DANIELS SINATRA 1000ml", "AWH", "WHISKEY - BOURBON & TENNESSEE", "1000", "$159.99", "L", "", "BROWN FORMAN", "106", "01", "10", "SPIRITS", "WHISKEY"]
  ], {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });

  assert.deepEqual(rows.map((row) => row.category), [
    "Bottled in Bond Bourbon",
    "Rye Whiskey",
    "Canadian Whisky",
    "Scotch Whisky",
    "Irish Whiskey",
    "Japanese Whisky",
    "Tennessee Whiskey"
  ]);
});

test("Utah DABS importer rejects flavored whiskey rows", () => {
  const rows = parseUtahDabsRows([
    ["CSC", "Description", "Class", "Class name", "Size", "Retail Price", "Item Status", "On Spa", "Vendor Name", "Vendor Cd", "Div", "Dept", "Div Name", "Dept Name"],
    ["100001", "SKREWBALL PEANUT BUTTER WHISKEY 750ml", "AWT", "WHISKEY - FLAVORED", "750", "$29.99", "1", "", "SKREWBALL", "200", "01", "10", "SPIRITS", "WHISKEY"],
    ["100002", "CROWN ROYAL APPLE 750ml", "AWT", "WHISKEY - FLAVORED", "750", "$26.99", "1", "", "DIAGEO", "201", "01", "10", "SPIRITS", "WHISKEY"],
    ["100003", "FOUND NORTH BATCH 9 19YR 750ml", "AWB", "WHISKEY - CANADIAN", "750", "$165.00", "S", "", "PARK STREET IMPORTS", "202", "01", "10", "SPIRITS", "WHISKEY"]
  ], {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });

  assert.deepEqual(rows.map((row) => row.csc), ["100003"]);
  assert.equal(rows[0].category, "Canadian Whisky");
});

test("Utah DABS size, name, and title cleanup are stable", () => {
  assert.equal(normalizeSizeMl("1750"), "1.75L");
  assert.equal(normalizeSizeMl("1000"), "1L");
  assert.equal(
    cleanProductName("EVAN WILLIAMS BIB WHITE LABEL      750ml", "750ml"),
    "Evan Williams BIB White Label"
  );
  assert.equal(cleanProductName("1792 SMALL BATCH 750ml", "750ml"), "1792 Small Batch");
  assert.equal(titleCaseProductName("HEAVEN HILL SALES CO."), "Heaven Hill Sales Co.");
});

test("Utah DABS payload becomes source-backed app catalog data", () => {
  const xml = fs.readFileSync(path.join(__dirname, "fixtures", "utah-dabs-sheet.xml"), "utf8");
  const rows = parseUtahDabsRows(parseWorksheetXml(xml), {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });
  const payload = buildImportPayload(rows, "2026-05-28T00:00:00.000Z");
  const appCatalog = buildAppCatalogPayload([payload], "2026-05-28T00:00:00.000Z");

  assert.equal(payload.rawRecordCount, 1);
  assert.equal(payload.bottleCount, 1);
  assert.equal(appCatalog.bottles[0].id.startsWith("utah-dabs-"), true);
  assert.equal(appCatalog.bottles[0].sourceRetailPrice, 19.99);
  assert.equal(appCatalog.bottles[0].sourcePriceLabel, "Utah DABS retail");
  assert.equal(appCatalog.bottles[0].sourceRefs[0].sourceId, "utah_dabs_product_list");
});
