const test = require("node:test");
const assert = require("node:assert");

require("../src/logic/families.js");
require("../src/logic/recommendation.js");
require("../src/logic/palate.js");
const P = globalThis.BarrelPalate;
const fam = globalThis.BarrelFamilies;
const rec = globalThis.BarrelRecommendation;
const deps = { families: fam, rec };

test("availability reads the connoisseur tier from the name", () => {
  assert.equal(P.availability({ name: "Russell's Reserve 13 Year" }).tier, "allocated");
  assert.equal(P.availability({ name: "Russell's Reserve 10 Year" }).tier, "shelf");
  assert.equal(P.availability({ name: "Pappy Van Winkle 15 Year" }).tier, "unicorn");
  assert.equal(P.availability({ name: "Buffalo Trace" }).tier, "shelf");
  assert.equal(P.availability({ name: "W.L. Weller 12 Year" }).tier, "allocated");
  // year-dated limited editions are allocated even with the year mid-name
  assert.equal(P.availability({ name: "Four Roses 2023 Limited Edition Small Batch" }).tier, "allocated");
});

test("realisticPrice never presents MSRP as a real price for allocated bottles", () => {
  const shelf = P.realisticPrice({ name: "Buffalo Trace", msrp: 30 }, rec);
  assert.equal(shelf.honest, true);
  assert.ok(shelf.value);

  const allocated = P.realisticPrice({ name: "W.L. Weller 12 Year", msrp: 35 }, rec);
  assert.equal(allocated.honest, false, "MSRP for an allocated bottle is flagged as not the real price");
});

test("buildProfile learns from a high-scored tasting", () => {
  const byId = { a: { id: "a", name: "Four Roses Single Barrel", category: "Kentucky Straight Bourbon", proof: 100, profile: ["spice"] } };
  const state = { statuses: {}, tastings: [{ bottleId: "a", score: 10, tags: ["rye", "spice"] }], matchups: [] };
  const profile = P.buildProfile(state, byId, deps);
  assert.equal(profile.ready, true);
  assert.ok((profile.styleScores["High-rye bourbon"] || 0) > 0, "high-rye preference learned");
});

test("recommend NEVER puts an unbuyable bottle in the buy-now lane", () => {
  const bottles = require("../src/data/imported-catalog-index.json").bottles;
  const byId = {};
  for (const b of bottles) byId[b.id] = b;
  const fr = bottles.find((b) => b.name.toLowerCase().includes("four roses single barrel"));
  const state = { statuses: {}, tastings: [{ bottleId: fr.id, score: 10, tags: ["rye", "spice"] }], matchups: [] };
  const profile = P.buildProfile(state, byId, deps);
  const out = P.recommend(bottles, profile, state, deps);
  assert.ok(out.buyNow.length > 0, "produces buy-now recommendations");
  assert.equal(out.buyNow.filter((c) => !c.avail.buyable).length, 0, "zero unbuyable bottles in buy-now");
  assert.ok(out.grails.every((c) => !c.avail.buyable), "grails are all allocated/unicorn");
  // no more than 2 from one distillery in the buy lane
  const counts = {};
  for (const c of out.buyNow) {
    const h = fam.classify(c.bottle).distilleryId;
    counts[h] = (counts[h] || 0) + 1;
  }
  assert.ok(Object.values(counts).every((n) => n <= 2), "buy-now is diversified across houses");
});
