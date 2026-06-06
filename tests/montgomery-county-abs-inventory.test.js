const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildImportPayload,
  normalizeDate,
  normalizeSize,
  parseMontgomeryInventoryJson
} = require("../tools/import-montgomery-county-abs-inventory.js");
const { buildAppCatalogPayload } = require("../tools/build-imported-catalog.js");

test("Montgomery County ABS inventory importer keeps bourbon retail rows", () => {
  const rows = parseMontgomeryInventoryJson([
    {
      code: "69442",
      category: "STRAIGHT BOURBON WHISKEY",
      description: "BLANTON'S BOURBON (HAL) - 750ML",
      size: "750ML",
      totalinventory: "12",
      price: "76.99"
    }
  ], {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].productCode, "69442");
  assert.equal(rows[0].name, "Blanton's Bourbon (Hal)");
  assert.equal(rows[0].category, "Bourbon");
  assert.equal(rows[0].size, "750ml");
  assert.equal(rows[0].totalInventory, 12);
  assert.equal(rows[0].price, 76.99);
});

test("Montgomery County ABS inventory importer rejects BIB wine and gift packs", () => {
  const rows = parseMontgomeryInventoryJson([
    {
      code: "18911",
      category: "AMERICAN RED",
      description: "WOODBRIDGE CABERNET BIB 3/3L",
      size: "3L",
      totalinventory: "0",
      price: "21.99"
    },
    {
      code: "54150",
      category: "STRAIGHT BOURBON WHISKEY",
      description: "YELLOWSTONE BOURBON - 4/3PK BTL GIFT PACK - 375ML (3-Pack)",
      size: "3pk",
      totalinventory: "0",
      price: "49.99"
    }
  ], {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });

  assert.equal(rows.length, 0);
});

test("Montgomery County ABS inventory importer keeps sale price observations", () => {
  const rows = parseMontgomeryInventoryJson([
    {
      code: "11843",
      category: "BOTTLED IN BOND",
      description: "KENTUCKY GENTLEMAN - 750ML (1 Bottle)",
      size: "750ML",
      totalinventory: "552",
      price: "7.99",
      saleprice: "6.99",
      saleenddate: "2026-05-31T00:00:00.000"
    }
  ], {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].category, "Bottled in Bond Bourbon");
  assert.equal(rows[0].regularPrice, 7.99);
  assert.equal(rows[0].salePrice, 6.99);
  assert.equal(rows[0].price, 6.99);
  assert.equal(rows[0].saleEndDate, "2026-05-31");
});

test("Montgomery County ABS inventory importer keeps serious Tennessee whiskey", () => {
  const rows = parseMontgomeryInventoryJson([
    {
      code: "88521",
      category: "SOUR MASH WHISKEY",
      description: "JACK DANIELS BONDED 100P - 700ML",
      size: "700ML",
      totalinventory: "90",
      price: "32.99"
    }
  ], {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].category, "Tennessee Whiskey");
  assert.equal(rows[0].proof, 100);
});

test("Montgomery County ABS inventory importer keeps serious whiskey categories beyond bourbon", () => {
  const rows = parseMontgomeryInventoryJson([
    {
      code: "240550",
      category: "STRAIGHT RYE WHISKEY",
      description: "NEW RIFF BOTTLE IN BOND KENTUCKY STRAIGHT RYE WHISKEY - 750ML",
      size: "750ML",
      totalinventory: "14",
      price: "34.99"
    },
    {
      code: "45175",
      category: "SINGLE MALT SCOTCH",
      description: "ARDBEG CORRYVRECKAN - 750ML",
      size: "750ML",
      totalinventory: "4",
      price: "118.99"
    },
    {
      code: "78691",
      category: "CANADIAN WHISKEY",
      description: "CROWN ROYAL XO - 750ML",
      size: "750ML",
      totalinventory: "18",
      price: "44.99"
    },
    {
      code: "170453",
      category: "IRISH WHISKEY",
      description: "WRITERS TEARS POT STILL IRISH WHISKEY 750ML",
      size: "750ML",
      totalinventory: "8",
      price: "68.99"
    },
    {
      code: "76784",
      category: "AMERICAN SINGLE MALT",
      description: "BULLEIT SINGLE MALT WHISKEY  - 750ML",
      size: "750ML",
      totalinventory: "5",
      price: "57.99"
    },
    {
      code: "238884",
      category: "INDIAN WHISKY",
      description: "AMRUT PEATED INDIAN SINGLE MALT WHISKY - 750ML",
      size: "750ML",
      totalinventory: "2",
      price: "93.99"
    }
  ], {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });

  assert.deepEqual(rows.map((row) => row.category), [
    "Single Malt / World Whisky",
    "Scotch Whisky",
    "American Single Malt",
    "Canadian Whisky",
    "Rye Whiskey",
    "Irish Whiskey"
  ]);
});

