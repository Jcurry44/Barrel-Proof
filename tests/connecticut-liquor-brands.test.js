const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildImportPayload,
  includeRow,
  parseConnecticutJson,
  parseWholesalers
} = require("../tools/import-connecticut-liquor-brands.js");
const { buildAppCatalogPayload } = require("../tools/build-imported-catalog.js");

test("Connecticut importer keeps serious whiskey categories beyond bourbon", () => {
  const rows = parseConnecticutJson([
    {
      brand_name: "SAGAMORE RYE",
      ct_registration_number: "LBD.0200001",
      status: "ACTIVE",
      effective: "2026-01-01T00:00:00.000",
      expiration: "2029-01-01T00:00:00.000",
      out_of_state_shipper: "SAGAMORE WHISKEY LLC",
      supervisor_credential: "LSL.0000001",
      wholesalers: "CONNECTICUT DISTRIBUTORS INC (LIW.0000532)"
    },
    {
      brand_name: "BERNHEIM ORIGINAL WHEAT WHISKEY",
      ct_registration_number: "LBD.0200002",
      status: "ACTIVE",
      out_of_state_shipper: "HEAVEN HILL SALES CO"
    },
    {
      brand_name: "FOUND NORTH CANADIAN WHISKY BATCH 009",
      ct_registration_number: "LBD.0200003",
      status: "ACTIVE",
      out_of_state_shipper: "FOUND NORTH WHISKY"
    },
    {
      brand_name: "AUGUSTA DISTILLERY WHEATED BOURBON WHISKEY CASK STRENGTH SINGLE BARREL",
      ct_registration_number: "LBD.0200004",
      status: "ACTIVE",
      out_of_state_shipper: "MICHAEL SKURNIK WINES INC"
    }
  ], {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  }).filter((row) => includeRow(row, "american"));

  assert.equal(rows.length, 4);
  assert.equal(rows[0].category, "Rye Whiskey");
  assert.equal(rows[1].category, "Wheat Whiskey");
  assert.equal(rows[2].category, "Canadian Whisky");
  assert.equal(rows[3].category, "Wheated Bourbon");
});

test("Connecticut importer rejects whiskey-adjacent false positives", () => {
  const rows = parseConnecticutJson([
    {
      brand_name: "BOURBON BARREL AGED CABERNET SAUVIGNON",
      ct_registration_number: "LBD.0300001",
      status: "ACTIVE"
    },
    {
      brand_name: "GOOSE ISLAND BOURBON COUNTY BRAND STOUT",
      ct_registration_number: "LBD.0300002",
      status: "ACTIVE"
    },
    {
      brand_name: "JACK DANIEL'S TENNESSEE FIRE",
      ct_registration_number: "LBD.0300003",
      status: "ACTIVE"
    },
    {
      brand_name: "MISUNDERSTOOD GINGER SPICED WHISKEY",
      ct_registration_number: "LBD.0300004",
      status: "ACTIVE"
    }
  ], {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  }).filter((row) => includeRow(row, "american"));

  assert.equal(rows.length, 0);
});

test("Connecticut importer parses wholesaler credentials", () => {
  assert.deepEqual(parseWholesalers("MSW CT LLC (LIW.0000775), WINEBOW INC (LIW.0000548)"), [
    { name: "MSW CT LLC", credential: "LIW.0000775" },
    { name: "Winebow Inc", credential: "LIW.0000548" }
  ]);
});

test("Connecticut payload becomes price-free app catalog data", () => {
  const rows = parseConnecticutJson([
    {
      brand_name: "SAGAMORE RYE",
      ct_registration_number: "LBD.0200001",
      status: "ACTIVE",
      effective: "2026-01-01T00:00:00.000",
      expiration: "2029-01-01T00:00:00.000",
      out_of_state_shipper: "SAGAMORE WHISKEY LLC"
    }
  ], {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  }).filter((row) => includeRow(row, "american"));
  const payload = buildImportPayload(rows, "2026-05-28T00:00:00.000Z", rows.length, ["fixture.json"]);
  const appCatalog = buildAppCatalogPayload([payload], "2026-05-28T00:00:00.000Z");

  assert.equal(payload.bottleCount, 1);
  assert.equal(appCatalog.bottles[0].id.startsWith("connecticut-liquor-"), true);
  assert.equal(appCatalog.bottles[0].category, "Rye Whiskey");
  assert.equal(appCatalog.bottles[0].sourceRetailPrice, null);
  assert.equal(appCatalog.bottles[0].sourcePriceLabel, "No retail price in CT registration");
  assert.equal(appCatalog.bottles[0].labelApprovals[0].ctRegistrationNumber, "LBD.0200001");
});
