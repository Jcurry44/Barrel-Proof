const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildImportPayload,
  includeRow,
  normalizeMaineRow,
  normalizeSize,
  parseMaineRows
} = require("../tools/import-maine-spirits.js");
const { buildAppCatalogPayload } = require("../tools/build-imported-catalog.js");

const HEADERS = [
  "Item .",
  "Description",
  "Size",
  "UOI",
  "Units",
  "Proof",
  "Product Category",
  "UPC",
  "Agency Cost",
  "Agency Sale Cost",
  "Agent Savings",
  "Retail Price",
  "Sales Price",
  "Retail Savings",
  "'Effective Start Date'",
  "'Effective End Date'"
];

function row(values) {
  return HEADERS.map((header) => values[header] || "");
}

test("Maine Spirits importer includes clean bourbon price-book rows", () => {
  const rows = parseMaineRows([
    HEADERS,
    row({
      "Item .": "21239",
      Description: "1792 SMALL BATCH KSBW 94P",
      Size: "1.75L",
      UOI: "BTL",
      Units: "1",
      Proof: "93.7",
      "Product Category": "WHISKEY",
      UPC: "80660001197",
      "Agency Cost": "49.20",
      "Retail Price": "59.99",
      "Sales Price": "49.99",
      "'Effective Start Date'": "05/01/2026",
      "'Effective End Date'": "05/31/2026"
    })
  ], {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].itemCode, "21239");
  assert.equal(rows[0].name, "1792 Small Batch KSBW");
  assert.equal(rows[0].category, "Bourbon");
  assert.equal(rows[0].size, "1.75L");
  assert.equal(rows[0].upc, "80660001197");
  assert.equal(rows[0].retailPrice, 59.99);
  assert.equal(rows[0].salesPrice, 49.99);
  assert.equal(rows[0].effectiveStartDate, "2026-05-01");
});

test("Maine Spirits importer rejects flavored and gift accessory rows", () => {
  const parsed = [
    normalizeMaineRow(row({
      "Item .": "9201",
      Description: "JIM BEAM KENTUCKY FIRE65P",
      Size: "750ML",
      "Product Category": "BOURBON",
      UPC: "80686000604",
      "Retail Price": "17.99"
    }), Object.fromEntries(HEADERS.map((header, index) => [header.replace(/^'+|'+$/g, ""), index]))),
    normalizeMaineRow(row({
      "Item .": "9202",
      Description: "WOODFORD RSV W/GLASS 90P",
      Size: "750ML",
      "Product Category": "BOURBON",
      UPC: "81128070048",
      "Retail Price": "39.99"
    }), Object.fromEntries(HEADERS.map((header, index) => [header.replace(/^'+|'+$/g, ""), index]))),
    normalizeMaineRow(row({
      "Item .": "9203",
      Description: "OLD ELK W/POURER 88P",
      Size: "750ML",
      "Product Category": "BOURBON",
      UPC: "86000353820",
      "Retail Price": "34.99"
    }), Object.fromEntries(HEADERS.map((header, index) => [header.replace(/^'+|'+$/g, ""), index]))),
    normalizeMaineRow(row({
      "Item .": "9204",
      Description: "LARCENYW/GLASS&FLASK 92P",
      Size: "750ML",
      "Product Category": "BOURBON",
      UPC: "96749002613",
      "Retail Price": "29.99"
    }), Object.fromEntries(HEADERS.map((header, index) => [header.replace(/^'+|'+$/g, ""), index])))
  ].filter(Boolean);

  assert.deepEqual(parsed.map((sourceRow) => includeRow(sourceRow, "bourbon")), [false, false, false, false]);
});

test("Maine Spirits importer keeps serious Tennessee whiskey", () => {
  const rows = parseMaineRows([
    HEADERS,
    row({
      "Item .": "6155",
      Description: "JACK DANIELS SINATRA 90P",
      Size: "1L",
      "Product Category": "WHISKEY",
      UPC: "82184090386",
      "Retail Price": "189.99"
    })
  ], {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].category, "Tennessee Whiskey");
});