test("Montgomery County ABS inventory importer rejects flavored serious-category rows", () => {
  const rows = parseMontgomeryInventoryJson([
    {
      code: "54455",
      category: "CANADIAN WHISKEY",
      description: "CROWN ROYAL-BLACKBERRY-375ML",
      size: "375ML",
      totalinventory: "20",
      price: "16.99"
    },
    {
      code: "79503",
      category: "IRISH WHISKEY",
      description: "JAMESON COLD BREW - 750ML",
      size: "750ML",
      totalinventory: "7",
      price: "33.99"
    },
    {
      code: "92580",
      category: "IMPORTED SCOTCH",
      description: "BUCHANANS DELUXE & PINEAPPLE 6PK 50ML (6-Pack)",
      size: "6pk",
      totalinventory: "0",
      price: "12.99"
    },
    {
      code: "54289",
      category: "BLENDED WHISKEY",
      description: "TWIN VALLEY DIRTY APPLES - 750ML",
      size: "750ML",
      totalinventory: "4",
      price: "11.99"
    },
    {
      code: "30323",
      category: "STRAIGHT BOURBON WHISKEY",
      description: "WOODINVILLE APPLEWOOD FINISHED BOURBON - 6/750ML",
      size: "750ML",
      totalinventory: "6",
      price: "46.99"
    },
    {
      code: "237778",
      category: "BLENDED WHISKEY",
      description: "BARRELL DOVETAIL RUM FINISHED WHISKEY - 750ML",
      size: "750ML",
      totalinventory: "9",
      price: "91.99"
    }
  ], {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });

  assert.deepEqual(rows.map((row) => row.productCode), ["237778", "30323"]);
  assert.equal(rows[0].category, "Blended Whiskey");
  assert.equal(rows[1].category, "Bourbon");
});

test("Montgomery County ABS inventory helpers normalize dates and sizes", () => {
  assert.equal(normalizeDate("2026-05-31T00:00:00.000"), "2026-05-31");
  assert.equal(normalizeSize("750ML"), "750ml");
  assert.equal(normalizeSize("1.75L"), "1.75L");
});

test("Montgomery County ABS inventory payload becomes app catalog retail data", () => {
  const rows = parseMontgomeryInventoryJson([
    {
      code: "69442",
      category: "STRAIGHT BOURBON WHISKEY",
      description: "BLANTON'S BOURBON (HAL) - 750ML",
      size: "750ML",
      totalinventory: "12",
      price: "76.99"
    }
  ], {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });
  const payload = buildImportPayload(rows, "2026-05-28T00:00:00.000Z", 1);
  const appCatalog = buildAppCatalogPayload([payload], "2026-05-28T00:00:00.000Z");

  assert.equal(payload.bottleCount, 1);
  assert.equal(appCatalog.bottles[0].id.startsWith("montgomery-inventory-"), true);
  assert.equal(appCatalog.bottles[0].sourceRetailPrice, 76.99);
  assert.equal(appCatalog.bottles[0].sourcePriceLabel, "MoCo ABS retail");
});
