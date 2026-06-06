const test = require("node:test");
const assert = require("node:assert");

require("../src/logic/prices.js");
const P = globalThis.BarrelPrices;
const rec = require("../src/logic/recommendation.js");

test("add records observations newest-first and ignores junk", () => {
  const state = { prices: {} };
  assert.equal(P.add(state, "a", 45, "Total Wine", 1), true);
  assert.equal(P.add(state, "a", 50, "", 2), true);
  assert.equal(P.add(state, "a", -3), false, "non-positive price rejected");
  assert.equal(P.add(state, "a", "abc"), false, "non-number rejected");
  assert.equal(state.prices.a.length, 2);
  assert.equal(state.prices.a[0].price, 50, "newest first");
});

test("stats compute count/min/max/median/latest", () => {
  const state = { prices: {} };
  [40, 60, 50].forEach((p, i) => P.add(state, "b", p, "", i));
  const s = P.stats(state, "b");
  assert.equal(s.count, 3);
  assert.equal(s.min, 40);
  assert.equal(s.max, 60);
  assert.equal(s.median, 50);
  assert.equal(s.latest, 50, "latest = most recent add");
});

test("removeAt deletes one and clears empty entries", () => {
  const state = { prices: {} };
  P.add(state, "c", 30);
  P.removeAt(state, "c", 0);
  assert.equal(state.prices.c, undefined);
});

test("observed price becomes the buy/pass reference, ahead of MSRP and fair value", () => {
  const bottle = { name: "Some Bourbon", msrp: 80, fairPrice: 70, observedPrice: 45, observedCount: 3 };
  const ref = rec.getReferencePriceInfo(bottle);
  assert.equal(ref.type, "observed");
  assert.equal(ref.value, 45);
  assert.equal(ref.confidence, "high");
});
