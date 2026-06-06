const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildImportPayload,
  normalizeSizeLabel,
  parseAgeFromName,
  parsePennsylvaniaRows,
  parseUpcs
} = require("../tools/import-pa-lcb.js");
const { buildAppCatalogPayload } = require("../tools/build-imported-catalog.js");

const HEADERS = [
  "Division Name",
  "Group Name",
  "Class Name",
  "PLCB Item",
  "Item Description",
  "PLCB SCC Item",
  "Manufacturer SCC",
  "Liquid Volume",
  "Case Pack",
  "Current Regular Retail",
  "Price Indicator",
  "Promotion discount",
  "Promotion discount Value",
  "Promotion Retail ",
  "Promotion Start Date",
  "Promotion End Date",
  "UPC",
  "UPC",
  "UPC",
  "UPC",
  "UPC",
  "TI",
  "HI",
  "Each Length",
  "Each Width",
  "Each Height",
  "Each Weight",
  "Proof",
  "Vintage",
  "Brand Name",
  "Import/Domestic",
  "Country",
  "Region",
  "Extraction Date"
];

test("Pennsylvania LCB importer keeps serious whiskey rows by default", () => {
  const rows = parsePennsylvaniaRows([
    HEADERS,
    ["Stock Spirits", "Whiskey", "Bourbon", "000000168", "Basil Hayden Straight Bourbon", "100001071", "10080686012129", "375 ml", "12", "24.99", "RTL", "", "", "", "", "", "", "080686012122", "", "", "", "", "5", "2.4 IN", "2.4 IN", "10.51 IN", "1.88 LB", "80"],
    ["Stock Spirits", "Whiskey", "Other", "000004291", "Jack Daniel's Old No 7 Black Label Tennessee Whiskey", "100001111", "10082184090413", "750 ml", "12", "27.99", "RTL", "", "", "", "", "", "", "082184090409", "", "", "", "", "6", "3 IN", "3 IN", "10 IN", "2.5 LB", "80"],
    ["Stock Spirits", "Cocktails", "Spirit-based", "000096318", "Jack Daniel's Coca Cola Tennessee Whiskey Cocktail 4x355 mL Cans", "100003619", "10082184106874", "1.42 L", "6", "12.99", "PRP", "", "", "", "", "", "", "082184106877", "", "", "", "", "8", "2 IN", "2 IN", "5 IN", "3.46 LB", "14"],
    ["Stock Spirits", "Whiskey", "Rye", "000007200", "Jack Daniel's Tennessee Rye", "100003620", "10082184000000", "750 ml", "12", "29.99", "RTL", "", "", "", "", "", "", "082184000000", "", "", "", "", "6", "3 IN", "3 IN", "10 IN", "2.5 LB", "90"]
  ], {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });

  assert.deepEqual(rows.map((row) => row.plcbItem), ["000000168", "000004291", "000007200"]);
  assert.equal(rows[0].currentRegularRetail, 24.99);
  assert.equal(rows[0].proof, 80);
  assert.equal(rows[0].size, "375ml");
  assert.equal(rows[1].category, "Tennessee Whiskey");
  assert.equal(rows[2].category, "Rye Whiskey");
});

test("Pennsylvania LCB importer keeps Scotch, Canadian, Irish, wheat, and Japanese whisky", () => {
  const rows = parsePennsylvaniaRows([
    HEADERS,
    ["Stock Spirits", "Whiskey", "Scotch", "000005430", "Lagavulin 16 Year Old Single Malt Scotch Whisky", "1", "1", "750 ml", "12", "89.99", "RTL", "", "", "", "", "", "", "088110070000", "", "", "", "", "5", "", "", "", "", "86"],
    ["Stock Spirits", "Whiskey", "Canadian", "000004390", "Black Velvet Canadian Whiskey Reserve 10 Year Old", "1", "1", "750 ml", "12", "29.99", "RTL", "", "", "", "", "", "", "096749000000", "", "", "", "", "5", "", "", "", "", "80"],
    ["Stock Spirits", "Whiskey", "Irish", "000007001", "Redbreast 12 Year Old Irish Whiskey", "1", "1", "750 ml", "12", "74.99", "RTL", "", "", "", "", "", "", "080432000000", "", "", "", "", "5", "", "", "", "", "80"],
    ["Stock Spirits", "Whiskey", "Other", "100057131", "Bernheim Original Straight Wheat Whiskey 10 Year Old 20th Anniversary Edition", "1", "1", "750 ml", "6", "84.99", "RTL", "", "", "", "", "", "", "096749111111", "", "", "", "", "5", "", "", "", "", "115"],
    ["Stock Spirits", "Whiskey", "Other", "000049006", "Hibiki Suntory Harmony Blended Whisky", "1", "1", "750 ml", "6", "99.99", "RTL", "", "", "", "", "", "", "080686222222", "", "", "", "", "5", "", "", "", "", "86"]
  ], {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });

  assert.deepEqual(rows.map((row) => row.category), [
    "Wheat Whiskey",
    "Canadian Whisky",
    "Japanese Whisky",
    "Scotch Whisky",
    "Irish Whiskey"
  ]);
});

