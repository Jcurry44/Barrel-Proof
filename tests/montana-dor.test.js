const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildImportPayload,
  normalizeSizeCode,
  parseItemCode,
  parseMontanaPriceDiskRows,
  parseProductDetails
} = require("../tools/import-montana-dor.js");
const { buildAppCatalogPayload } = require("../tools/build-imported-catalog.js");

test("Montana price disk importer keeps bourbon class and Tennessee rows", () => {
  const rows = parseMontanaPriceDiskRows([
    ["Month", "Item Code", "Description", "Units", "Price", "Inv Class", "Maintained", "Repackable", "Repack Quantity"],
    ["05", "151-018353-10", "FOUR ROSES KENTUCKY STRAIGHT BOURBON", 12, 31.7, "1", "True", "1", 0],
    ["05", "170-026826-75", "JACK DANIELS BLACK LABEL", 12, 26.95, "1", "True", "1", 0],
    ["05", "425-080023-75", "BUFFALO TRACE DIST BOURBON CREAM LIQUEUR", 12, 19.95, "S", "False", "1", 0],
    ["05", "498-087282-37", "CASAMIGOS BLANCO TEQUILA 100% AGAVE", 12, 23.25, "S", "True", "1", 0]
  ], {
    retrievedAt: "2026-05-28T00:00:00.000Z",
    year: "2026"
  });

  assert.deepEqual(rows.map((row) => row.itemCode), ["151-018353-10", "170-026826-75"]);
  assert.equal(rows[0].category, "Bourbon");
  assert.equal(rows[0].size, "1L");
  assert.equal(rows[0].bottlePrice, 31.7);
  assert.equal(rows[0].maintained, true);
  assert.equal(rows[1].category, "Tennessee Whiskey");
});

test("Montana parser supports name matches in miscellaneous whiskey classes", () => {
  const rows = parseMontanaPriceDiskRows([
    ["Month", "Item Code", "Description", "Units", "Price", "Inv Class", "Maintained", "Repackable", "Repack Quantity"],
    ["05", "199-027725-75", "GRAND TETON COLTER'S RUN BOURBON", 6, 42.15, "S", "False", "1", 0],
    ["05", "401-086490-75", "THOMAS S MOORE KSBW FINISHED CAB SAV CSK", 6, 89.95, "S", "False", "1", 0],
    ["05", "199-027782-37", "JIM BEAM APPLE FLAVORED WHISKEY", 12, 10.25, "S", "False", "1", 0],
    ["05", "401-076502-75", "OLE SMOKY TENNESSEE COOKIE DOUGH WHISKEY", 6, 18.1, "S", "False", "1", 0]
  ], {
    retrievedAt: "2026-05-28T00:00:00.000Z",
    year: "2026"
  });

  assert.deepEqual(rows.map((row) => row.itemCode), ["199-027725-75", "401-086490-75"]);
  assert.equal(rows[0].name, "Grand Teton Colter's Run Bourbon");
});

test("Montana importer keeps Scotch, Canadian, Irish, rye, and world whisky classes", () => {
  const rows = parseMontanaPriceDiskRows([
    ["Month", "Item Code", "Description", "Units", "Price", "Inv Class", "Maintained", "Repackable", "Repack Quantity"],
    ["05", "100-005991-75", "LAPHROAIG SHERRY OAK FINISH", 6, 86.95, "S", "False", "1", 0],
    ["05", "110-011356-75", "CROWN ROYAL MARQUIS BLENDED CANADIAN WHK", 6, 31.95, "S", "False", "1", 0],
    ["05", "120-015855-75", "REDBREAST LUSTAU EDITION IRISH WHISKEY", 6, 61.65, "S", "False", "1", 0],
    ["05", "181-025126-75", "REDEMPTION SUR LEE STRAIGHT RYE WHISKEY", 6, 47.95, "S", "False", "1", 0],
    ["05", "130-015978-75", "KAVALAN SHERRY OAK WHISKY (TAIWAN)", 6, 150.2, "S", "False", "1", 0],
    ["05", "130-016009-75", "NIKKA WHISKY FROM THE BARREL", 6, 70.2, "S", "False", "1", 0]
  ], {
    retrievedAt: "2026-05-28T00:00:00.000Z",
    year: "2026"
  });

  assert.deepEqual(rows.map((row) => row.category), [
    "Scotch Whisky",
    "Canadian Whisky",
    "Irish Whiskey",
    "Rye Whiskey",
    "Single Malt / World Whisky",
    "Japanese Whisky"
  ]);
});

