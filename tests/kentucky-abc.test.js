const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildImportPayload,
  includeRow,
  normalizeSize,
  parseKentuckyAbcRows
} = require("../tools/import-kentucky-abc.js");
const { buildAppCatalogPayload } = require("../tools/build-imported-catalog.js");

const HEADERS = [
  "Item Number",
  "Tax Trade Bureau ID",
  "Item Type",
  "Status",
  "Brand Description",
  "Label Description",
  "Vintage",
  "Appellation",
  "Container Type",
  "Pkg Configuration",
  "Value Added Pkg",
  "Combo Pkg",
  "Percent Alcohol",
  "Selling Units",
  "Unit Size",
  "Unit Measure",
  "Supplier Number",
  "Supplier Name",
  "Distributor Number",
  "Distributor Name",
  "Inception Date",
  "End Date",
  "Revised Date",
  "Approval Number"
];

function parseFixture(records) {
  const rows = [
    HEADERS,
    ...records.map((record) => HEADERS.map((header) => record[header] || ""))
  ];

  return parseKentuckyAbcRows(rows, {
    retrievedAt: "2026-05-28T00:00:00.000Z",
    sourceFile: "fixture.xlsx"
  });
}

test("Kentucky ABC importer keeps clean bourbon brand registrations", () => {
  const rows = parseFixture([
    {
      "Tax Trade Bureau ID": "26085001000197",
      Status: "Active",
      "Brand Description": "BARRELL BOURBON",
      "Label Description": "BARRELL BOURBON",
      "Container Type": "BTL",
      "Value Added Pkg": "No",
      "Combo Pkg": "No",
      "Percent Alcohol": "60",
      "Selling Units": "1",
      "Unit Size": "750",
      "Unit Measure": "ML",
      "Supplier Number": "999-OSDWS-1032",
      "Supplier Name": "Mhw Ltd",
      "Distributor Number": "056-WH-194890",
      "Distributor Name": "REPUBLIC NATIONAL DISTRIBUTING COMPANY, LLC",
      "Inception Date": "5/5/2026",
      "Approval Number": "KY-00196127-0001"
    }
  ]).filter((row) => includeRow(row, "bourbon"));

  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "Barrell Bourbon");
  assert.equal(rows[0].category, "Bourbon");
  assert.equal(rows[0].proof, 120);
  assert.equal(rows[0].size, "750ml");
  assert.equal(rows[0].colaNumber, "26085001000197");
  assert.equal(rows[0].distributors[0].permitNumber, "056-WH-194890");
});

test("Kentucky ABC importer rejects tea, beer, and low-ABV false positives", () => {
  const rows = parseFixture([
    {
      Status: "Active",
      "Brand Description": "Bourbon Lovers Tea",
      "Label Description": "Bourbon Lovers Tea",
      "Value Added Pkg": "No",
      "Combo Pkg": "No",
      "Percent Alcohol": "0",
      "Unit Size": "0",
      "Unit Measure": "ML",
      "Approval Number": "KY-00196908-0000"
    },
    {
      Status: "Active",
      "Brand Description": "Kentucky Bourbon Barrel Mango Wheat",
      "Label Description": "Kentucky Bourbon Barrel Mango Wheat",
      "Container Type": "KEG",
      "Value Added Pkg": "No",
      "Combo Pkg": "No",
      "Percent Alcohol": "8",
      "Unit Size": "15.5",
      "Unit Measure": "GA",
      "Approval Number": "KY-00190572-0000"
    },
    {
      Status: "Active",
      "Brand Description": "Bourbon Barrel Aged Night Whale",
      "Label Description": "Bourbon Barrel Aged Night Whale",
      "Value Added Pkg": "No",
      "Combo Pkg": "No",
      "Percent Alcohol": "0",
      "Unit Size": "0",
      "Unit Measure": "ML",
      "Approval Number": "KY-00080752-0000"
    }
  ]).filter((row) => includeRow(row, "bourbon"));

  assert.equal(rows.length, 0);
});

