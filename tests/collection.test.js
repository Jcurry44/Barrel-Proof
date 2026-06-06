const test = require("node:test");
const assert = require("node:assert");

require("../src/logic/collection.js");
const C = globalThis.BarrelCollection;

test("batchLineFor detects marquee batched lines (incl. OCR variants)", () => {
  assert.equal(C.batchLineFor({ name: "Elijah Craig Barrel Proof C923" }).label, "Elijah Craig Barrel Proof");
  assert.equal(C.batchLineFor({ name: "Elijah Craig Barrel PR. Bourbon" }).label, "Elijah Craig Barrel Proof");
  assert.equal(C.batchLineFor({ name: "Larceny Barrel Proof B522" }).label, "Larceny Barrel Proof");
  assert.equal(C.batchLineFor({ name: "Booker's Bourbon" }).label, "Booker's");
  assert.equal(C.batchLineFor({ name: "Buffalo Trace" }), null);
});

test("lineType classifies batched / pick / standard", () => {
  assert.equal(C.lineType({ name: "Elijah Craig Barrel Proof B523" }), "batched");
  assert.equal(C.lineType({ name: "Russell's Reserve Single Barrel Store Pick" }), "pick");
  assert.equal(C.lineType({ name: "Maker's Mark" }), "standard");
});

test("collapse merges duplicate spellings but keeps distinct ages", () => {
  const rows = [
    { id: "1", name: "Elijah Craig Barrel Proof C923" },
    { id: "2", name: "Elijah Craig Barrel PR. Bourbon" },
    { id: "3", name: "Elijah Craig Barrel Proof (PSB)" },
    { id: "4", name: "Eagle Rare 10 Year Bourbon" },
    { id: "5", name: "Ancient Age 1750ml" },
    { id: "6", name: "Ancient Age Bourbon" }
  ];
  const lines = C.collapse(rows);
  const ecbp = lines.find((g) => g.type === "batched");
  assert.ok(ecbp && ecbp.members.length === 3, "three ECBP spellings collapse to one line");
  assert.notEqual(C.lineKey({ name: "Eagle Rare 10" }), C.lineKey({ name: "Eagle Rare 17" }), "ages stay distinct");
});

test("collection model: count, batches, and statuses stay in sync", () => {
  const state = { statuses: {}, collection: {} };
  C.setCount(state, "a", 6);
  assert.equal(C.ownedCount(state, "a"), 6);
  assert.equal(state.statuses.a, "owned");

  C.toggleBatch(state, "b", "C923");
  C.toggleBatch(state, "b", "B522");
  assert.deepEqual(state.collection.b.batches, ["C923", "B522"]);
  assert.equal(state.statuses.b, "owned");

  C.setCount(state, "a", 0);
  assert.equal(C.ownedCount(state, "a"), 0);
  assert.equal(state.statuses.a, undefined, "clearing count clears owned status");

  assert.deepEqual(C.totals(state), { lines: 1, bottles: 2 });
});
