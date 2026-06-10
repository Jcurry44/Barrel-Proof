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

const route = (name) => {
  const line = C.batchLineFor({ name });
  return line ? line.label : "(none)";
};

test("marquee lines route real catalog spellings correctly", () => {
  const cases = [
    ["Stagg Jr Batch 12", "Stagg (Jr.)"],
    ["Stagg Batch 23", "Stagg (Jr.)"],
    ["George T. Stagg 2024", "George T. Stagg"],
    ["Colonel E.H. Taylor, Jr. Barrel Proof Batch 9", "E.H. Taylor Barrel Proof"],
    ["Four Roses 2023 Limited Edition Small Batch", "Four Roses Limited Edition Small Batch"],
    ["Bookers Bourbon 2024-01 Springfield", "Booker's"],
    ["Michter's Ltd S/B 10YR Rye", "Michter's 10 Year"],
    ["Michter's Toasted Barrel Strength Rye Whiskey", "Michter's Toasted Barrel Rye"],
    ["Michter's Toasted Bourbon", "Michter's Toasted Barrel Bourbon"],
    ["Maker's Mark Cask Strength", "Maker's Mark Cask Strength"],
    ["Maker's Mark Wood Finishing Series 2019 Rc6 Bourbon Whisky", "Maker's Mark Wood Finishing Series"],
    ["Wild Turkey - Master's Keep - Bottled In Bond", "Wild Turkey Master's Keep"],
    ["Russell's Reserve BBN-13 YR", "Russell's Reserve 13 Year"],
    ["Heaven Hill Heritage Coll 2nd Edt", "Heaven Hill Heritage Collection"],
    ["J Daniels SNGL Brrl-Coy Hill 8", "Jack Daniel's Coy Hill High Proof"],
    ["Jack Daniel's SB Barrel Proof", "Jack Daniel's Single Barrel Barrel Proof"],
    ["Blantons Straight From The Barrel", "Blanton's Straight From The Barrel"],
    ["Pappy Van Winkle Fam Res-15 YR", "Van Winkle (Pappy / Old Rip)"],
    ["Old Fitzgerald 11YR Fall 24 Decanter Bottled In Bond", "Old Fitzgerald Bottled-in-Bond"]
  ];
  for (const [name, expected] of cases) assert.equal(route(name), expected, name);
});

test("standard W.L. Weller bottles route to Weller, never to BTAC William Larue Weller", () => {
  assert.equal(route("Buffalo Trace Antique Collection William Larue Weller Bourbon"), "William Larue Weller");
  assert.equal(route("W L Weller CYPB Straight Bourbon"), "Weller");
  assert.equal(route("Old W L Weller Special Reserve Kentucky Straight Bourbon Whiskey"), "Weller");
  assert.equal(route("W L Weller Full Proof Straight Bourbon"), "Weller");
  assert.equal(route("Old Weller Antique 107"), "Weller");
});

test("flagships and standard products never route to a batch line (false-positive guards)", () => {
  for (const name of [
    "Maker's Mark 46",
    "Maker's Mark Bourbon",
    "Russell's Reserve 10 Year",
    "Russell's Reserve Single Barrel",
    "Jack Daniel's 14YR Barrel Proof Tennessee Whiskey",
    "Jack Daniel's Old No 7",
    "Wild Turkey 101",
    "Heaven Hill Bottled In Bond 7YR",
    "Michter's US 1 Bourbon",
    "E.H. Taylor Small Batch",
    "Four Roses Small Batch Kentucky Straight Bourbon Whiskey",
    "Daniel Weller Spelt Wheat"
  ]) {
    assert.equal(route(name), "(none)", name);
  }
});

test("every batch line has identification guidance and sane data", () => {
  assert.ok(C.BATCH_LINES.length >= 25, "expected the full line set, got " + C.BATCH_LINES.length);
  for (const line of C.BATCH_LINES) {
    assert.ok(line.label, "line needs a label");
    assert.ok(line.howToId && line.howToId.length > 20, line.label + " needs a real howToId note");
    if (line.perBarrel) continue;
    assert.ok(Array.isArray(line.batches) && line.batches.length, line.label + " needs batches");
    for (const batch of line.batches) {
      assert.ok(String(C.batchLabel(batch) || "").length, line.label + " has an unlabeled batch");
      const proof = C.batchProof(batch);
      if (proof !== null) assert.ok(proof >= 80 && proof <= 150, line.label + " proof out of range: " + proof);
    }
  }
});

test("known-good spot checks: researched proofs survive future edits", () => {
  const byLabel = (label) => C.BATCH_LINES.find((line) => line.label === label);
  const proofOf = (lineLabel, batchLabel) => {
    const batch = byLabel(lineLabel).batches.find((b) => C.batchLabel(b) === batchLabel);
    return C.batchProof(batch);
  };
  assert.equal(proofOf("Stagg (Jr.)", "Batch 12"), 132.3);
  assert.equal(proofOf("George T. Stagg", "2019"), 116.9);
  assert.equal(proofOf("Elijah Craig Barrel Proof", "Batch 6"), 140.2);
  assert.equal(proofOf("Elijah Craig Barrel Proof", "A118"), 130.6);
  assert.equal(proofOf("Wild Turkey Master's Keep", "Beacon (final)"), 118);
  assert.equal(proofOf("Russell's Reserve 13 Year", "Batch 6"), 123.8);
  assert.equal(proofOf("Heaven Hill Heritage Collection", "2022 · 17 yr Bourbon"), 118.2);
  assert.equal(proofOf("Weller", "Full Proof"), 114);
  // George T. Stagg famously skipped 2021.
  assert.equal(byLabel("George T. Stagg").batches.some((b) => C.batchLabel(b) === "2021"), false);
});
