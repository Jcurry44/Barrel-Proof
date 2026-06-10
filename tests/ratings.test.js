const test = require("node:test");
const assert = require("node:assert/strict");
const ratings = require("../src/logic/ratings.js");

const state = {
  tastings: [
    // Weller: loved sighted, mediocre blind — the "label tax" case.
    { bottleId: "weller", score: 9.5, context: "Neat pour" },
    { bottleId: "weller", score: 9.0, context: "Rocks" },
    { bottleId: "weller", score: 7.5, context: "Blind — Tasting Night" },
    { bottleId: "weller", score: 7.9, context: "Blind — Tasting Night" },
    // Rare Breed: underrated sighted, shines blind.
    { bottleId: "rare-breed", score: 8.0, context: "Neat pour" },
    { bottleId: "rare-breed", score: 9.2, context: "blind flight" },
    // ECBP: sighted only.
    { bottleId: "ecbp", score: 9.0, context: "Neat pour" },
    // junk that must be ignored
    { bottleId: "", score: 9 },
    { bottleId: "x", score: NaN }
  ]
};

test("bottleRatings splits sighted vs blind and computes the delta", () => {
  const r = ratings.bottleRatings(state);
  assert.equal(r.weller.sightedAvg, 9.3);
  assert.equal(r.weller.blindAvg, 7.7);
  assert.equal(r.weller.delta, 1.5, "positive delta = scores higher when the label is visible");
  assert.equal(r.weller.count, 4);
  assert.equal(r["rare-breed"].delta, -1.2, "negative delta = overperforms blind");
  assert.equal(r.ecbp.blindCount, 0);
  assert.equal(r.ecbp.delta, null, "no delta without both kinds of data");
  assert.equal(r.x, undefined);
});

test("blindGaps surfaces real divergence, biggest first", () => {
  const gaps = ratings.blindGaps(ratings.bottleRatings(state), 0.5);
  assert.deepEqual(gaps.map((g) => g.bottleId), ["weller", "rare-breed"]);
  assert.ok(gaps[0].delta > 0 && gaps[1].delta < 0);
  // ecbp (no blind data) never appears
  assert.ok(!gaps.some((g) => g.bottleId === "ecbp"));
});

test("categoryBoard ranks rated bottles within a style", () => {
  const bottles = [
    { id: "weller", name: "Weller Antique" },
    { id: "rare-breed", name: "Wild Turkey Rare Breed" },
    { id: "ecbp", name: "Elijah Craig Barrel Proof" }
  ];
  const attrs = {
    weller: { whiskeyType: "Bourbon", style: "Wheated bourbon" },
    "rare-breed": { whiskeyType: "Bourbon", caskStrength: true },
    ecbp: { whiskeyType: "Bourbon", caskStrength: true }
  };
  const attrFn = (b) => attrs[b.id];
  const r = ratings.bottleRatings(state);

  const cask = ratings.categoryBoard(r, bottles, attrFn, "cask");
  assert.deepEqual(cask.rows.map((row) => row.bottle.id), ["ecbp", "rare-breed"]);
  assert.equal(cask.summary.count, 2);

  const wheated = ratings.categoryBoard(r, bottles, attrFn, "wheated");
  assert.deepEqual(wheated.rows.map((row) => row.bottle.id), ["weller"]);

  const all = ratings.categoryBoard(r, bottles, attrFn, "all");
  assert.equal(all.rows.length, 3);
  assert.equal(all.rows[0].bottle.id, "ecbp", "highest avg first");
});

test("category matching covers the style axes", () => {
  assert.ok(ratings.matchesCategory({ bottledInBond: true }, "bib"));
  assert.ok(ratings.matchesCategory({ whiskeyType: "Rye whiskey" }, "rye"));
  assert.ok(ratings.matchesCategory({ singleBarrel: true }, "single"));
  assert.ok(ratings.matchesCategory({ finished: true }, "finished"));
  assert.ok(!ratings.matchesCategory({ whiskeyType: "Bourbon" }, "rye"));
  assert.ok(ratings.matchesCategory({}, "all"));
});
