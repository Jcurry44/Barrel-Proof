const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildImportPayload,
  includeRow,
  normalizeDate,
  normalizeSize,
  parseMississippiText
} = require("../tools/import-mississippi-abc.js");
const { buildAppCatalogPayload } = require("../tools/build-imported-catalog.js");

test("Mississippi ABC importer parses SPA bourbon bottle-cost rows", () => {
  const rows = parseMississippiText(
    "WHISKEY - STR BOURBON 21239 1792 SMALL BATCH 1.75L 3 5/1/2026 138.44 108.44 30.00 False 46.15 36.15 0.00",
    {
      documentType: "spa",
      sourceFile: "data/raw/mississippi-abc/text/may-2026-spas.txt",
      retrievedAt: "2026-05-28T00:00:00.000Z"
    }
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].itemCode, "21239");
  assert.equal(rows[0].name, "1792 Small Batch");
  assert.equal(rows[0].category, "Bourbon");
  assert.equal(rows[0].size, "1.75L");
  assert.equal(rows[0].price, 36.15);
  assert.equal(rows[0].bottleCost, 46.15);
  assert.equal(rows[0].spaBottleCost, 36.15);
});

test("Mississippi ABC importer parses price-change bottle-cost rows", () => {
  const rows = parseMississippiText(
    "WHISKEY - STR BOURBON 16580 BAKER'S STRAIGHT BOURBON 750ml 6 5/1/2026 230.72 -0.04 False 38.46 0.00 0.00 Bailment",
    {
      documentType: "price_change",
      sourceFile: "data/raw/mississippi-abc/text/may-2026-bailment-price-changes.txt",
      retrievedAt: "2026-05-28T00:00:00.000Z"
    }
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "Baker's Straight Bourbon");
  assert.equal(rows[0].price, 38.46);
  assert.equal(rows[0].bottleCost, 38.46);
  assert.equal(rows[0].bottlePriceChange, 0);
  assert.equal(rows[0].statusIndicator, "Bailment");
});

test("Mississippi ABC helpers normalize dates and sizes", () => {
  assert.equal(normalizeDate("5/1/2026"), "2026-05-01");
  assert.equal(normalizeSize("750ml"), "750ml");
  assert.equal(normalizeSize("1.00L"), "1L");
});

test("Mississippi ABC payload becomes source-backed app catalog data", () => {
  const rows = parseMississippiText(
    [
      "WHISKEY - STR BOURBON 21239 1792 SMALL BATCH 1.75L 3 5/1/2026 138.44 108.44 30.00 False 46.15 36.15 0.00",
      "CABERNET SAUVIGNON 445073 BOURBON BARREL AGED CABERNET 750ml 12 5/1/2026 110.33 8.56 False 9.19 0.71 0.00 Bailment",
      "WHISKEY - RYE 27189 BASIL HAYDEN'S DARK RYE WHISKEY 750ml 6 5/1/2026 207.65 193.80 13.85 False 34.61 32.30 0.00"
    ].join("\n"),
    {
      documentType: "spa",
      sourceFile: "data/raw/mississippi-abc/text/may-2026-spas.txt",
      retrievedAt: "2026-05-28T00:00:00.000Z"
    }
  ).filter((row) => includeRow(row, "bourbon"));
  const payload = buildImportPayload(rows, "2026-05-28T00:00:00.000Z", 3, ["data/raw/mississippi-abc/text/may-2026-spas.txt"]);
  const appCatalog = buildAppCatalogPayload([payload], "2026-05-28T00:00:00.000Z");

  assert.equal(payload.rawRecordCount, 3);
  assert.equal(payload.bottleCount, 1);
  assert.equal(appCatalog.bottles[0].id.startsWith("mississippi-abc-"), true);
  assert.equal(appCatalog.bottles[0].sourceRetailPrice, 36.15);
  assert.equal(appCatalog.bottles[0].sourcePriceLabel, "MS ABC bottle cost");
});
