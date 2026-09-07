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
  // Secondary is collector money: Buy sits at 70% of it, Pass starts at 120%.
  assert.equal(window.buyBelow, 1710);
  assert.equal(window.passAbove, 2932);
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

test("source price anchor uses the observed range, not whichever state was imported first", () => {
  const rec = require("../src/logic/recommendation.js");
  // Tight range across three states → midpoint, medium confidence.
  const tight = { name: "Tight", sourceRetailPrice: 65, sourcePriceLabel: "Alabama ABC retail", sourceSummary: { priceObservationCount: 3, minRetailPrice: 50, maxRetailPrice: 70 } };
  assert.equal(rec.getSourceRetailPriceInfo(tight).value, 60);
  assert.equal(rec.getSourceRetailPriceInfo(tight).basis, "midpoint");
  assert.equal(getReferencePriceInfo(tight).confidence, "medium");
  assert.match(getReferencePriceInfo(tight).label, /3 prices/);
  // A $15,000 typo alongside $150 must not become the anchor.
  const typo = { name: "Typo", sourceRetailPrice: 15000, sourceSummary: { priceObservationCount: 3, minRetailPrice: 150, maxRetailPrice: 15000 } };
  assert.equal(rec.getSourceRetailPriceInfo(typo).value, 150);
  assert.equal(rec.getSourceRetailPriceInfo(typo).basis, "low-cluster");
  assert.equal(getReferencePriceInfo(typo).confidence, "low");
  // Wide spread but the first price sits in the low cluster → keep it.
  const mixedSizes = { name: "Mixed", sourceRetailPrice: 34, sourceSummary: { priceObservationCount: 4, minRetailPrice: 30, maxRetailPrice: 85 } };
  assert.equal(rec.getSourceRetailPriceInfo(mixedSizes).value, 34);
  // Single observation → used as-is with the source label.
  const single = { name: "Single", sourceRetailPrice: 42, sourcePriceLabel: "OHLQ retail", sourceSummary: { priceObservationCount: 1, minRetailPrice: 42, maxRetailPrice: 42 } };
  assert.equal(rec.getSourceRetailPriceInfo(single).basis, "single");
  assert.equal(getReferencePriceInfo(single).label, "OHLQ retail");
});

test("palate fit is honest: unknown without tags or a learned profile, never a fake low percentage", () => {
  const rec = require("../src/logic/recommendation.js");
  const untagged = { id: "u", name: "Untagged Catalog Bourbon", proof: 113, sourceRetailPrice: 60 };
  const tastePalate = { proofPreference: 105, favoriteProfiles: ["cherry", "oak"] };
  const proofOnly = rec.getPalateFit(untagged, tastePalate);
  assert.equal(proofOnly.basis, "proof");
  assert.ok(proofOnly.score > 0.8, "113 proof against a 105 preference is a close proof fit");
  const nothing = rec.getPalateFit(untagged, {});
  assert.equal(nothing.known, false);
  assert.equal(nothing.score, 0.5, "unknown fit is neutral, not a penalty");
  const learned = rec.getPalateFit(untagged, {}, { learnedFit: 0.82 });
  assert.equal(learned.basis, "learned");
  assert.equal(learned.score, 0.82);
  const tagged = rec.getPalateFit(bottle, palate);
  assert.equal(tagged.basis, "tags");
  const blended = rec.getPalateFit(bottle, palate, { learnedFit: 0.2 });
  assert.equal(blended.basis, "blended");
  assert.ok(blended.score < tagged.score);
  // No "palate fit is not obvious" caution when the app cannot actually judge fit.
  const result = scoreBottleDecision({ bottle: untagged, shelfPrice: 60, palate: {}, friends: [], status: "none" });
  assert.equal(result.palateFit.known, false);
  assert.ok(!result.cautions.some((caution) => /palate fit/i.test(caution)));
  // Unknown fit is left out of the verdict rather than dragging it down: it can
  // never score worse than a known, neutral learned fit.
  const neutral = scoreBottleDecision({ bottle: untagged, shelfPrice: 60, palate: {}, friends: [], status: "none" });
  const tastedFit = scoreBottleDecision({ bottle: untagged, shelfPrice: 60, palate: {}, friends: [], status: "none", learnedFit: 0.5 });
  assert.equal(neutral.evidence.palate, false);
  assert.equal(tastedFit.evidence.palate, true);
  assert.ok(neutral.confidence >= tastedFit.confidence);
});

