const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildImportPayload,
  parseBottleSizes,
  parseProductDetails,
  parseWestVirginiaSearchRows
} = require("../tools/import-wv-abca.js");
const { buildAppCatalogPayload } = require("../tools/build-imported-catalog.js");

test("WV ABCA importer splits multi-size rows and keeps bourbon identities", () => {
  const rows = parseWestVirginiaSearchRows([
    { BottleSize: " 375, 750, 1000, 1750", ConfigID: 1291, ProductID: 2082, ProductName: "George Dickel #12" },
    { BottleSize: " 750", ConfigID: 827, ProductID: 827, ProductName: "Buffalo Trace Kentucky Straight Bourbon Whiskey" },
    { BottleSize: " 750", ConfigID: 825, ProductID: 825, ProductName: "Buffalo Trace Bourbon Cream" }
  ], {
    retrievedAt: "2026-05-28T00:00:00.000Z",
    sourceFile: "data/raw/wv-abca/test-search.json",
    searchTerm: "test"
  });

  assert.deepEqual(rows.map((row) => row.sourceRecordId), [
    "2082:375ml",
    "2082:750ml",
    "2082:1L",
    "2082:1.75L",
    "827:750ml"
  ]);
  assert.equal(rows[0].category, "Tennessee Whiskey");
  assert.equal(rows[4].category, "Bourbon");
});

test("WV ABCA importer rejects cocktails, flavored products, creams, and packs", () => {
  const rows = parseWestVirginiaSearchRows([
    { BottleSize: " 355", ConfigID: 11303, ProductID: 11303, ProductName: "Betty Booze Bourbon Variety 6 Pack X 4" },
    { BottleSize: " 750", ConfigID: 9296, ProductID: 9296, ProductName: "Mountain State Spirits Cherry Bounce Bourbon Ratafia" },
    { BottleSize: " 750", ConfigID: 9439, ProductID: 9439, ProductName: "Oyo Honey Vanilla Bean Bourbon Barrel Finished Vodka" },
    { BottleSize: " 750", ConfigID: 6775, ProductID: 6775, ProductName: "Dubliner Irish Whiskey & Honeycomb" },
    { BottleSize: " 750", ConfigID: 7732, ProductID: 7732, ProductName: "Lohin Mckinnon Chocolate Single Malt" },
    { BottleSize: " 1750", ConfigID: 7036, ProductID: 7036, ProductName: "Member's Mark Scotch Club Pack" },
    { BottleSize: " 750", ConfigID: 6589, ProductID: 6589, ProductName: "Jack Daniel's Single Barrel Rye" },
    { BottleSize: " 700", ConfigID: 10878, ProductID: 10878, ProductName: "Heaven Hill Grain To Glass Kentucky Straight Rye Whiskey" },
    { BottleSize: " 750", ConfigID: 11146, ProductID: 11146, ProductName: "Uncle Nearest Single Barrel Premium Whiskey" },
    { BottleSize: " 750", ConfigID: 11037, ProductID: 11037, ProductName: "Three Chord Tennessee Straight Whiskey" }
  ], {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });

  assert.deepEqual(rows.map((row) => row.name), [
    "Jack Daniel's Single Barrel Rye",
    "Heaven Hill Grain To Glass Kentucky Straight Rye Whiskey",
    "Uncle Nearest Single Barrel Premium Whiskey",
    "Three Chord Tennessee Straight Whiskey"
  ]);
  assert.equal(rows[0].category, "Rye Whiskey");
  assert.equal(rows[1].category, "Rye Whiskey");
});

test("WV ABCA importer keeps serious whiskey categories beyond bourbon", () => {
  const rows = parseWestVirginiaSearchRows([
    { BottleSize: " 750", ConfigID: 2001, ProductID: 2001, ProductName: "Macallan 12 Year Scotch Whisky" },
    { BottleSize: " 750", ConfigID: 2002, ProductID: 2002, ProductName: "Crown Royal Canadian Whisky" },
    { BottleSize: " 750", ConfigID: 2003, ProductID: 2003, ProductName: "Redbreast 12 Year Irish Whiskey" },
    { BottleSize: " 750", ConfigID: 2004, ProductID: 2004, ProductName: "Nikka Coffey Grain Japanese Whisky" },
    { BottleSize: " 750", ConfigID: 2005, ProductID: 2005, ProductName: "Bernheim Wheat Whiskey" },
    { BottleSize: " 750", ConfigID: 2006, ProductID: 2006, ProductName: "Bulleit Single Malt Whiskey" },
    { BottleSize: " 750", ConfigID: 2007, ProductID: 2007, ProductName: "Proper Twelve Apple Irish Whiskey" }
  ], {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });

  assert.deepEqual(rows.map((row) => row.category), [
    "Scotch Whisky",
    "Canadian Whisky",
    "Irish Whiskey",
    "Japanese Whisky",
    "Wheat Whiskey",
    "American Single Malt"
  ]);
});

test("WV ABCA helpers normalize sizes, age, and proof when present", () => {
  assert.deepEqual(parseBottleSizes(" 50, 750, 1000, 1750, 3000"), ["50ml", "750ml", "1L", "1.75L", "3L"]);

  const details = parseProductDetails("Calumet Farm 17 Year Bourbon Decanter 106 Proof");
  assert.equal(details.name, "Calumet Farm Bourbon Decanter");
  assert.equal(details.age, "17 years");
  assert.equal(details.proof, 106);
});

test("WV ABCA payload becomes source-backed app catalog data without retail price", () => {
  const rows = parseWestVirginiaSearchRows([
    { BottleSize: " 750", ConfigID: 827, ProductID: 827, ProductName: "Buffalo Trace Kentucky Straight Bourbon Whiskey" }
  ], {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });
  const payload = buildImportPayload(rows, "2026-05-28T00:00:00.000Z", ["data/raw/wv-abca/test-search.json"]);
  const appCatalog = buildAppCatalogPayload([payload], "2026-05-28T00:00:00.000Z");

  assert.equal(payload.rawRecordCount, 1);
  assert.equal(payload.bottleCount, 1);
  assert.equal(appCatalog.bottles[0].id.startsWith("wv-abca-"), true);
  assert.equal(appCatalog.bottles[0].sourceRetailPrice, null);
  assert.equal(appCatalog.bottles[0].sourcePriceLabel, "No retail price in WV search");
});