test("Kentucky ABC importer keeps serious Tennessee whiskey searches", () => {
  const rows = parseFixture([
    {
      "Tax Trade Bureau ID": "26001001000111",
      Status: "Active",
      "Brand Description": "GEORGE DICKEL BOTTLED IN BOND TENNESSEE WHISKY",
      "Label Description": "GEORGE DICKEL BOTTLED IN BOND TENNESSEE WHISKY",
      "Container Type": "BTL",
      "Value Added Pkg": "No",
      "Combo Pkg": "No",
      "Percent Alcohol": "50",
      "Unit Size": "750",
      "Unit Measure": "ML",
      "Supplier Name": "Diageo North America Inc",
      "Inception Date": "1/10/2026",
      "Approval Number": "KY-00190000-0000"
    }
  ]).filter((row) => includeRow(row, "bourbon"));

  assert.equal(rows.length, 1);
  assert.equal(rows[0].category, "Tennessee Whiskey");
  assert.equal(rows[0].proof, 100);
});

test("Kentucky ABC importer keeps rye, wheated, wheat whiskey, and Found North-style bottles", () => {
  const rows = parseFixture([
    {
      Status: "Active",
      "Brand Description": "OLD FORESTER RYE WHISKY",
      "Label Description": "OLD FORESTER RYE WHISKY",
      "Container Type": "BTL",
      "Value Added Pkg": "No",
      "Combo Pkg": "No",
      "Percent Alcohol": "50",
      "Unit Size": "750",
      "Unit Measure": "ML",
      "Approval Number": "KY-00197000-0001"
    },
    {
      Status: "Active",
      "Brand Description": "LARCENY WHEATED BOURBON",
      "Label Description": "LARCENY WHEATED BOURBON",
      "Container Type": "BTL",
      "Value Added Pkg": "No",
      "Combo Pkg": "No",
      "Percent Alcohol": "46",
      "Unit Size": "750",
      "Unit Measure": "ML",
      "Approval Number": "KY-00197000-0002"
    },
    {
      Status: "Active",
      "Brand Description": "BERNHEIM ORIGINAL WHEAT WHISKEY",
      "Label Description": "BERNHEIM ORIGINAL WHEAT WHISKEY",
      "Container Type": "BTL",
      "Value Added Pkg": "No",
      "Combo Pkg": "No",
      "Percent Alcohol": "45",
      "Unit Size": "750",
      "Unit Measure": "ML",
      "Approval Number": "KY-00197000-0003"
    },
    {
      Status: "Active",
      "Brand Description": "FOUND NORTH WHISKY BATCH 009",
      "Label Description": "FOUND NORTH WHISKY BATCH 009",
      "Container Type": "BTL",
      "Value Added Pkg": "No",
      "Combo Pkg": "No",
      "Percent Alcohol": "63.1",
      "Unit Size": "750",
      "Unit Measure": "ML",
      "Approval Number": "KY-00197000-0004"
    }
  ]).filter((row) => includeRow(row, "american"));

  assert.deepEqual(rows.map((row) => row.category), [
    "Rye Whiskey",
    "Wheated Bourbon",
    "Wheat Whiskey",
    "Canadian Whisky"
  ]);
});

