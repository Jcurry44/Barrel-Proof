const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildImportPayload,
  includeRow,
  normalizeDate,
  normalizeSize,
  parseMontgomeryText
} = require("../tools/import-montgomery-county-abs.js");
const { buildAppCatalogPayload } = require("../tools/build-imported-catalog.js");

test("Montgomery County ABS importer parses multiline bourbon rows", () => {
  const rows = parseMontgomeryText([
    "Alcohol Beverage Services",
    "PRICE BOOK",
    "EFFECTIVE FROM 4/01/26 TO 4/30/26",
    "BOURBON",
    "Product Size Description Tag BPC Wholesale",
    "Case Price",
    "Wholesale",
    "Bottle Price",
    "Supplier Type RTD",
    "69442 750ML BLANTON'S BOURBON (HAL) AL 6 471.00 78.50 SAZERAC CO LIQUOR",
    "89961 750ML BARDSTOWN BOURB CO 6YR",
    "ORIGIN SERIES KY STRAIGHT",
    "WHEATED BOURBON - 750ML",
    "S 6 275.00 45.83 PRESTIGE BEVERAGE GROUP OF MD LLC LIQUOR"
  ].join("\n"), {
    retrievedAt: "2026-05-28T00:00:00.000Z",
    sourceFile: "data/raw/montgomery-county-abs/text/pricebook.txt"
  });

  assert.equal(rows.length, 2);
  assert.equal(rows[0].productCode, "89961");
  assert.equal(rows[0].name, "Bardstown Bourb Co 6yr Origin Series KY Straight Wheated Bourbon");
  assert.equal(rows[0].category, "Bourbon");
  assert.equal(rows[0].ageYears, 6);
  assert.equal(rows[0].wholesaleBottlePrice, 45.83);
  assert.equal(rows[1].productCode, "69442");
  assert.equal(rows[1].tag, "AL");
});

test("Montgomery County ABS importer rejects non-liquor and accessory false positives", () => {
  const rows = parseMontgomeryText([
    "EFFECTIVE FROM 4/01/26 TO 4/30/26",
    "BOURBON",
    "12008 12.0Z BOULEVARD BOURBON BA QUAD 6/4",
    "SB 24 79.85 3.33 MITCHELL BEVERAGE OF MARYLAND LLC BEER",
    "56864 750ML BULLEIT BOURBON W/COCKTAIL",
    "KIT - 750ML",
    "HO 6 139.00 23.17 DIAGEO NORTH AMERICA INC LIQUOR",
    "15801 750ML BASIL HAYDEN DARK RYE 750ML S 6 261.00 43.50 JIM BEAM BRANDS CO LIQUOR"
  ].join("\n"), {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });

  assert.equal(rows.length, 0);
});

test("Montgomery County ABS importer keeps serious Tennessee whiskey", () => {
  const rows = parseMontgomeryText([
    "EFFECTIVE FROM 4/01/26 TO 4/30/26",
    "WHISKEY",
    "88521 700ML JACK DANIELS BONDED 100P ST 6 158.00 26.33 BROWN-FORMAN BEVERAGES LIQUOR"
  ].join("\n"), {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].category, "Tennessee Whiskey");
  assert.equal(rows[0].proof, 100);
});

test("Montgomery County ABS helpers normalize dates and sizes", () => {
  assert.equal(normalizeDate("4/01/26"), "2026-04-01");
  assert.equal(normalizeSize("750ML"), "750ml");
  assert.equal(normalizeSize("1LTR"), "1L");
});

test("Montgomery County ABS payload becomes source-backed app catalog data", () => {
  const rows = parseMontgomeryText([
    "EFFECTIVE FROM 4/01/26 TO 4/30/26",
    "BOURBON",
    "69442 750ML BLANTON'S BOURBON (HAL) AL 6 471.00 78.50 SAZERAC CO LIQUOR"
  ].join("\n"), {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  }).filter((row) => includeRow(row, "bourbon"));
  const payload = buildImportPayload(rows, "2026-05-28T00:00:00.000Z", rows.length);
  const appCatalog = buildAppCatalogPayload([payload], "2026-05-28T00:00:00.000Z");

  assert.equal(payload.bottleCount, 1);
  assert.equal(appCatalog.bottles[0].id.startsWith("montgomery-abs-"), true);
  assert.equal(appCatalog.bottles[0].sourceRetailPrice, 78.5);
  assert.equal(appCatalog.bottles[0].sourcePriceLabel, "MoCo ABS wholesale");
});