test("Maine Spirits importer keeps serious whiskey categories beyond bourbon", () => {
  const rows = parseMaineRows([
    HEADERS,
    row({
      "Item .": "1001",
      Description: "ARDBEG 10YR SINGLE MALT 92P",
      Size: "750ML",
      Proof: "92",
      "Product Category": "SCOTCH",
      UPC: "5010494195286",
      "Retail Price": "62.99"
    }),
    row({
      "Item .": "1002",
      Description: "REDBREAST 12YR IRISH WHISKEY 80P",
      Size: "750ML",
      Proof: "80",
      "Product Category": "IRISH WHISKEY",
      UPC: "080432102163",
      "Retail Price": "74.99"
    }),
    row({
      "Item .": "1003",
      Description: "ALBERTA PREMIUM RYE CASK STRENGTH 127P",
      Size: "750ML",
      Proof: "127",
      "Product Category": "CANADIAN WHISKEY",
      UPC: "080686835123",
      "Retail Price": "79.99"
    }),
    row({
      "Item .": "1004",
      Description: "HIBIKI HARMONY JAPANESE WHISKY 86P",
      Size: "750ML",
      Proof: "86",
      "Product Category": "JAPANESE WHISKEY",
      UPC: "080686934123",
      "Retail Price": "99.99"
    }),
    row({
      "Item .": "1005",
      Description: "AMRUT FUSION SMWHSK 100P",
      Size: "750ML",
      Proof: "100",
      "Product Category": "WHISKEY",
      UPC: "8901193500001",
      "Retail Price": "84.99"
    }),
    row({
      "Item .": "1006",
      Description: "BERNHEIM STRAIGHT WHEAT WHISKEY 118P",
      Size: "750ML",
      Proof: "118",
      "Product Category": "WHISKEY",
      UPC: "096749000111",
      "Retail Price": "66.99"
    }),
    row({
      "Item .": "1007",
      Description: "FOUND NORTH GOLDEN FINCH 116.2P",
      Size: "750ML",
      Proof: "116.2",
      "Product Category": "WHISKEY",
      UPC: "096749000112",
      "Retail Price": "159.99"
    })
  ], {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });
  const byCode = Object.fromEntries(rows.map((sourceRow) => [sourceRow.itemCode, sourceRow.category]));

  assert.equal(byCode["1001"], "Scotch Whisky");
  assert.equal(byCode["1002"], "Irish Whiskey");
  assert.equal(byCode["1003"], "Rye Whiskey");
  assert.equal(byCode["1004"], "Japanese Whisky");
  assert.equal(byCode["1005"], "Single Malt / World Whisky");
  assert.equal(byCode["1006"], "Wheat Whiskey");
  assert.equal(byCode["1007"], "Canadian Whisky");
});

test("Maine Spirits importer rejects flavored whiskey, low-proof whiskey, and accessory packs", () => {
  const rows = parseMaineRows([
    HEADERS,
    row({
      "Item .": "9301",
      Description: "CROWN ROYAL REG APPLE 70P",
      Size: "750ML",
      Proof: "70",
      "Product Category": "CANADIAN WHISKEY",
      UPC: "082000000001",
      "Retail Price": "26.99"
    }),
    row({
      "Item .": "9302",
      Description: "OLE SMOKY BANANA CREAM35P",
      Size: "750ML",
      Proof: "35",
      "Product Category": "WHISKEY",
      UPC: "082000000002",
      "Retail Price": "24.99"
    }),
    row({
      "Item .": "9303",
      Description: "HATOZAKI W/ HBALL GLS 80P",
      Size: "750ML",
      Proof: "80",
      "Product Category": "JAPANESE WHISKEY",
      UPC: "082000000003",
      "Retail Price": "44.99"
    }),
    row({
      "Item .": "9305",
      Description: "TULLAMORE DEW GLASSVAP80P",
      Size: "750ML",
      Proof: "80",
      "Product Category": "IRISH WHISKEY",
      UPC: "082000000005",
      "Retail Price": "24.99"
    }),
    row({
      "Item .": "9306",
      Description: "WHISTLEPIG PIGLET 3PK100P",
      Size: "150ML",
      Proof: "100",
      "Product Category": "WHISKEY",
      UPC: "082000000006",
      "Retail Price": "29.99"
    }),
    row({
      "Item .": "9307",
      Description: "BROKEN ANTLER HOTHONEY70P",
      Size: "750ML",
      Proof: "70",
      "Product Category": "WHISKEY",
      UPC: "082000000007",
      "Retail Price": "29.99"
    }),
    row({
      "Item .": "9304",
      Description: "GARRISON BROS HONEYDEW 80P",
      Size: "750ML",
      Proof: "80",
      "Product Category": "BOURBON",
      UPC: "082000000004",
      "Retail Price": "89.99"
    })
  ], {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });

  assert.deepEqual(rows.map((sourceRow) => sourceRow.itemCode), ["9304"]);
  assert.equal(rows[0].category, "Bourbon");
});

test("Maine Spirits helpers normalize sizes", () => {
  assert.equal(normalizeSize("750ML"), "750ml");
  assert.equal(normalizeSize("1.00L"), "1L");
  assert.equal(normalizeSize("1.75L"), "1.75L");
});

test("Maine Spirits payload becomes source-backed app catalog data", () => {
  const rows = parseMaineRows([
    HEADERS,
    row({
      "Item .": "21239",
      Description: "1792 SMALL BATCH KSBW 94P",
      Size: "1.75L",
      UOI: "BTL",
      Units: "1",
      Proof: "93.7",
      "Product Category": "WHISKEY",
      UPC: "80660001197",
      "Retail Price": "59.99",
      "Sales Price": "49.99"
    })
  ], {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });
  const payload = buildImportPayload(rows, "2026-05-28T00:00:00.000Z");
  const appCatalog = buildAppCatalogPayload([payload], "2026-05-28T00:00:00.000Z");

  assert.equal(payload.bottleCount, 1);
  assert.equal(appCatalog.bottles[0].id.startsWith("maine-spirits-"), true);
  assert.equal(appCatalog.bottles[0].sourceRetailPrice, 49.99);
  assert.equal(appCatalog.bottles[0].sourcePriceLabel, "Maine Spirits retail");
});
