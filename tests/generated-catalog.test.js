const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const indexPath = path.join(__dirname, "../src/data/imported-catalog-index.json");
const legacyShimPath = path.join(__dirname, "../src/data/imported-catalog.js");

function loadIndex() {
  return JSON.parse(fs.readFileSync(indexPath, "utf8"));
}

test("generated catalog index is the app-load artifact, not the legacy JS shim", () => {
  const index = loadIndex();
  const shimBytes = fs.statSync(legacyShimPath).size;

  assert.ok(index.fullBottleCount > 25000);
  assert.ok(index.bottleCount > 8500);
  assert.ok(index.bottleCount < index.fullBottleCount);
  assert.ok(index.sourceCount >= 22);
  assert.equal(index.bottles.length, index.bottleCount);
  assert.ok(shimBytes < 1024);
});

test("generated catalog dedupes 1792 Sweet Wheat into one source-backed app bottle", () => {
  const index = loadIndex();
  const matches = index.bottles.filter((bottle) => /1792.*sweet.*wheat/i.test(bottle.name));

  assert.equal(matches.length, 1);
  assert.equal(matches[0].category, "Wheated Bourbon");
  assert.ok(matches[0].sourceSummary.sourceCount >= 10);
  assert.ok(matches[0].sourceSummary.priceObservationCount >= 10);
  assert.ok(matches[0].sourcePreview.length <= 4);
});

test("generated catalog index excludes low-confidence barrel-reference false positives", () => {
  const index = loadIndex();
  const names = index.bottles.map((bottle) => bottle.name.toLowerCase());

  assert.equal(names.some((name) => name.includes("corazon") && name.includes("stagg")), false);
  assert.equal(names.some((name) => name.includes("myers") && name.includes("stagg")), false);
  assert.equal(names.some((name) => name.includes("ha george t stagg")), false);
});

test("generated catalog does not display missing proof as zero proof", () => {
  const index = loadIndex();

  assert.equal(index.bottles.some((bottle) => bottle.proofDisplay === "0 proof"), false);
});

test("generated catalog display names exclude source administration markers", () => {
  const index = loadIndex();
  const names = index.bottles.map((bottle) => bottle.name);

  assert.equal(names.some((name) => /\.\.\./.test(name)), false);
  assert.equal(names.some((name) => /^BP\b/i.test(name)), false);
  assert.equal(names.some((name) => /^Ingredient\b/i.test(name)), false);
  assert.equal(names.some((name) => /\bUse Code\b/i.test(name)), false);
  assert.equal(names.some((name) => /\bDNO\b/i.test(name)), false);
  assert.equal(names.some((name) => /\bDisco\b/i.test(name)), false);
});

test("generated catalog excludes weak display names and uncurated wide proof ranges", () => {
  const index = loadIndex();
  const weakNames = index.bottles.filter((bottle) =>
    /^\(?[a-z]{1,5}\)?\s*\d+(?:\.\d+)?\s*(?:ml|l)$/i.test(bottle.name) ||
    /^\d+(?:\.\d+)?\s*(?:ml|l)$/i.test(bottle.name)
  );
  const wideProofs = index.bottles.filter((bottle) => {
    if (/george\s+t\.?\s+stagg/i.test([bottle.name, ...(bottle.aliases || [])].join(" "))) return false;
    const values = String(bottle.proofDisplay || "").match(/\d+(?:\.\d+)?/g);
    if (!values || values.length < 2) return false;
    const proofs = values.map(Number);
    return Math.max(...proofs) - Math.min(...proofs) >= 12;
  });

  assert.deepEqual(weakNames.map((bottle) => bottle.name), []);
  assert.deepEqual(wideProofs.map((bottle) => bottle.name), []);
});

test("generated catalog presents George T. Stagg as a curated release family", () => {
  const index = loadIndex();
  const matches = index.bottles.filter((bottle) => /george\s+t\.?\s+stagg/i.test([
    bottle.name,
    ...(bottle.aliases || [])
  ].join(" ")));

  assert.equal(matches.length, 1);
  assert.equal(matches[0].name, "George T. Stagg");
  assert.equal(matches[0].distillery, "Buffalo Trace");
  assert.equal(matches[0].producer, "Sazerac");
  assert.equal(matches[0].category, "Kentucky Straight Bourbon");
  assert.equal(matches[0].rarity, "Unicorn");
  assert.equal(matches[0].mashBill, "Buffalo Trace Mash Bill #1");
  assert.equal(matches[0].catalogConfidence, "verified");
  assert.ok(matches[0].sourceSummary.sourceCount >= 5);
  assert.match(matches[0].proofDisplay, /proof$/);
});

test("generated catalog quarantines malformed high-age and promo merge artifacts", () => {
  const index = loadIndex();
  const names = index.bottles.map((bottle) => bottle.name.toLowerCase());
  const elijahCraigRye = index.bottles.find((bottle) => bottle.name === "Elijah Craig Straight Rye Whiskey");
  const bushmills16 = index.bottles.find((bottle) => bottle.name === "Bushmills 16 Year Old Whiskey");
  const blantonsSftb = index.bottles.find((bottle) => bottle.name === "Blanton's Straight From The Barrel Bourbon");

  assert.equal(names.some((name) => name.includes("buffalo trace 18 year")), false);
  assert.equal(names.some((name) => name.includes("jameson major legal soccer national")), false);
  assert.equal(names.some((name) => name.includes("branded jigger")), false);
  assert.equal(names.some((name) => /\bmini(?:s|ature)?\b/.test(name)), false);
  assert.ok(elijahCraigRye);
  assert.ok(elijahCraigRye.sourceSummary.minRetailPrice >= 20);
  assert.ok(elijahCraigRye.sourceSummary.maxRetailPrice <= 40);
  assert.ok(bushmills16);
  assert.ok(bushmills16.sourceSummary.minRetailPrice >= 100);
  assert.ok(bushmills16.sourceSummary.maxRetailPrice <= 150);
  assert.ok(blantonsSftb);
  assert.ok(blantonsSftb.sourceSummary.minRetailPrice >= 150);
});
