const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  buildImportPayload,
  normalizeDate,
  normalizeMichiganSize,
  normalizeUpc,
  parseMichiganPriceBookText,
  titleCaseProductName
} = require("../tools/import-michigan-lcc.js");
const { buildAppCatalogPayload } = require("../tools/build-imported-catalog.js");

test("Michigan price book importer keeps serious whiskey rows by default", () => {
  const text = fs.readFileSync(path.join(__dirname, "fixtures", "michigan-pricebook-snippet.txt"), "utf8");
  const rows = parseMichiganPriceBookText(text, {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });

  assert.deepEqual(rows.map((row) => row.liquorCode), ["100431", "100737", "100743", "24223", "100894"]);
  assert.equal(rows[0].name, "Woodinville Applewood Staves");
  assert.equal(rows[0].category, "Bourbon");
  assert.equal(rows[0].proof, 100);
  assert.equal(rows[0].size, "750ml");
  assert.equal(rows[0].shelfPrice, 44.99);
  assert.equal(rows[0].upc, "00858349004148");
  assert.equal(rows[1].category, "Tennessee Whiskey");
  assert.equal(rows[2].category, "American Whiskey");
  assert.equal(rows[3].size, "1L");
  assert.equal(rows[4].category, "Japanese Whisky");
});

test("Michigan price book importer still supports bourbon-only mode", () => {
  const text = fs.readFileSync(path.join(__dirname, "fixtures", "michigan-pricebook-snippet.txt"), "utf8");
  const rows = parseMichiganPriceBookText(text, {
    mode: "bourbon",
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });

  assert.deepEqual(rows.map((row) => row.liquorCode), ["100431", "100737", "24223"]);
});

test("Michigan price book importer rejects liqueurs and flavored novelty whiskey", () => {
  const text = [
    "Liquor Code\tBrand Name\tADA Number\tADA Name\tVendor Name\tLiquor Type\tProof\tBottle Size\tCase Size\tPacks per Case\tProduct Category\tOn Premise Price\tOff Premise Price\tShelf price ($)\tGTIN/UPC\tEffective Date\tEffective Date with Liq Code",
    "200001\tDAMPFWERK RABBIT IN THE RYE\t321\tNWS MICHIGAN, INC.\tDAMPFWERK DISTILLING\t57-CORDIALS & LIQUEURS - AMERICAN\t86.00\t750 ML\t12\t\tRegular Spirit Product\t$32.00\t$32.00\t$37.99\t123\t5/3/2026\t2026-05-03200001",
    "200002\tBIRD DOG STRAWBERRY\t321\tNWS MICHIGAN, INC.\tBIRD DOG\t19-MISCELLANEOUS WHISKEY\t80.00\t750 ML\t12\t\tRegular Spirit Product\t$17.00\t$17.00\t$20.99\t124\t5/3/2026\t2026-05-03200002",
    "200003\tTHE TOTTORI JAPANESE WHISKY EX-BOURBON BARREL\t321\tNWS MICHIGAN, INC.\tBENCHMARK BEVERAGE COMPANY LLC\t19-MISCELLANEOUS WHISKEY\t86.00\t750 ML\t12\t\tRegular Spirit Product\t$33.92\t$33.92\t$39.99\t125\t5/3/2026\t2026-05-03200003",
    "200004\tRUMPLE MINZE CINNAMINT WHISKEY\t321\tNWS MICHIGAN, INC.\tDIAGEO AMERICAS\t19-MISCELLANEOUS WHISKEY\t100.00\t750 ML\t12\t\tRegular Spirit Product\t$20.00\t$20.00\t$24.99\t126\t5/3/2026\t2026-05-03200004",
    "200005\tBIRD DOG GINGERBREAD WHISKEY\t321\tNWS MICHIGAN, INC.\tBIRD DOG\t19-MISCELLANEOUS WHISKEY\t80.00\t750 ML\t12\t\tRegular Spirit Product\t$17.00\t$17.00\t$20.99\t127\t5/3/2026\t2026-05-03200005"
  ].join("\n");
  const rows = parseMichiganPriceBookText(text, {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });

  assert.deepEqual(rows.map((row) => row.liquorCode), ["200003"]);
  assert.equal(rows[0].category, "Japanese Whisky");
});

test("Michigan importer rescues world whisky brands from noisy source types", () => {
  const text = [
    "Liquor Code\tBrand Name\tADA Number\tADA Name\tVendor Name\tLiquor Type\tProof\tBottle Size\tCase Size\tPacks per Case\tProduct Category\tOn Premise Price\tOff Premise Price\tShelf price ($)\tGTIN/UPC\tEffective Date\tEffective Date with Liq Code",
    "200006\tPAUL JOHN CLASSIC SELECT WISKY\t321\tNWS MICHIGAN, INC.\tPAUL JOHN\t5-STRAIGHT BOURBON\t92.00\t750 ML\t6\t\tRegular Spirit Product\t$84.75\t$84.75\t$99.99\t128\t5/3/2026\t2026-05-03200006"
  ].join("\n");
  const rows = parseMichiganPriceBookText(text, {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });

  assert.deepEqual(rows.map((row) => row.liquorCode), ["200006"]);
  assert.equal(rows[0].category, "Single Malt / World Whisky");
});

test("Michigan helpers normalize size, date, UPC, and display names", () => {
  assert.equal(normalizeMichiganSize("1750 ML"), "1.75L");
  assert.equal(normalizeMichiganSize("1000 ML"), "1L");
  assert.equal(normalizeMichiganSize("700 ML"), "700ml");
  assert.equal(normalizeDate("5/3/2026"), "2026-05-03");
  assert.equal(normalizeUpc("00000000000000"), "");
  assert.equal(titleCaseProductName("EH TAYLOR BIB BOURBON"), "EH Taylor BIB Bourbon");
});

test("Michigan payload becomes source-backed app catalog data", () => {
  const text = fs.readFileSync(path.join(__dirname, "fixtures", "michigan-pricebook-snippet.txt"), "utf8");
  const rows = parseMichiganPriceBookText(text, {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });
  const payload = buildImportPayload(rows, "2026-05-28T00:00:00.000Z");
  const appCatalog = buildAppCatalogPayload([payload], "2026-05-28T00:00:00.000Z");

  assert.equal(payload.rawRecordCount, 5);
  assert.equal(payload.bottleCount, 5);
  assert.equal(appCatalog.bottles[0].id.startsWith("michigan-lcc-"), true);
  assert.equal(appCatalog.bottles[0].sourcePriceLabel, "Michigan LCC shelf");
  assert.equal(appCatalog.bottles[0].sourceRefs[0].sourceId, "michigan_lcc_price_book");
});