test("Pennsylvania LCB importer rejects flavored whiskey and accessory bundles", () => {
  const rows = parsePennsylvaniaRows([
    HEADERS,
    ["Stock Spirits", "Whiskey", "Canadian", "100056597", "Art in the Age Old Baldy Spiced Apple Whiskey", "1", "1", "750 ml", "12", "31.99", "RTL", "", "", "", "", "", "", "080686333333", "", "", "", "", "5", "", "", "", "", "70"],
    ["Stock Spirits", "Whiskey", "Other", "000097221", "Jack Daniel's Gentleman Jack Double Mellowed Tennessee Whiskey with Sour Mix Gift Set", "1", "1", "750 ml", "12", "35.99", "RTL", "", "", "", "", "", "", "080686444444", "", "", "", "", "5", "", "", "", "", "80"],
    ["Stock Spirits", "Whiskey", "Bourbon", "100038465", "Blood Oath Trilogy Third Edition Kentucky Straight Bourbon Whiskey 3x750 mL", "1", "1", "2250 ml", "1", "799.99", "RTL", "", "", "", "", "", "", "080686444445", "", "", "", "", "5", "", "", "", "", "98"],
    ["Stock Spirits", "Whiskey", "Other", "100060500", "Jack Daniels Tennessee Whiskey 14 Year Old Batch 2", "1", "1", "700 ml", "6", "149.99", "RTL", "", "", "", "", "", "", "080686555555", "", "", "", "", "5", "", "", "", "", "125"]
  ], {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });

  assert.deepEqual(rows.map((row) => row.plcbItem), ["100060500"]);
  assert.equal(rows[0].category, "Tennessee Whiskey");
});

test("Pennsylvania LCB importer dedupes repeated SCC rows and merges UPCs", () => {
  const rows = parsePennsylvaniaRows([
    HEADERS,
    ["Stock Spirits", "Whiskey", "Bourbon", "000000168", "Basil Hayden Straight Bourbon", "100001071", "10080686012129", "375 ml", "12", "24.99", "RTL", "", "", "", "", "", "", "080686012122", "", "", "", "", "5", "2.4 IN", "2.4 IN", "10.51 IN", "1.88 LB", "80"],
    ["Stock Spirits", "Whiskey", "Bourbon", "000000168", "Basil Hayden Straight Bourbon", "100001072", "20080686012126", "375 ml", "12", "24.99", "RTL", "", "", "", "", "", "", "080686012122", "080686012129", "", "", "", "5", "2.4 IN", "2.4 IN", "10.51 IN", "1.88 LB", "80"]
  ], {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });

  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].plcbSccItems, ["100001071", "100001072"]);
  assert.deepEqual(rows[0].upcs, ["080686012122", "080686012129"]);
  assert.equal(rows[0].sourceRowCount, 2);
});

test("Pennsylvania LCB helpers normalize UPC, age, and size", () => {
  assert.deepEqual(parseUpcs(["", "000123456789", "123", "812345678905"], [1, 2, 3]), ["000123456789", "812345678905"]);
  assert.equal(normalizeSizeLabel("1.75 L"), "1.75L");
  assert.equal(normalizeSizeLabel("700 ml"), "700ml");
  assert.deepEqual(parseAgeFromName("Jack Daniel's Tennessee Whiskey 12 Year Old"), {
    label: "12 years",
    years: 12
  });
});

test("Pennsylvania LCB payload becomes source-backed app catalog data", () => {
  const rows = parsePennsylvaniaRows([
    HEADERS,
    ["Stock Spirits", "Whiskey", "Bourbon", "000000168", "Basil Hayden Straight Bourbon", "100001071", "10080686012129", "375 ml", "12", "24.99", "RTL", "", "", "", "", "", "", "080686012122", "", "", "", "", "5", "2.4 IN", "2.4 IN", "10.51 IN", "1.88 LB", "80"]
  ], {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });
  const payload = buildImportPayload(rows, "2026-05-28T00:00:00.000Z");
  const appCatalog = buildAppCatalogPayload([payload], "2026-05-28T00:00:00.000Z");

  assert.equal(payload.rawRecordCount, 1);
  assert.equal(payload.bottleCount, 1);
  assert.equal(appCatalog.bottles[0].id.startsWith("pa-lcb-"), true);
  assert.equal(appCatalog.bottles[0].sourceRetailPrice, 24.99);
  assert.equal(appCatalog.bottles[0].sourcePriceLabel, "PA LCB retail");
});