test("Kentucky ABC importer rejects flavored whiskey but keeps serious cask finishes", () => {
  const rows = parseFixture([
    {
      Status: "Active",
      "Brand Description": "EVAN WILLIAMS HONEY WHISKEY",
      "Label Description": "EVAN WILLIAMS HONEY WHISKEY",
      "Container Type": "BTL",
      "Value Added Pkg": "No",
      "Combo Pkg": "No",
      "Percent Alcohol": "35",
      "Unit Size": "750",
      "Unit Measure": "ML",
      "Approval Number": "KY-00197001-0001"
    },
    {
      Status: "Active",
      "Brand Description": "BALLONTIN CHOCOLATE WHISKEY",
      "Label Description": "BALLONTIN CHOCOLATE WHISKEY",
      "Container Type": "BTL",
      "Value Added Pkg": "No",
      "Combo Pkg": "No",
      "Percent Alcohol": "30",
      "Unit Size": "750",
      "Unit Measure": "ML",
      "Approval Number": "KY-00197001-0004"
    },
    {
      Status: "Active",
      "Brand Description": "BRAXTON LABS DRY HOPPED RYE GRISSET",
      "Label Description": "BRAXTON LABS DRY HOPPED RYE GRISSET",
      "Container Type": "BTL",
      "Value Added Pkg": "No",
      "Combo Pkg": "No",
      "Percent Alcohol": "0",
      "Unit Size": "0",
      "Unit Measure": "ML",
      "Approval Number": "KY-00197001-0005"
    },
    {
      Status: "Active",
      "Brand Description": "TENNESSEE ACE",
      "Label Description": "TENNESSEE ACE",
      "Container Type": "BTL",
      "Value Added Pkg": "No",
      "Combo Pkg": "No",
      "Percent Alcohol": "40",
      "Unit Size": "750",
      "Unit Measure": "ML",
      "Approval Number": "KY-00197001-0006"
    },
    {
      Status: "Active",
      "Brand Description": "CASEY JONES WHISKEY FINISHED IN HONEY BARRELS",
      "Label Description": "CASEY JONES WHISKEY FINISHED IN HONEY BARRELS",
      "Container Type": "BTL",
      "Value Added Pkg": "No",
      "Combo Pkg": "No",
      "Percent Alcohol": "50",
      "Unit Size": "750",
      "Unit Measure": "ML",
      "Approval Number": "KY-00197001-0002"
    },
    {
      Status: "Active",
      "Brand Description": "RYE WHISKEY CABERNET CASK FINISHED",
      "Label Description": "RYE WHISKEY CABERNET CASK FINISHED",
      "Container Type": "BTL",
      "Value Added Pkg": "No",
      "Combo Pkg": "No",
      "Percent Alcohol": "54",
      "Unit Size": "750",
      "Unit Measure": "ML",
      "Approval Number": "KY-00197001-0003"
    }
  ]).filter((row) => includeRow(row, "american"));

  assert.deepEqual(rows.map((row) => row.name), [
    "Casey Jones Whiskey Finished in Honey Barrels",
    "Rye Whiskey Cabernet Cask Finished"
  ]);
});

test("Kentucky ABC helpers normalize bottle sizes and suppress case volumes", () => {
  assert.equal(normalizeSize(750, "ML"), "750ml");
  assert.equal(normalizeSize(1000, "ML"), "1L");
  assert.equal(normalizeSize(1.75, "LT"), "1.75L");
  assert.equal(normalizeSize(9, "LT"), null);
});

test("Kentucky ABC payload becomes price-free app catalog data", () => {
  const rows = parseFixture([
    {
      "Tax Trade Bureau ID": "26085001000197",
      Status: "Active",
      "Brand Description": "BARRELL BOURBON",
      "Label Description": "BARRELL BOURBON",
      "Container Type": "BTL",
      "Value Added Pkg": "No",
      "Combo Pkg": "No",
      "Percent Alcohol": "60",
      "Unit Size": "750",
      "Unit Measure": "ML",
      "Supplier Name": "Mhw Ltd",
      "Inception Date": "5/5/2026",
      "Approval Number": "KY-00196127-0001"
    }
  ]).filter((row) => includeRow(row, "bourbon"));
  const payload = buildImportPayload(rows, "2026-05-28T00:00:00.000Z", rows.length, ["fixture.xlsx"]);
  const appCatalog = buildAppCatalogPayload([payload], "2026-05-28T00:00:00.000Z");

  assert.equal(payload.bottleCount, 1);
  assert.equal(appCatalog.bottles[0].id.startsWith("kentucky-abc-"), true);
  assert.equal(appCatalog.bottles[0].sourceRetailPrice, null);
  assert.equal(appCatalog.bottles[0].sourcePriceLabel, "No retail price in KY registration");
  assert.equal(appCatalog.bottles[0].labelApprovals[0].kentuckyApprovalNumber, "KY-00196127-0001");
});