test("Montana importer rejects flavored whiskey from serious mode", () => {
  const rows = parseMontanaPriceDiskRows([
    ["Month", "Item Code", "Description", "Units", "Price", "Inv Class", "Maintained", "Repackable", "Repack Quantity"],
    ["05", "401-066097-75", "PROPER NO.12 TWELVE IRISH APPLE WHISKEY", 6, 23.95, "S", "False", "1", 0],
    ["05", "199-027782-37", "JIM BEAM APPLE FLAVORED WHISKEY", 12, 10.25, "S", "False", "1", 0],
    ["05", "401-086771-75", "OLE SMOKY TENNESSEE MNSHNE WHT LIGHTNIN", 6, 23.1, "S", "False", "1", 0],
    ["05", "401-076602-75", "WHISKEY IN THE WILD TWIST OF ORANGE", 6, 60.6, "S", "False", "1", 0],
    ["05", "401-076335-75", "BIB&TUCKER GOLD ROAST BN INFUSE COFFE", 6, 41.7, "S", "False", "1", 0],
    ["05", "401-076718-75", "VON PAYNE BLACK BLENDED WK BLACK CURRANT", 6, 49.65, "S", "False", "1", 0],
    ["05", "401-075268-75", "KURVBALL ORIGINAL BARBECUE WHISKEY", 6, 25.1, "S", "False", "1", 0],
    ["05", "401-073721-75", "EVAN WILLIAMS FIRE", 12, 14.9, "S", "False", "1", 0],
    ["05", "401-086470-75", "AMADOR WHISKEY CO DOUBLE BRRL RYE PORT", 6, 57.4, "S", "False", "1", 0],
    ["05", "401-085631-75", "CHICKEN COCK CHANTICLEER COGNAC BRL FNSH", 6, 240.05, "S", "False", "1", 0]
  ], {
    retrievedAt: "2026-05-28T00:00:00.000Z",
    year: "2026"
  });

  assert.deepEqual(rows.map((row) => row.itemCode), ["401-086470-75", "401-085631-75"]);
  assert.equal(rows[0].category, "Rye Whiskey");
  assert.equal(rows[1].category, "American Whiskey");
});

test("Montana helpers parse item code, size, proof, and age", () => {
  assert.deepEqual(parseItemCode("151-020150-75"), {
    productClass: "151",
    nabcaNumber: "020150",
    sizeCode: "75"
  });
  assert.equal(normalizeSizeCode("17"), "1.75L");

  const details = parseProductDetails("OLD RIP VAN WINKLE 10 YEAR/107 PROOF", "75");
  assert.equal(details.name, "Old Rip Van Winkle");
  assert.equal(details.proof, 107);
  assert.equal(details.age, "10 years");
  assert.equal(details.size, "750ml");
});

test("Montana payload becomes source-backed app catalog data", () => {
  const rows = parseMontanaPriceDiskRows([
    ["Month", "Item Code", "Description", "Units", "Price", "Inv Class", "Maintained", "Repackable", "Repack Quantity"],
    ["05", "151-018353-10", "FOUR ROSES KENTUCKY STRAIGHT BOURBON", 12, 31.7, "1", "True", "1", 0]
  ], {
    retrievedAt: "2026-05-28T00:00:00.000Z",
    year: "2026"
  });
  const payload = buildImportPayload(rows, "2026-05-28T00:00:00.000Z");
  const appCatalog = buildAppCatalogPayload([payload], "2026-05-28T00:00:00.000Z");

  assert.equal(payload.rawRecordCount, 1);
  assert.equal(payload.bottleCount, 1);
  assert.equal(appCatalog.bottles[0].id.startsWith("montana-dor-"), true);
  assert.equal(appCatalog.bottles[0].sourcePriceLabel, "Montana DOR price");
});
