const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildImportPayload,
  parseAlabamaRows,
  parseProductDetails,
  parseSizeFromName,
  titleCaseProductName
} = require("../tools/import-alabama-abc.js");
const { buildAppCatalogPayload } = require("../tools/build-imported-catalog.js");

test("Alabama importer keeps bourbon rows and conservative bourbon-brand rescues", () => {
  const rows = parseAlabamaRows([
    ["AMERICAN WHISKEY  "],
    ["A001110", "1792 SMALL BATCH BOURBON 93 PR. 750 ML", 6, 29.99, 179.94],
    ["A000881", "BUFFALO TRACE BOURBON CREAM LIQUEUR 30 PR. 750 ML", 12, 22.99, 275.88],
    ["A000153", "ANCIENT AGE 80 PR. 4 YR. 750 ML", 12, 12.99, 155.88],
    ["J070189", "JACK DANIEL'S & GINGER COCKTAIL 28PR 355ML", 6, 12.99, 77.94],
    ["A070647", "ADICTIVO EXTRA ANEJO TEQUILA 80PR 750ML", 6, 104.99, 629.94]
  ], {
    sheetName: "Retail",
    defaultCategory: "Retail Listed Items"
  }, {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });

  assert.deepEqual(rows.map((row) => row.productCode), ["A001110", "A000153"]);
  assert.equal(rows[0].name, "1792 Small Batch Bourbon");
  assert.equal(rows[0].category, "Bourbon");
  assert.equal(rows[0].proof, 93);
  assert.equal(rows[0].size, "750ml");
  assert.equal(rows[1].name, "Ancient Age");
  assert.equal(rows[1].age, "4 years");
  assert.equal(rows[1].category, "Bourbon");
});

test("Alabama allocated rows include known bourbon names and exclude other spirits", () => {
  const rows = parseAlabamaRows([
    ["ALLOCATED PRODUCTS"],
    ["A009337", "1792 B.I.B. BOURBON 100 PR. 8 YR. 750 ML", 6, 40.99, 245.94],
    ["A070700", "WELLER SPECIAL RESERVE 90 PR. 7 YR. 750 ML", 12, 26.99, 323.88],
    ["A070701", "CLASE AZUL REPOSADO TEQUILA 80 PR. 750 ML", 6, 169.99, 1019.94],
    ["A004574", "CORAZON EXPRESSIONES GEORGE T. STAGG ANEJO 80 PR. 750 ML", 6, 79.99, 479.94],
    ["A070419", "MYERS'S GEORGE T. STAGG RUM 100PR 750ML", 6, 79.99, 479.94]
  ], {
    sheetName: "Allocated Items",
    defaultCategory: "Allocated Products"
  }, {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });

  assert.deepEqual(rows.map((row) => row.productCode), ["A009337", "A070700"]);
  assert.equal(rows[1].name, "Weller Special Reserve");
  assert.equal(rows[1].category, "Bourbon");
  assert.equal(rows[1].ageYears, 7);
});

test("Alabama importer keeps serious whiskey categories beyond bourbon", () => {
  const rows = parseAlabamaRows([
    ["CANADIAN WHISKEY"],
    ["A001982", "CANADIAN CLUB APPLE CANADIAN WHISKY 70 PR. 750 ML", 12, 12.99, 155.88],
    ["A000114", "CROWN ROYAL 80 PR. 750 ML", 12, 29.99, 359.88],
    ["RYE WHISKEY"],
    ["A001837", "HIGH WEST DOUBLE RYE WHISKEY 92 PR. 750 ML", 6, 36.99, 221.94],
    ["SCOTCH WHISKEY (SINGLE MALT)"],
    ["A000611", "ARDBEG SINGLE MALT SCOTCH 92 PR. 10 YR. 750 ML", 6, 64.99, 389.94],
    ["WHISKEY-IRISH"],
    ["A007719", "JAMESON ORANGE IRISH WHISKEY 60 PR. 750 ML", 6, 29.99, 179.94],
    ["A000824", "REDBREAST IRISH WHISKEY 80 PR. 12 YR. 750 ML", 6, 74.99, 449.94],
    ["JAPANESE WHISKEY"],
    ["A001529", "HIBIKI HARMONY JAPANESE WHISKY 86 PR. 750 ML", 6, 99.99, 599.94],
    ["ALLOCATED PRODUCTS"],
    ["A010564", "BERNHEIM ORIGINAL WHEAT BARREL 118.80PR 750ML", 6, 67.99, 407.94],
    ["A009716", "MICHTER'S TOASTED BARREL FINISH SOUR MASH 86 PR.", 6, 124.99, 749.94],
    ["A070595", "PENELOPE READY TO POUR BLACK WALNUT OLD FASHIONED", 6, 29.99, 179.94]
  ], {
    sheetName: "Retail",
    defaultCategory: "Retail Listed Items"
  }, {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });

  assert.deepEqual(rows.map((row) => row.category), [
    "Canadian Whisky",
    "Rye Whiskey",
    "Scotch Whisky",
    "Irish Whiskey",
    "Japanese Whisky",
    "Wheat Whiskey",
    "American Whiskey"
  ]);
  assert.equal(rows.some((row) => row.name.includes("Apple")), false);
  assert.equal(rows.some((row) => row.name.includes("Orange")), false);
  assert.equal(rows.some((row) => row.name.includes("Ready To Pour")), false);
});

test("Alabama product-name parser extracts proof, age, size, and display name", () => {
  const details = parseProductDetails("EAGLE RARE ABC BARREL SELECT 90 PR. 10 YR. 750 ML");

  assert.equal(details.name, "Eagle Rare ABC Barrel Select");
  assert.equal(details.proof, 90);
  assert.equal(details.age, "10 years");
  assert.equal(details.size, "750ml");
  assert.equal(parseSizeFromName("JACK DANIEL'S OLD NO. 7 BLACK LABEL 80 PR. 1.75 L"), "1.75L");
  assert.equal(titleCaseProductName("MICHTER'S US*1 SOUR MASH WHISKEY"), "Michter's US*1 Sour Mash Whiskey");
});

test("Alabama payload becomes source-backed app catalog data", () => {
  const rows = parseAlabamaRows([
    ["AMERICAN WHISKEY  "],
    ["A001110", "1792 SMALL BATCH BOURBON 93 PR. 750 ML", 6, 29.99, 179.94]
  ], {
    sheetName: "Retail",
    defaultCategory: "Retail Listed Items"
  }, {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });
  const payload = buildImportPayload(rows, "2026-05-28T00:00:00.000Z");
  const appCatalog = buildAppCatalogPayload([payload], "2026-05-28T00:00:00.000Z");

  assert.equal(payload.rawRecordCount, 1);
  assert.equal(payload.bottleCount, 1);
  assert.equal(appCatalog.bottles[0].id.startsWith("alabama-abc-"), true);
  assert.equal(appCatalog.bottles[0].sourcePriceLabel, "Alabama ABC retail");
});
