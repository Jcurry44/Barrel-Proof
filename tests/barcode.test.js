const test = require("node:test");
const assert = require("node:assert/strict");
const barcode = require("../src/logic/barcode.js");

test("candidateKeys covers UPC-A / EAN-13 / leading-zero spellings of one code", () => {
  // Real case from the catalog: the same bottle appears as both of these.
  const a = barcode.candidateKeys("00860006290917");
  const b = barcode.candidateKeys("860006290917");
  const overlap = a.filter((key) => b.includes(key));
  assert.ok(overlap.length > 0, "both spellings share at least one key");
  assert.ok(barcode.candidateKeys("088004021344").includes("88004021344".padStart(12, "0")));
});

test("rejects things that are not barcodes", () => {
  assert.deepEqual(barcode.candidateKeys(""), []);
  assert.deepEqual(barcode.candidateKeys("abc"), []);
  assert.deepEqual(barcode.candidateKeys("123"), []);
  assert.deepEqual(barcode.candidateKeys("123456789012345678"), []);
  assert.equal(barcode.isLikelyBarcode("scan me"), false);
  assert.equal(barcode.isLikelyBarcode("088004021344"), true);
});

test("buildIndex + lookup match across spellings, scanner formatting, and misses", () => {
  const bottles = [
    { id: "tenth-mtn", upc: "00860006290917", barcodes: [] },
    { id: "rare-breed", upc: "088004021344", barcodes: ["88004021344"] }
  ];
  const index = barcode.buildIndex(bottles, {});
  // EAN-13 scan finds a bottle stored as zero-padded 14-digit.
  assert.equal(barcode.lookup(index, "0860006290917"), "tenth-mtn");
  assert.equal(barcode.lookup(index, "860006290917"), "tenth-mtn");
  // Scanner emits EAN-13 with leading 0 for a UPC-A catalog code.
  assert.equal(barcode.lookup(index, "0088004021344"), "rare-breed");
  // Scanner text with stray spaces/dashes still resolves.
  assert.equal(barcode.lookup(index, " 088004-021344 "), "rare-breed");
  assert.equal(barcode.lookup(index, "999999999999"), null);
});

test("user-taught links win and resolve across spellings", () => {
  const bottles = [{ id: "catalog-owner", upc: "012345678905", barcodes: [] }];
  const index = barcode.buildIndex(bottles, {
    "012345678905": "my-correction",
    "612345678901": "store-pick-bottle"
  });
  assert.equal(barcode.lookup(index, "012345678905"), "my-correction", "user link overrides catalog");
  assert.equal(barcode.lookup(index, "0612345678901"), "store-pick-bottle", "user link matches EAN spelling");
});
