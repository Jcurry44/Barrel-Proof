const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildImportPayload,
  cleanDisplayName,
  parsePackageDetails,
  parseWyomingLiquorJson
} = require("../tools/import-wyoming-liquor.js");
const { buildAppCatalogPayload } = require("../tools/build-imported-catalog.js");

test("Wyoming Liquor importer keeps clean bourbon and Tennessee whiskey rows", () => {
  const rows = parseWyomingLiquorJson({
    retrievedAt: "2026-05-28T00:00:00.000Z",
    products: [
      {
        itemId: "101",
        recordId: "563",
        name: "1792 Full Proof Kentucky Straight Bourbon 6Pk/750ML",
        productUrl: "https://liquor365.wyo.gov/1792-full-proof/563.p",
        availability: "In Stock",
        listPrice: 212.28
      },
      {
        itemId: "102",
        recordId: "564",
        name: "Jack Daniel's Bonded Tennessee Whiskey 6Pk/700ML",
        productUrl: "https://liquor365.wyo.gov/jack-daniels-bonded/564.p",
        availability: "OOS",
        listPrice: 185.94
      },
      {
        itemId: "103",
        recordId: "565",
        name: "New Riff Bottled in Bond Rye 6Pk/750ML",
        productUrl: "https://liquor365.wyo.gov/new-riff-rye/565.p",
        availability: "OOS",
        listPrice: 240
      },
      {
        itemId: "104",
        recordId: "566",
        name: "Jack Daniel's Single Barrel Gift Pack W/ Snifter 6Pk/750ML",
        productUrl: "https://liquor365.wyo.gov/jack-gift/566.p",
        availability: "OOS",
        listPrice: 217.52
      },
      {
        itemId: "105",
        recordId: "567",
        name: "- Brown Sugar Bourbon 60 Proof 6Pk/750ML",
        productUrl: "https://liquor365.wyo.gov/brown-sugar/567.p",
        availability: "OOS",
        listPrice: 89.7
      }
    ]
  }, {
    mode: "bourbon"
  });

  assert.deepEqual(rows.map((row) => row.itemId), ["101", "102"]);
  assert.equal(rows[0].estimatedBottlePrice, 35.38);
  assert.equal(rows[0].size, "750ml");
  assert.equal(rows[1].category, "Tennessee Whiskey");
});

test("Wyoming Liquor importer keeps serious domestic whiskey beyond bourbon", () => {
  const rows = parseWyomingLiquorJson({
    retrievedAt: "2026-05-28T00:00:00.000Z",
    products: [
      {
        itemId: "201",
        recordId: "601",
        name: "New Riff Bottled in Bond Rye 6Pk/750ML",
        listPrice: 240
      },
      {
        itemId: "202",
        recordId: "602",
        name: "Bernheim Original Barrel Proof Wheat Whiskey 6Pk/750ML",
        listPrice: 318.18
      },
      {
        itemId: "203",
        recordId: "603",
        name: "Bulleit Single Malt American Whiskey 6Pk/750ML",
        listPrice: 270.3
      },
      {
        itemId: "204",
        recordId: "604",
        name: "Balcones Baby Blue Corn Whiskey 6Pk/750ML",
        listPrice: 233.16
      },
      {
        itemId: "205",
        recordId: "605",
        name: "Canadian Crest Blended Canadian Whisky 6Pk/750ML",
        listPrice: 64.2
      },
      {
        itemId: "206",
        recordId: "606",
        name: "Ballotin Chocolate Mint Whiskey 6Pk/750ML",
        listPrice: 123.78
      },
      {
        itemId: "207",
        recordId: "607",
        name: "Big Nuts Maple Pecan Whiskey 6Pk/750ML",
        listPrice: 90.54
      },
      {
        itemId: "208",
        recordId: "608",
        name: "Pennington's Vanilla Rye Whiskey 6Pk/750ML",
        listPrice: 93
      },
      {
        itemId: "209",
        recordId: "609",
        name: "Jack Daniel's 12/4 Pks (Pks Contain 1 50ML Ea Of Jd Old No. 7; 1",
        listPrice: 120
      },
      {
        itemId: "210",
        recordId: "610",
        name: "The Gifted Horse American Bourbon Whiskey 6Pk/750ML",
        listPrice: 243.72
      },
      {
        itemId: "211",
        recordId: "611",
        name: "Rumple Minze Cinnamint Whiskey 6Pk/750ML",
        listPrice: 90.18
      },
      {
        itemId: "212",
        recordId: "612",
        name: "Ole Smoky Elderberry Whiskey 6Pk/750ML",
        listPrice: 60
      }
    ]
  });

  assert.deepEqual(rows.map((row) => row.category), [
    "Corn Whiskey",
    "Wheat Whiskey",
    "American Single Malt",
    "Canadian Whisky",
    "Rye Whiskey",
    "Bourbon"
  ]);
});

test("Wyoming Liquor helpers parse packages and clean source notes", () => {
  assert.deepEqual(parsePackageDetails("Old Forester Birthday Bourbon 6Pk/750ML"), {
    raw: "6Pk/750ML",
    casePack: 6,
    unitsPerPack: 1,
    size: "750ml"
  });
  assert.deepEqual(parsePackageDetails("Jack Daniel's No. 27 Gold Tennessee Whiskey 6/750ML"), {
    raw: "6/750ML",
    casePack: 6,
    unitsPerPack: 1,
    size: "750ml"
  });
  assert.equal(
    cleanDisplayName("Old Forester Birthday Bourbon 104 Proof 6Pk/750ML >Disc By Vendor<"),
    "Old Forester Birthday Bourbon 104 Proof"
  );
});

test("Wyoming Liquor payload becomes source-backed app catalog data", () => {
  const rows = parseWyomingLiquorJson({
    retrievedAt: "2026-05-28T00:00:00.000Z",
    products: [
      {
        itemId: "101",
        recordId: "563",
        name: "1792 Full Proof Kentucky Straight Bourbon 6Pk/750ML",
        productUrl: "https://liquor365.wyo.gov/1792-full-proof/563.p",
        availability: "In Stock",
        listPrice: 212.28
      }
    ]
  }, {
    mode: "bourbon"
  });
  const payload = buildImportPayload(rows, "2026-05-28T00:00:00.000Z", 1);
  const appCatalog = buildAppCatalogPayload([payload], "2026-05-28T00:00:00.000Z");

  assert.equal(payload.rawRecordCount, 1);
  assert.equal(payload.bottleCount, 1);
  assert.equal(appCatalog.bottles[0].id.startsWith("wyoming-liquor-"), true);
  assert.equal(appCatalog.bottles[0].sourceRetailPrice, 35.38);
  assert.equal(appCatalog.bottles[0].sourcePriceLabel, "WY bottle list est.");
});
