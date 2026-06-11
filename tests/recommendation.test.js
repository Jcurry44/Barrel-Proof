const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getPriceBands,
  getMarketReality,
  getPricePosition,
  getPriceWindow,
  getReferencePriceInfo,
  getPalateMatch,
  getReviewSignal,
  scoreBottleDecision
} = require("../src/logic/recommendation.js");

const bottle = {
  id: "rare-breed",
  name: "Wild Turkey Rare Breed",
  proof: 116.8,
  msrp: 58,
  fairPrice: 66,
  reviewScore: 91,
  hypeIndex: 58,
  rarity: "Findable",
  profile: ["caramel", "oak", "baking spice", "tobacco"],
  bestFor: ["barrel proof", "value", "nightcap"]
};

const palate = {
  proofPreference: 110,
  favoriteProfiles: ["oak", "barrel proof", "baking spice"]
};

const friends = [
  { ratings: { "rare-breed": 9.2 } },
  { ratings: { "rare-breed": 8.8 } }
];

test("price position rewards bottles below fair value", () => {
  const price = getPricePosition(bottle, 55);
  assert.equal(price.grade, "Strong");
  assert.ok(price.score > 0.85);
});

test("price position punishes bottles far above fair value", () => {
  const price = getPricePosition(bottle, 110);
  assert.equal(price.grade, "Bad");
  assert.ok(price.score < 0.3);
});

test("source-only references use conservative bands and disclose lower confidence", () => {
  const sourceOnly = {
    id: "source-only",
    name: "Source Only Bourbon",
    proof: 100,
    sourceRetailPrice: 100,
    sourcePriceLabel: "OHLQ retail",
    reviewScore: 82,
    hypeIndex: 40,
    rarity: "Source-backed",
    profile: []
  };

  assert.deepEqual(getPriceBands(sourceOnly), { buy: 85, consider: 100, pass: 115 });
  const window = getPriceWindow(sourceOnly);
  assert.equal(window.confidenceLabel, "Low confidence");
  assert.ok(window.caveats[0].includes("source retail"));
  const price = getPricePosition(sourceOnly, 95);
  assert.equal(price.reference.type, "source");
  assert.equal(price.grade, "Good");
  assert.ok(price.message.includes("source retail observation"));
});

test("allocated MSRP-only bottles use a low-confidence allocation guardrail", () => {
  const allocated = {
    id: "weller-12",
    name: "Weller 12 Year",
    msrp: 50,
    rarity: "Allocated",
    hypeIndex: 94,
    profile: ["wheated"]
  };

  const reference = getReferencePriceInfo(allocated);
  const window = getPriceWindow(allocated);
  const price = getPricePosition(allocated, 90);

  assert.equal(reference.type, "msrp-allocated");
  assert.equal(reference.confidence, "low");
  assert.deepEqual(getPriceBands(allocated), { buy: 63, consider: 100, pass: 150 });
  assert.ok(window.caveats[0].includes("allocated-bottle guardrail"));
  assert.ok(price.message.includes("MSRP allocation guardrail"));
});

test("price window exposes explicit buy, consider, and pass thresholds", () => {
  const window = getPriceWindow(bottle);

  assert.equal(window.hasReference, true);
  assert.equal(window.confidenceLabel, "High confidence");
  assert.equal(window.buyBelow, 63);
  assert.equal(window.considerBelow, 73);
  assert.equal(window.passAbove, 83);
  assert.ok(window.summary.includes("Buy under $63"));
});

test("secondary market reference prevents unicorn bottles from passing near MSRP", () => {
  const pappy = {
    id: "pappy-15",
    name: "Pappy Van Winkle Family Reserve 15 Year",
    proof: 107,
    msrp: 239.99,
    secondaryMarket: {
      averagePrice: 2443,
      latestPrice: 1410,
      minPrice: 1410,
      maxPrice: 2975,
      sourceName: "DramValue",
      confidence: "medium"
    },
    hypeIndex: 100,
    rarity: "Unicorn",
    profile: ["oak", "cherry", "vanilla"],
    bestFor: ["trophy pour"]
  };

  const reference = getReferencePriceInfo(pappy);
  const window = getPriceWindow(pappy);
  const decision = scoreBottleDecision({
    bottle: pappy,
    shelfPrice: 300,
    palate: {
      proofPreference: 107,
      favoriteProfiles: ["oak", "cherry", "vanilla"]
    },
    friends: [],
    status: "wishlist"
  });

  assert.equal(reference.type, "secondary");
  assert.equal(reference.value, 2443);
  assert.equal(window.passAbove, 3054);
  assert.equal(decision.decision, "Buy");
  assert.ok(decision.summary.includes("secondary market"));
});

test("market reality explains MSRP, secondary, and shelf-price position", () => {
  const reality = getMarketReality(
    {
      id: "pappy-15",
      name: "Pappy Van Winkle Family Reserve 15 Year",
      msrp: 239.99,
      rarity: "Unicorn",
      hypeIndex: 100,
      secondaryMarket: {
        label: "Secondary market avg",
        averagePrice: 1294,
        latestPrice: 1280,
        sampleSize: 50,
        confidence: "medium"
      }
    },
    300
  );

  assert.equal(reality.shouldShow, true);
  assert.equal(reality.hasSecondary, true);
  assert.equal(reality.secondary.value, 1294);
  assert.ok(reality.summary.includes("secondary"));
  assert.ok(reality.summary.includes("MSRP"));
  assert.ok(reality.caveats.some((caveat) => caveat.includes("collector value")));
});

