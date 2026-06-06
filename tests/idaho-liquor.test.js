const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  buildImportPayload,
  parseEffectivePeriod,
  parseIdahoPriceBookText,
  parseLicenseePriceAndChange,
  parseRepSizeToken,
  titleCaseProductName
} = require("../tools/import-idaho-liquor.js");
const { buildAppCatalogPayload } = require("../tools/build-imported-catalog.js");

test("Idaho price book importer keeps bourbon rows by default", () => {
  const text = fs.readFileSync(path.join(__dirname, "fixtures", "idaho-pricebook-snippet.txt"), "utf8");
  const rows = parseIdahoPriceBookText(text, {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });

  assert.deepEqual(rows.map((row) => row.idahoCode), ["16017"]);
  assert.equal(rows[0].name, "Heaven Hill Bottled In Bond Bourbon (BIB)");
  assert.equal(rows[0].size, "750ml");
  assert.equal(rows[0].retailPrice, 49.95);
  assert.equal(rows[0].licenseePrice, 47.45);
  assert.equal(rows[0].changeCode, "L");
  assert.equal(rows[0].intermediateCode, "23");
});

test("Idaho price book parser preserves effective period and size token parsing", () => {
  const text = fs.readFileSync(path.join(__dirname, "fixtures", "idaho-pricebook-snippet.txt"), "utf8");

  assert.deepEqual(parseEffectivePeriod(text), {
    effectiveFrom: "10/01/25",
    effectiveThrough: "10/31/25"
  });
  assert.deepEqual(parseRepSizeToken("51750"), { repCode: "51", size: "750ml" });
  assert.deepEqual(parseRepSizeToken("511750"), { repCode: "51", size: "1.75L" });
  assert.deepEqual(parseLicenseePriceAndChange("30.35G"), { licenseePrice: 30.35, changeCode: "G" });
  assert.equal(titleCaseProductName("HEAVEN HILL BOTTLED IN BOND BOURBON (BIB)"), "Heaven Hill Bottled In Bond Bourbon (BIB)");
});

test("Idaho category price book keeps serious whiskey beyond bourbon", () => {
  const text = [
    "Idaho State Liquor Division",
    "Price Book",
    "Order by Category",
    "Effective 06/01/26 through 06/30/26",
    "Category:     34    SCOTCH, BLENDED",
    "4331 BLACK BULL 30YR BLENDED SCOTCH WHISKY 700 100.0   301.99  6   286.89 *",
    "Category:     31    CANADIAN",
    "11286 CROWN ROYAL EXTRA RARE 31YR CANADIAN 750  80.0   599.99  1   569.99",
    "Category:     16    IRISH",
    "16590 REDBREAST 12YR IRISH WHISKEY 750  80.0    79.99  6    75.99",
    "65487 JAMESON ORANGE IRISH WHISKEY 750  60.0    29.99  6    28.49",
    "Category:     30    IMPORTED WHISKEY",
    "40010 NIKKA FROM THE BARREL JAPANESE WHISKY 750 102.8    74.99  6    71.24",
    "Category:     11    RYE WHISKEY",
    "15180 WHISTLEPIG 10YR RYE 750 100.0    79.99  6    75.99 **",
    "Category:     32    AMERICAN MALT WHISKEY",
    "23839 WARFIELD GENTLY PEATED AMERICAN SINGLE MALT 750  92.0    64.99  1    61.74 **",
    "Category:     18    AMERICAN BLENDED WHISKEY",
    "22404 BERNHEIM ORIGINAL WHEAT BARREL PROOF WHISKEY 750 120.4    69.99  3    66.49 **",
    "86886 SOUTHERN COMFORT 70 750  70.0    11.99 12    11.39",
    "Category:     60    LIQUEURS",
    "85702 CRATER LAKE ROCK AND RYE (REGIONAL - OR) 750  60.0    19.99  6    18.99 *"
  ].join("\n");

  const rows = parseIdahoPriceBookText(text, {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });

  assert.deepEqual(rows.map((row) => row.category), [
    "Scotch Whisky",
    "Canadian Whisky",
    "Irish Whiskey",
    "Japanese Whisky",
    "Rye Whiskey",
    "American Single Malt",
    "Wheat Whiskey"
  ]);
  assert.equal(rows[0].proof, 100);
  assert.equal(rows[0].age, "30 years");
  assert.equal(rows.some((row) => row.name.includes("Jameson Orange")), false);
  assert.equal(rows.some((row) => row.name.includes("Southern Comfort")), false);
  assert.equal(rows.some((row) => row.name.includes("Rock And Rye")), false);
});

test("Idaho payload becomes source-backed app catalog data", () => {
  const text = fs.readFileSync(path.join(__dirname, "fixtures", "idaho-pricebook-snippet.txt"), "utf8");
  const rows = parseIdahoPriceBookText(text, {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });
  const payload = buildImportPayload(rows, "2026-05-28T00:00:00.000Z");
  const appCatalog = buildAppCatalogPayload([payload], "2026-05-28T00:00:00.000Z");

  assert.equal(payload.rawRecordCount, 1);
  assert.equal(payload.bottleCount, 1);
  assert.equal(appCatalog.bottles[0].id.startsWith("idaho-liquor-"), true);
  assert.equal(appCatalog.bottles[0].sourcePriceLabel, "Idaho retail");
  assert.equal(appCatalog.bottles[0].sourceRefs[0].sourceId, "idaho_liquor_price_book");
});