test("an allocated bottle near retail is a buy even without fair-value or secondary data", () => {
  const rec = require("../src/logic/recommendation.js");
  // Weller 12: MSRP $50, no fair value, no secondary attached, hype 93.
  const weller12 = { id: "w12", name: "Weller 12 Year", rarity: "Allocated", msrp: 50, hypeIndex: 93, proof: 90 };
  assert.equal(rec.isGrailSteal(weller12, 65), true, "$65 on a $50 MSRP allocated bottle is a steal");
  assert.equal(rec.isGrailSteal(weller12, 120), false, "2.4x MSRP is no longer a guaranteed steal without market data");
  const result = scoreBottleDecision({ bottle: weller12, shelfPrice: 65, palate: {}, friends: [], status: "none" });
  assert.equal(result.decision, "Buy");
  assert.ok(!result.cautions.some((caution) => /hype/i.test(caution)), "no hype-tax caution against the MSRP guardrail");
  // With a real secondary anchor, half of secondary is a steal; a scalper price is not.
  const blantons = { id: "bl", name: "Blanton's", rarity: "Allocated", msrp: 65, hypeIndex: 90, secondaryMarket: { averagePrice: 160 } };
  assert.equal(rec.isGrailSteal(blantons, 75), true);
  assert.equal(rec.isGrailSteal(blantons, 150), false);
  const scalped = scoreBottleDecision({ bottle: blantons, shelfPrice: 150, palate: {}, friends: [], status: "none" });
  assert.notEqual(scalped.decision, "Buy");
});

test("verdicts are weighed over the signals the app actually has", () => {
  const plain = { id: "plain", name: "Plain Kentucky Bourbon", proof: 100, sourceRetailPrice: 40, sourceSummary: { priceObservationCount: 3, minRetailPrice: 38, maxRetailPrice: 42 } };
  // Below the typical price with nothing else known → a real Buy, not a capped Consider.
  const cheap = scoreBottleDecision({ bottle: plain, shelfPrice: 32, palate: {}, friends: [], status: "none" });
  assert.equal(cheap.decision, "Buy");
  assert.equal(cheap.evidence.price, true);
  assert.equal(cheap.evidence.palate, false);
  assert.match(cheap.evidenceNote, /price alone/);
  // At the typical price → Consider; well above it → Pass.
  assert.equal(scoreBottleDecision({ bottle: plain, shelfPrice: 40, palate: {}, friends: [], status: "none" }).decision, "Consider");
  assert.equal(scoreBottleDecision({ bottle: plain, shelfPrice: 58, palate: {}, friends: [], status: "none" }).decision, "Pass");
  // A club that hates it pulls a good price back to Consider.
  const panned = scoreBottleDecision({ bottle: plain, shelfPrice: 32, palate: {}, friends: [{ ratings: { plain: 5.5 } }], status: "none" });
  assert.notEqual(panned.decision, "Buy");
  assert.equal(panned.evidence.friends, true);
});

test("allocated catalog rows with only a state list price get allocation bands", () => {
  const rec = require("../src/logic/recommendation.js");
  // Elmer T. Lee as the catalog carries it: no rarity, no hype, a $38 state price.
  const elmer = { id: "etl", name: "Elmer T. Lee Bourbon", proof: 90, sourceRetailPrice: 38, sourcePriceLabel: "OHLQ retail", sourceSummary: { priceObservationCount: 1, minRetailPrice: 38, maxRetailPrice: 38 } };
  const asShelf = scoreBottleDecision({ bottle: elmer, shelfPrice: 45, palate: {}, friends: [], status: "none" });
  assert.equal(asShelf.decision, "Pass", "without the allocation hint a 1.2x price reads as overpriced");
  const asAllocated = scoreBottleDecision({ bottle: elmer, shelfPrice: 45, palate: {}, friends: [], status: "none", allocated: true });
  assert.equal(asAllocated.decision, "Buy");
  assert.ok(asAllocated.reasons.some((reason) => /typical retail \$38/.test(reason)));
  assert.equal(rec.isGrailSteal(elmer, 45, { allocated: true }), true);
  assert.equal(rec.isGrailSteal(elmer, 120, { allocated: true }), false);
  const bands = rec.getPriceBands(elmer, { allocated: true });
  assert.deepEqual(bands, { buy: 48, consider: 76, pass: 114 });
  assert.equal(scoreBottleDecision({ bottle: elmer, shelfPrice: 120, palate: {}, friends: [], status: "none", allocated: true }).decision, "Pass");
});

test("matching the secondary market is the going rate, not a Buy; well under it is", () => {
  const rec = require("../src/logic/recommendation.js");
  const blantons = { id: "bl2", name: "Blanton's", rarity: "Allocated", msrp: 65, hypeIndex: 90, secondaryMarket: { averagePrice: 160 } };
  assert.deepEqual(rec.getPriceBands(blantons), { buy: 112, consider: 160, pass: 192 });
  const atMarket = scoreBottleDecision({ bottle: blantons, shelfPrice: 155, palate: {}, friends: [], status: "none" });
  assert.equal(atMarket.decision, "Consider");
  assert.match(atMarket.price.message, /going rate/);
  const underMarket = scoreBottleDecision({ bottle: blantons, shelfPrice: 95, palate: {}, friends: [], status: "none" });
  assert.equal(underMarket.decision, "Buy");
  assert.equal(scoreBottleDecision({ bottle: blantons, shelfPrice: 260, palate: {}, friends: [], status: "none" }).decision, "Pass");
});