test("market reality warns when allocated bottles only have MSRP", () => {
  const reality = getMarketReality(
    {
      id: "weller-12",
      name: "Weller 12 Year",
      msrp: 49.99,
      rarity: "Allocated",
      hypeIndex: 94
    },
    180
  );

  assert.equal(reality.shouldShow, true);
  assert.equal(reality.hasSecondary, false);
  assert.ok(reality.summary.includes("MSRP"));
  assert.ok(reality.caveats.some((caveat) => caveat.includes("MSRP alone")));
});

test("palate match combines flavor tags and proof preference", () => {
  const match = getPalateMatch(bottle, palate);
  assert.ok(match > 0.75);
});

test("review signal stays neutral unless reviews are source-backed", () => {
  const unsourced = getReviewSignal({ reviewScore: 97 });
  const sourceCountOnly = getReviewSignal({ reviewScore: 91, reviewSummary: { sourceCount: 2, hasNumericScore: false } });
  const sourced = getReviewSignal({ reviewScore: 91, reviewSourceCount: 2, reviewScoreSource: "cited-review-data" });

  assert.equal(unsourced.sourced, false);
  assert.equal(unsourced.value, null);
  assert.equal(unsourced.score, 0.5);
  assert.equal(sourceCountOnly.sourced, false);
  assert.equal(sourceCountOnly.value, null);
  assert.equal(sourceCountOnly.sourceCount, 2);
  assert.equal(sourced.sourced, true);
  assert.equal(sourced.value, 91);
  assert.ok(sourced.score > 0.7);
});

test("decision recommends buy for a strong price and strong fit", () => {
  const decision = scoreBottleDecision({
    bottle,
    shelfPrice: 60,
    palate,
    friends,
    status: "wishlist"
  });
  assert.equal(decision.decision, "Buy");
  assert.ok(decision.confidence >= 72);
});

test("decision can pass on a great bottle at a bad price", () => {
  const decision = scoreBottleDecision({
    bottle: {
      ...bottle,
      id: "stagg",
      name: "Stagg",
      fairPrice: 150,
      msrp: 70,
      hypeIndex: 97,
      rarity: "Unicorn"
    },
    shelfPrice: 290,
    palate,
    friends: [{ ratings: { stagg: 9.4 } }],
    status: "wishlist"
  });
  assert.equal(decision.decision, "Pass");
  assert.ok(decision.cautions.some((caution) => caution.includes("Hype")));
});

const rec = require("../src/logic/recommendation.js");

test("NEVER tells you to pass a grail at retail because you own one (the Handy regression)", () => {
  // Thomas H. Handy: Unicorn, MSRP $150 — offered at $70 while already owned.
  const handy = {
    id: "thomas-h-handy-2025",
    name: "Thomas H. Handy Sazerac Rye",
    rarity: "Unicorn",
    msrp: 150,
    proof: 129.8,
    hypeIndex: 95,
    profile: ["baking spice", "mint", "oak"]
  };
  const result = rec.scoreBottleDecision({
    bottle: handy,
    shelfPrice: 70,
    palate: { proofPreference: 105, favoriteProfiles: ["cherry", "oak"] },
    friends: [],
    status: "owned"
  });
  assert.equal(result.decision, "Buy");
  assert.ok(result.confidence >= 90, "confidence should be emphatic, got " + result.confidence);
  assert.ok(result.reasons.some((reason) => /allocated-bottle economics/i.test(reason)), "leads with the economics");
  assert.ok(result.reasons.some((reason) => /backup at this price/i.test(reason)), "ownership framed as a bonus");
  assert.ok(!result.cautions.some((caution) => /backup-bottle pricing/i.test(caution)), "no ownership scolding on a steal");
});

test("grail override does NOT fire at scalper prices or on shelf bottles", () => {
  const handy = { id: "handy", name: "Thomas H. Handy", rarity: "Unicorn", msrp: 150, hypeIndex: 95 };
  assert.equal(rec.isGrailSteal(handy, 70), true);
  assert.equal(rec.isGrailSteal(handy, 165), true);   // ~MSRP still a steal for BTAC
  assert.equal(rec.isGrailSteal(handy, 600), false);  // scalper territory — judge normally
  assert.equal(rec.isGrailSteal({ name: "Buffalo Trace", rarity: "Findable", msrp: 30 }, 25), false);
  const scalped = rec.scoreBottleDecision({ bottle: handy, shelfPrice: 900, palate: {}, friends: [], status: "none" });
  assert.notEqual(scalped.decision, "Buy", "a $900 Handy is not an auto-buy");
  // owned penalty still applies to ordinary bottles
  const ordinary = rec.scoreBottleDecision({ bottle: { name: "Buffalo Trace", rarity: "Findable", msrp: 30, fairPrice: 32 }, shelfPrice: 30, palate: {}, friends: [], status: "owned" });
  assert.ok(ordinary.cautions.some((caution) => /backup-bottle pricing/i.test(caution)), "ordinary bottles keep the backup caution");
});
