const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  buildImportPayload,
  normalizeIowaSize,
  parseIowaAbdProductsJson,
  parseIowaAge,
  titleCaseProductName
} = require("../tools/import-iowa-abd.js");
const { buildAppCatalogPayload } = require("../tools/build-imported-catalog.js");

test("Iowa ABD importer keeps serious whiskey rows by default", () => {
  const json = fs.readFileSync(path.join(__dirname, "fixtures", "iowa-abd-products-snippet.json"), "utf8");
  const rows = parseIowaAbdProductsJson(json, {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });

  assert.deepEqual(rows.map((row) => row.itemNumber), ["16086"]);
  assert.equal(rows[0].name, "Early Times Bottled In Bond");
  assert.equal(rows[0].categoryName, "BOTTLED IN BOND BOURBON");
  assert.equal(rows[0].category, "Bottled in Bond Bourbon");
  assert.equal(rows[0].size, "1L");
  assert.equal(rows[0].proof, 100);
  assert.equal(rows[0].upc, "81128001773");
  assert.equal(rows[0].stateBottleRetail, 19.5);
});

test("Iowa ABD importer rejects whiskey liqueurs and gift packs", () => {
  const json = fs.readFileSync(path.join(__dirname, "fixtures", "iowa-abd-products-snippet.json"), "utf8");
  const rows = parseIowaAbdProductsJson(json, {
    mode: "whiskey",
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });

  assert.deepEqual(rows.map((row) => row.itemNumber), ["16086"]);
});

test("Iowa ABD importer keeps rye, Scotch, Canadian, and Irish retail rows", () => {
  const json = JSON.stringify([
    {
      itemno: "200001",
      category_name: "STRAIGHT RYE WHISKIES",
      im_desc: "SAGAMORE SPIRIT CASK STRENGTH RYE WHISKEY",
      bottle_volume_ml: "750",
      proof: "112",
      state_bottle_retail: "59.99"
    },
    {
      itemno: "200002",
      category_name: "SINGLE MALT SCOTCH",
      im_desc: "ARDBEG UIGEADAIL",
      bottle_volume_ml: "750",
      proof: "108.4",
      state_bottle_retail: "94.99"
    },
    {
      itemno: "200003",
      category_name: "CANADIAN WHISKIES",
      im_desc: "CROWN ROYAL VANILLA",
      bottle_volume_ml: "750",
      proof: "70",
      state_bottle_retail: "27.99"
    },
    {
      itemno: "200004",
      category_name: "IRISH WHISKIES",
      im_desc: "REDBREAST 12YR",
      bottle_volume_ml: "750",
      proof: "80",
      state_bottle_retail: "74.99"
    }
  ]);
  const rows = parseIowaAbdProductsJson(json, {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });

  assert.deepEqual(rows.map((row) => row.itemNumber), ["200001", "200002", "200004"]);
  assert.deepEqual(rows.map((row) => row.category), ["Rye Whiskey", "Scotch Whisky", "Irish Whiskey"]);
});

test("Iowa ABD size, age, and title cleanup are stable", () => {
  assert.equal(normalizeIowaSize("1750"), "1.75L");
  assert.equal(normalizeIowaSize("1000"), "1L");
  assert.deepEqual(parseIowaAge("7"), { label: "7 years", years: 7 });
  assert.deepEqual(parseIowaAge("0"), { label: "NAS", years: null });
  assert.equal(titleCaseProductName("MAKER'S MARK BOURBON W/GLASSES"), "Maker's Mark Bourbon W/Glasses");
});

test("Iowa ABD importer strips allocation prefixes from display names", () => {
  const json = JSON.stringify([
    {
      itemno: "902684",
      category_name: "STRAIGHT BOURBON WHISKIES",
      im_desc: "HA GEORGE T STAGG",
      bottle_volume_ml: "750",
      proof: "139",
      state_bottle_retail: "112.50"
    }
  ]);
  const rows = parseIowaAbdProductsJson(json, {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });

  assert.equal(rows[0].name, "George T Stagg");
});

test("Iowa ABD importer strips source administration markers from display names", () => {
  const json = JSON.stringify([
    {
      itemno: "17648",
      category_name: "SINGLE BARREL BOURBON WHISKIES",
      im_desc: "BP DEVILS RIVER SINGLE BARREL BOURBON",
      bottle_volume_ml: "750",
      proof: "123",
      state_bottle_retail: "48.74"
    },
    {
      itemno: "975987",
      category_name: "STRAIGHT RYE WHISKIES",
      im_desc: "1932 OG RYE USE CODE 75987",
      bottle_volume_ml: "750",
      proof: "95",
      state_bottle_retail: "37.50"
    },
    {
      itemno: "921626",
      category_name: "STRAIGHT BOURBON WHISKIES",
      im_desc: "13TH CENTURY STRAIGHT BOURBON DNO",
      bottle_volume_ml: "750",
      proof: "132",
      state_bottle_retail: "99.99"
    },
    {
      itemno: "999931",
      category_name: "SINGLE MALT SCOTCH",
      im_desc: "AMRUT BAGHEEERA SINGLE MALT WHISKY DISCO",
      bottle_volume_ml: "750",
      proof: "92",
      state_bottle_retail: "75.00"
    }
  ]);
  const rows = parseIowaAbdProductsJson(json, {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });

  assert.deepEqual(rows.map((row) => row.name), [
    "Devils River Single Barrel Bourbon",
    "1932 OG Rye",
    "13th Century Straight Bourbon",
    "Amrut Bagheeera Single Malt Whisky"
  ]);
});

test("Iowa ABD importer rejects ingredient-only whiskey rows", () => {
  const json = JSON.stringify([
    {
      itemno: "810000",
      category_name: "BLENDED WHISKIES",
      im_desc: "INGREDIENT CATS EYE DISTILLERY OBTAINIUM WHISKEY",
      bottle_volume_ml: "750",
      proof: "0",
      state_bottle_retail: "14.25"
    }
  ]);
  const rows = parseIowaAbdProductsJson(json, {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });

  assert.equal(rows.length, 0);
});

test("Iowa ABD payload preserves UPC-backed source data", () => {
  const json = fs.readFileSync(path.join(__dirname, "fixtures", "iowa-abd-products-snippet.json"), "utf8");
  const rows = parseIowaAbdProductsJson(json, {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });
  const payload = buildImportPayload(rows, "2026-05-28T00:00:00.000Z");
  const appCatalog = buildAppCatalogPayload([payload], "2026-05-28T00:00:00.000Z");

  assert.equal(payload.rawRecordCount, 1);
  assert.equal(payload.bottleCount, 1);
  assert.equal(appCatalog.bottles[0].id.startsWith("iowa-abd-"), true);
  assert.equal(appCatalog.bottles[0].sourcePriceLabel, "Iowa ABD retail");
  assert.equal(appCatalog.bottles[0].sourceRefs[0].sourceId, "iowa_abd_products");
});
