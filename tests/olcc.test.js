const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  buildImportPayload,
  normalizeOlccSize,
  parseOlccAge,
  parseOlccMonthlyPricingCsv,
  titleCaseProductName
} = require("../tools/import-olcc.js");
const { buildAppCatalogPayload } = require("../tools/build-imported-catalog.js");

test("OLCC importer keeps latest serious whiskey rows by default", () => {
  const csv = fs.readFileSync(path.join(__dirname, "fixtures", "olcc-monthly-pricing-snippet.csv"), "utf8");
  const rows = parseOlccMonthlyPricingCsv(csv, {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });

  assert.deepEqual(rows.map((row) => row.itemCode), ["0134B", "0210B", "0500B"]);
  assert.equal(rows[0].itemCode, "0134B");
  assert.equal(rows[0].asOfDate, "07/01/2024");
  assert.equal(rows[0].name, "Russells Reserve 10 Year Old Bourbon");
  assert.equal(rows[0].category, "Bourbon");
  assert.equal(rows[0].size, "750ml");
  assert.equal(rows[0].age, "10 years");
  assert.equal(rows[0].proof, 90);
  assert.equal(rows[0].pricePerBottle, 44.95);
  assert.equal(rows[1].category, "Rye Whiskey");
  assert.equal(rows[2].category, "Irish Whiskey");
});

test("OLCC importer still supports bourbon-only price history", () => {
  const csv = fs.readFileSync(path.join(__dirname, "fixtures", "olcc-monthly-pricing-snippet.csv"), "utf8");
  const rows = parseOlccMonthlyPricingCsv(csv, {
    mode: "bourbon",
    latestOnly: false,
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });

  assert.deepEqual(rows.map((row) => row.asOfDate), ["06/01/2024", "07/01/2024"]);
});

test("OLCC importer rejects flavored whiskey while keeping Found North-style Canadian whisky", () => {
  const csv = [
    "AsOfDate,ItemCode,ExtendedItemCode,Description,OregonProduct,ItemStatus,ItemStatusCode,Category,NewItem,SpecialPricing,Size,Age,Proof,PricePerBottle,BottlesPerCase,PricePerCase,PriceChange",
    "07/01/2024,12250B,99901225075,FOUND NORTH BATCH 9 19YR,,Special Order,S,CANADIAN,true,,750 ML,,125,165,6,990,0",
    "07/01/2024,9001B,99900900175,CROWN ROYAL APPLE,,Regular,R,CANADIAN,,,750 ML,,70,26.95,12,323.4,0",
    "07/01/2024,9002B,99900900275,SKREWBALL PEANUT BUTTER WHISKEY,,Regular,R,DOMESTIC WHISKEY,,,750 ML,,70,29.95,12,359.4,0",
    "07/01/2024,9003B,99900900375,HARD TIMES APPLESHINE MOON SHINE,,Regular,R,DOMESTIC WHISKEY,,,750 ML,,80,19.95,12,239.4,0"
  ].join("\n");
  const rows = parseOlccMonthlyPricingCsv(csv, {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });

  assert.deepEqual(rows.map((row) => row.itemCode), ["12250B"]);
  assert.equal(rows[0].category, "Canadian Whisky");
});

test("OLCC importer fixes noisy source categories for world and wheated whiskey", () => {
  const csv = [
    "AsOfDate,ItemCode,ExtendedItemCode,Description,OregonProduct,ItemStatus,ItemStatusCode,Category,NewItem,SpecialPricing,Size,Age,Proof,PricePerBottle,BottlesPerCase,PricePerCase,PriceChange",
    "07/01/2024,1165B,99900116575,AMRUT SINGLE MALT WHISKEY,,Regular,R,SCOTCH,,,750 ML,,92,79.95,6,479.7,0",
    "07/01/2024,6374B,99900637475,WELLER FULL PROOF,,Regular,R,DOMESTIC WHISKEY,,,750 ML,,114,55.95,6,335.7,0"
  ].join("\n");
  const rows = parseOlccMonthlyPricingCsv(csv, {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });

  assert.equal(rows[0].category, "Single Malt / World Whisky");
  assert.equal(rows[1].category, "Wheated Bourbon");
});

test("OLCC size, age, and title cleanup are stable", () => {
  assert.equal(normalizeOlccSize("750 ML"), "750ml");
  assert.deepEqual(parseOlccAge("7 YRS"), { raw: "7 YRS", label: "7 years", years: 7 });
  assert.equal(titleCaseProductName("OLD EZRA 7 YEAR 101 PROOF BOURBON"), "Old Ezra 7 Year 101 Proof Bourbon");
});

test("OLCC payload becomes source-backed app catalog data", () => {
  const csv = fs.readFileSync(path.join(__dirname, "fixtures", "olcc-monthly-pricing-snippet.csv"), "utf8");
  const rows = parseOlccMonthlyPricingCsv(csv, {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });
  const payload = buildImportPayload(rows, "2026-05-28T00:00:00.000Z");
  const appCatalog = buildAppCatalogPayload([payload], "2026-05-28T00:00:00.000Z");

  assert.equal(payload.rawRecordCount, 3);
  assert.equal(payload.asOfDates[0], "07/01/2024");
  const russells = appCatalog.bottles.find((bottle) => bottle.name === "Russells Reserve 10 Year Old Bourbon");
  assert.ok(russells);
  assert.equal(russells.id.startsWith("olcc-"), true);
  assert.equal(russells.sourceRetailPrice, 44.95);
  assert.equal(russells.sourcePriceLabel, "OLCC retail");
});
