const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildImportPayload,
  normalizeSize,
  parseVermontPriceListText
} = require("../tools/import-vermont-802.js");
const { buildAppCatalogPayload } = require("../tools/build-imported-catalog.js");

test("Vermont 802 importer parses bourbon retail price rows", () => {
  const rows = parseVermontPriceListText([
    "May 2026",
    "Vermont 802Spirits Current Complete Price List",
    "Code",
    "Brand",
    "Size",
    "Regular ",
    "Price",
    "Sale Price",
    "Save",
    "Proof",
    "Status",
    "Whiskey",
    "Whiskey Bourbon",
    "021236",
    "1792 Small Batch ",
    "Bourbon 750ML",
    "750ML",
    "31.99",
    "29.99",
    "2.00",
    "93.70",
    "High Volume"
  ].join("\n"), {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].code, "021236");
  assert.equal(rows[0].name, "1792 Small Batch Bourbon");
  assert.equal(rows[0].category, "Bourbon");
  assert.equal(rows[0].size, "750ml");
  assert.equal(rows[0].regularPrice, 31.99);
  assert.equal(rows[0].salePrice, 29.99);
  assert.equal(rows[0].proof, 93.7);
  assert.equal(rows[0].status, "High Volume");
});

test("Vermont 802 importer keeps rye and rejects bourbon cream", () => {
  const rows = parseVermontPriceListText([
    "May 2026",
    "Liqueur",
    "080535",
    "Smugglers Notch ",
    "Distillery Bourbon ",
    "Maple Cream ",
    "Liqueur 750ML",
    "750ML",
    "34.99",
    "34.99",
    "0.00",
    "40.00",
    "High Volume",
    "Whiskey",
    "Whiskey Bourbon",
    "020999",
    "Example Straight Rye ",
    "Whiskey 750ML",
    "750ML",
    "42.99",
    "42.99",
    "0.00",
    "100.00",
    "Low Volume"
  ].join("\n"), {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].code, "020999");
  assert.equal(rows[0].category, "Rye Whiskey");
});

test("Vermont 802 importer keeps serious Tennessee whiskey", () => {
  const rows = parseVermontPriceListText([
    "May 2026",
    "Whiskey",
    "Whiskey American",
    "026565",
    "Jack Daniel's Black ",
    "750ML",
    "750ML",
    "25.99",
    "25.99",
    "0.00",
    "80.00",
    "High Volume"
  ].join("\n"), {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].category, "Tennessee Whiskey");
});

test("Vermont 802 importer keeps serious whiskey categories beyond bourbon", () => {
  const rows = parseVermontPriceListText([
    "May 2026",
    "Whiskey",
    "Whiskey Scotch",
    "004096",
    "Ardbeg 10yr Old Single Malt",
    "750ML",
    "64.99",
    "64.99",
    "0.00",
    "92.00",
    "High Volume",
    "Whiskey Irish",
    "015536",
    "Bushmills Malt 10yr",
    "750ML",
    "49.99",
    "49.99",
    "0.00",
    "80.00",
    "High Volume",
    "Whiskey Canadian",
    "011363",
    "Crown Royal Reserve 12yr",
    "750ML",
    "44.99",
    "44.99",
    "0.00",
    "80.00",
    "High Volume",
    "Whiskey Other",
    "016100",
    "Hibiki Harmony Japanese Whisky",
    "750ML",
    "99.99",
    "99.99",
    "0.00",
    "86.00",
    "High Volume",
    "Whiskey American",
    "016101",
    "Black Flannel Distilling Black Gold Malt Whiskey",
    "750ML",
    "54.99",
    "54.99",
    "0.00",
    "86.00",
    "High Volume"
  ].join("\n"), {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });
  const byCode = Object.fromEntries(rows.map((row) => [row.code, row.category]));

  assert.equal(byCode["004096"], "Scotch Whisky");
  assert.equal(byCode["015536"], "Irish Whiskey");
  assert.equal(byCode["011363"], "Canadian Whisky");
  assert.equal(byCode["016100"], "Japanese Whisky");
  assert.equal(byCode["016101"], "American Whiskey");
});

test("Vermont 802 importer rejects flavored whiskey and cocktail rows", () => {
  const rows = parseVermontPriceListText([
    "May 2026",
    "Whiskey",
    "Whiskey American",
    "027697",
    "Bird Dog Apple Whiskey",
    "750ML",
    "18.99",
    "18.99",
    "0.00",
    "80.00",
    "High Volume",
    "Whiskey Canadian",
    "010791",
    "Crown Royal Vanilla",
    "750ML",
    "27.99",
    "27.99",
    "0.00",
    "70.00",
    "High Volume",
    "Whiskey Mini",
    "086881",
    "Southern Comfort (70 Proof)",
    "50ML",
    "1.99",
    "1.99",
    "0.00",
    "70.00",
    "High Volume",
    "Cocktails",
    "057708",
    "Bulleit Whiskey Sour Cocktail",
    "750ML",
    "22.99",
    "22.99",
    "0.00",
    "50.00",
    "High Volume",
    "Whiskey Rye",
    "027022",
    "Bulleit Rye Whiskey",
    "750ML",
    "54.99",
    "54.99",
    "0.00",
    "90.00",
    "High Volume"
  ].join("\n"), {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });

  assert.deepEqual(rows.map((row) => row.code), ["027022"]);
  assert.equal(rows[0].category, "Rye Whiskey");
});

test("Vermont 802 helpers normalize sizes", () => {
  assert.equal(normalizeSize("750ML"), "750ml");
  assert.equal(normalizeSize("1.75L"), "1.75L");
  assert.equal(normalizeSize("LITER"), "1L");
});

test("Vermont 802 payload becomes source-backed app catalog data", () => {
  const rows = parseVermontPriceListText([
    "May 2026",
    "Whiskey",
    "Whiskey Bourbon",
    "021236",
    "1792 Small Batch Bourbon 750ML",
    "750ML",
    "31.99",
    "29.99",
    "2.00",
    "93.70",
    "High Volume"
  ].join("\n"), {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });
  const payload = buildImportPayload(rows, "2026-05-28T00:00:00.000Z", rows.length);
  const appCatalog = buildAppCatalogPayload([payload], "2026-05-28T00:00:00.000Z");

  assert.equal(payload.bottleCount, 1);
  assert.equal(appCatalog.bottles[0].id.startsWith("vermont-802-"), true);
  assert.equal(appCatalog.bottles[0].sourceRetailPrice, 29.99);
  assert.equal(appCatalog.bottles[0].sourcePriceLabel, "VT 802 retail");
});
