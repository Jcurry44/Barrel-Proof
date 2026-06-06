const test = require("node:test");
const assert = require("node:assert");

require("../src/logic/families.js");
const F = globalThis.BarrelFamilies;

test("classify maps brands to their distillery and parent", () => {
  assert.equal(F.classify({ name: "W.L. Weller 12 Year" }).distilleryId, "buffalo-trace");
  assert.equal(F.classify({ name: "Weller Full Proof" }).parent, "Sazerac");
  assert.equal(F.classify({ name: "Knob Creek 12 Year" }).distilleryId, "jim-beam");
  assert.equal(F.classify({ name: "Elijah Craig Barrel Proof" }).distilleryId, "heaven-hill");
  assert.equal(F.classify({ name: "Four Roses Single Barrel" }).distilleryId, "four-roses");
});

test("a foreign whiskey never inherits a (distributor) Kentucky distillery field", () => {
  // Distributors stamp distillery="Buffalo Trace" on imported world whiskies.
  const akashi = F.classify({ name: "Akashi Japanese Whiskey", distillery: "Buffalo Trace", producer: "Benchmark Beverage Company LLC" });
  assert.equal(akashi.matched, false);
  assert.notEqual(akashi.distilleryId, "buffalo-trace");

  const amrut = F.classify({ name: "Amrut Fusion SNGL Malt Whisky", distillery: "Buffalo Trace" });
  assert.notEqual(amrut.distilleryId, "buffalo-trace");

  // a real BT bottle with the same distillery field still classifies correctly
  assert.equal(F.classify({ name: "Eagle Rare 10", distillery: "Buffalo Trace" }).distilleryId, "buffalo-trace");
});

test("classify falls back to the bottle's own producer when unmatched", () => {
  const result = F.classify({ name: "Obscure Craft Bourbon", distillery: "Tiny Craft Co" });
  assert.equal(result.matched, false);
  assert.equal(result.distillery, "Tiny Craft Co");
});

test("classify lands unknown bottles in a single uncatalogued bucket", () => {
  const result = F.classify({ name: "Mystery Bourbon", distillery: "Unknown producer" });
  assert.equal(result.matched, false);
  assert.equal(result.distilleryId, "other-uncatalogued");
});

test("attributes derive connoisseur flags from text", () => {
  const weller = F.attributes({ name: "Weller Special Reserve", category: "Kentucky Straight Bourbon", mashBill: "wheated mash bill" });
  assert.equal(weller.style, "Wheated bourbon");

  const fr = F.attributes({ name: "Four Roses Single Barrel", category: "Kentucky Straight Bourbon" });
  assert.equal(fr.style, "High-rye bourbon");
  assert.equal(fr.singleBarrel, true);

  const bib = F.attributes({ name: "Henry McKenna 10 Year Bottled in Bond", category: "Kentucky Straight Bourbon", proof: 100 });
  assert.equal(bib.bottledInBond, true);

  const stagg = F.attributes({ name: "George T. Stagg", category: "Kentucky Straight Bourbon", proof: 138 });
  assert.equal(stagg.caskStrength, true);
  assert.equal(stagg.proofTier, "Barrel/cask (115–140)");

  const rye = F.attributes({ name: "Sazerac Rye", category: "Kentucky Straight Rye Whiskey", proof: 90 });
  assert.equal(rye.isRye, true);
  assert.equal(rye.style, "Rye whiskey");
});

test("buildIndex aggregates bottles into ranked distillery groups", () => {
  const bottles = [
    { id: "a", name: "Buffalo Trace", category: "Kentucky Straight Bourbon", proof: 90 },
    { id: "b", name: "Eagle Rare 10", category: "Kentucky Straight Bourbon", proof: 90 },
    { id: "c", name: "Weller 12", category: "Kentucky Straight Bourbon", proof: 90, mashBill: "wheated" },
    { id: "d", name: "Knob Creek 9", category: "Kentucky Straight Bourbon", proof: 100 }
  ];
  const index = F.buildIndex(bottles);
  const bt = index.find((g) => g.id === "buffalo-trace");
  assert.ok(bt, "Buffalo Trace group exists");
  assert.equal(bt.count, 3);
  assert.equal(bt.styleMix["Wheated bourbon"], 1);
  assert.ok(bt.brands.length >= 2, "brands are broken out");
  // matched houses rank ahead of fallback groups
  assert.equal(index[0].matched, true);
});
