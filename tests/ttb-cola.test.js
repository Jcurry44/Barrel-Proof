const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  buildImportPayload,
  buildTtbDetailUrl,
  parseCsv,
  parseTtbColaCsv
} = require("../tools/import-ttb-cola.js");
const { buildAppCatalogPayload } = require("../tools/build-imported-catalog.js");

test("CSV parser keeps quoted commas inside cells", () => {
  const rows = parseCsv("Name,Class\n\"Example, Limited\",BOURBON\n");

  assert.deepEqual(rows, [
    ["Name", "Class"],
    ["Example, Limited", "BOURBON"]
  ]);
});

test("TTB importer keeps bourbon rows by default", () => {
  const csv = fs.readFileSync(path.join(__dirname, "fixtures", "ttb-cola-search-results.csv"), "utf8");
  const rows = parseTtbColaCsv(csv, {
    retrievedAt: "2026-05-28T00:00:00.000Z",
    sourceFile: "tests/fixtures/ttb-cola-search-results.csv"
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].ttbId, "24123001000001");
  assert.equal(rows[0].name, "Example Bourbon Single Barrel Select");
  assert.equal(rows[0].classType, "STRAIGHT BOURBON WHISKY");
  assert.equal(rows[0].detailUrl, buildTtbDetailUrl("24123001000001"));
});

test("TTB importer can widen to whiskey rows", () => {
  const csv = fs.readFileSync(path.join(__dirname, "fixtures", "ttb-cola-search-results.csv"), "utf8");
  const rows = parseTtbColaCsv(csv, {
    mode: "whiskey",
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });

  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.ttbId), ["24123001000001", "24123001000002"]);
});

test("TTB payload creates source-backed label approval bottles", () => {
  const csv = fs.readFileSync(path.join(__dirname, "fixtures", "ttb-cola-search-results.csv"), "utf8");
  const rows = parseTtbColaCsv(csv, {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });
  const payload = buildImportPayload(rows, "2026-05-28T00:00:00.000Z", ["ttb-export.csv"]);

  assert.equal(payload.rawRecordCount, 1);
  assert.equal(payload.uniqueRecordCount, 1);
  assert.equal(payload.bottleCount, 1);
  assert.equal(payload.bottles[0].sourceRefs[0].sourceId, "ttb_cola_public_registry");
  assert.equal(payload.bottles[0].labelApprovals[0].ttbId, "24123001000001");
});

test("catalog builder preserves TTB as label-approval-only data", () => {
  const csv = fs.readFileSync(path.join(__dirname, "fixtures", "ttb-cola-search-results.csv"), "utf8");
  const rows = parseTtbColaCsv(csv, {
    retrievedAt: "2026-05-28T00:00:00.000Z"
  });
  const payload = buildImportPayload(rows, "2026-05-28T00:00:00.000Z", ["ttb-export.csv"]);
  const appCatalog = buildAppCatalogPayload([payload], "2026-05-28T00:00:00.000Z");

  assert.equal(appCatalog.bottleCount, 1);
  assert.equal(appCatalog.bottles[0].id.startsWith("ttb-"), true);
  assert.equal(appCatalog.bottles[0].sourceRetailPrice, null);
  assert.equal(appCatalog.bottles[0].sourcePriceLabel, "No retail price in TTB registry");
});
