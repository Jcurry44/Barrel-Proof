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

test("a first-run profile seeds the recommender before any pour is logged", () => {
  const P = globalThis.BarrelPalate;
  const bottles = {
    tagged: { id: "tagged", name: "Tagged Bourbon", proof: 116, profile: ["cherry", "oak", "vanilla"], rarity: "Findable", msrp: 50, hypeIndex: 40 },
    plain: { id: "plain", name: "Plain Bourbon", proof: 90, profile: [], rarity: "Findable", msrp: 30, hypeIndex: 20 }
  };
  const cold = P.buildProfile({ tastings: [], matchups: [], statuses: {} }, bottles, {});
  assert.equal(cold.ready, false);
  const seeded = P.buildProfile({ tastings: [], matchups: [], statuses: {} }, bottles, { seed: { flavors: ["cherry", "oak"], proofPreference: 118 } });
  assert.equal(seeded.ready, true);
  assert.equal(seeded.seeded, true);
  assert.equal(seeded.proofPreference, 118);
  assert.ok(seeded.flavorScores.cherry > 0);
  const scored = P.scoreFor(bottles.tagged, seeded, {});
  assert.ok(scored.score > P.scoreFor(bottles.plain, seeded, {}).score, "cherry/oak at 116 proof beats a plain 90-proof pour");
  assert.ok(scored.reasons.some((reason) => /cherry & oak notes/.test(reason)));
  assert.ok(scored.reasons.some((reason) => /proof lane/.test(reason)));
  // The rationale reads like a friend, not a spreadsheet.
  const recs = P.recommend(Object.values(bottles), seeded, { statuses: {} }, { rec: { getReferencePriceInfo: (b) => ({ value: b.msrp, type: "msrp" }) } });
  assert.match(recs.buyNow[0].rationale, /hits your cherry & oak notes/);
  // Logged pours outweigh the stated proof preference over time.
  const logged = P.buildProfile({ tastings: [{ bottleId: "plain", score: 9.5 }, { bottleId: "plain", score: 9.5 }, { bottleId: "plain", score: 9.5 }], matchups: [], statuses: {} }, bottles, { seed: { flavors: [], proofPreference: 118 } });
  assert.ok(logged.proofPreference < 100, "three loved 90-proof pours pull the preference down, got " + logged.proofPreference);
});

test("an age-specific alias dragged in by a merge does not make a standard bottle allocated", () => {
  const P = globalThis.BarrelPalate;
  const knob = { name: "Knob Creek Straight Bourbon Whiskey", aliases: ["Knob Creek 9YR Bourbon", "KNOB CREEK 15YR BOURBON"] };
  assert.equal(P.availability(knob).tier, "shelf");
  // Brand-level aliases still vouch: a shorthand display name with a real alias.
  const orvw = { name: "ORVW 10YR", aliases: ["Old Rip Van Winkle 10 Year"] };
  assert.equal(P.availability(orvw).tier, "unicorn");
  const weller12 = { name: "Weller 12Y" };
  assert.equal(P.availability(weller12).tier, "allocated");
});

test("the buy lane keeps pricey findable bottles out unless the palate is emphatic", () => {
  const P = globalThis.BarrelPalate;
  const bottles = [
    { id: "cheap", name: "Solid Daily Bourbon", proof: 100, profile: ["cherry"], rarity: "Findable", msrp: 40, hypeIndex: 30 },
    { id: "pricey", name: "Decanter 17 Year Bourbon", proof: 118, profile: ["cherry"], rarity: "Findable", msrp: 336, hypeIndex: 30 }
  ];
  const seeded = P.buildProfile({ tastings: [], matchups: [], statuses: {} }, { cheap: bottles[0], pricey: bottles[1] }, { seed: { flavors: ["cherry"], proofPreference: 118 } });
  const recs = P.recommend(bottles, seeded, { statuses: {} }, { rec: { getReferencePriceInfo: (b) => ({ value: b.msrp, type: "msrp" }) } });
  assert.deepEqual(recs.buyNow.map((c) => c.bottle.id), ["cheap"]);
});
