const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildReviewIntelligence,
  buildReviewResearchPrompt,
  getBottleReviewEntries
} = require("../src/logic/reviews.js");
require("../src/data/reviews.js");

test("review intelligence stays empty when no cited sources are attached", () => {
  const intel = buildReviewIntelligence({
    bottle: { id: "rare-breed", name: "Wild Turkey Rare Breed" },
    reviewData: { reviewsByBottleId: {} }
  });

  assert.equal(intel.hasReviews, false);
  assert.equal(intel.sourceCount, 0);
  assert.ok(intel.consensus.includes("No cited review sources"));
  assert.ok(intel.suggestedSources.includes("Breaking Bourbon"));
  assert.ok(intel.suggestedSources.includes("r/bourbon"));
});

test("review intelligence requires URLs and separates editorial from community sources", () => {
  const reviewData = {
    reviewsByBottleId: {
      "rare-breed": [
        {
          sourceName: "Breaking Bourbon",
          sourceType: "editorial",
          url: "https://example.com/editorial",
          retrievedAt: "2026-06-01",
          verdict: "Strong value",
          takeaways: ["Praised as a high-proof value with classic Wild Turkey character."]
        },
        {
          sourceName: "r/bourbon",
          sourceType: "community",
          url: "https://reddit.com/r/bourbon/example",
          retrievedAt: "2026-06-01",
          takeaways: ["Community notes emphasize value, spice, and reliable availability."]
        },
        {
          sourceName: "Missing URL",
          sourceType: "editorial",
          takeaways: ["This should not be imported."]
        }
      ]
    }
  };

  const entries = getBottleReviewEntries({ id: "rare-breed" }, reviewData);
  const intel = buildReviewIntelligence({
    bottle: { id: "rare-breed", name: "Wild Turkey Rare Breed" },
    reviewData
  });

  assert.equal(entries.length, 2);
  assert.equal(intel.hasReviews, true);
  assert.equal(intel.editorialCount, 1);
  assert.equal(intel.communityCount, 1);
  assert.equal(intel.verdicts.length, 1);
  assert.equal(intel.verdicts[0].verdict, "Strong value");
  assert.equal(intel.takeaways.length, 2);
  assert.ok(intel.consensus.includes("editorial"));
  assert.ok(intel.consensus.includes("community"));
});

test("review aliases attach canonical reviews to imported catalog variants", () => {
  const reviewData = {
    reviewAliases: {
      "imported-rare-breed-750ml": "rare-breed"
    },
    reviewsByBottleId: {
      "rare-breed": [
        {
          sourceName: "Breaking Bourbon",
          sourceType: "editorial",
          url: "https://example.com/editorial",
          retrievedAt: "2026-06-01",
          takeaways: ["Imported catalog variants can use a canonical cited review package."]
        }
      ]
    }
  };

  const entries = getBottleReviewEntries({ id: "imported-rare-breed-750ml" }, reviewData);

  assert.equal(entries.length, 1);
  assert.equal(entries[0].sourceName, "Breaking Bourbon");
});

test("review aliases do not duplicate entries already attached by bottle reviewIds", () => {
  const reviewData = {
    reviewAliases: {
      "imported-rare-breed-750ml": "rare-breed"
    },
    reviewsByBottleId: {
      "rare-breed": [
        {
          sourceId: "source-1",
          sourceName: "Breaking Bourbon",
          sourceType: "editorial",
          url: "https://example.com/editorial",
          retrievedAt: "2026-06-01",
          takeaways: ["Duplicate aliases should still produce one cited review source."]
        }
      ]
    }
  };

  const entries = getBottleReviewEntries({ id: "imported-rare-breed-750ml", reviewIds: ["rare-breed"] }, reviewData);

  assert.equal(entries.length, 1);
});

test("real review aliases point at existing canonical review groups", () => {
  const reviewData = globalThis.BarrelReviewData;
  const reviewsByBottleId = reviewData.reviewsByBottleId || {};

  for (const [variantId, canonicalIds] of Object.entries(reviewData.reviewAliases || {})) {
    assert.ok(variantId);
    for (const canonicalId of Array.isArray(canonicalIds) ? canonicalIds : [canonicalIds]) {
      assert.ok(reviewsByBottleId[canonicalId], variantId + " points at missing review group " + canonicalId);
    }
  }
});

test("real review aliases attach reviews for known imported bottles", () => {
  const entries = getBottleReviewEntries(
    { id: "imported-old-grand-dad-114-750ml-35681", name: "Old Grand Dad 114" },
    globalThis.BarrelReviewData
  );

  assert.ok(entries.length >= 1);
  assert.equal(entries[0].sourceName, "Breaking Bourbon");
});

test("review research prompt enforces cited paraphrased review summaries", () => {
  const prompt = buildReviewResearchPrompt({
    bottle: {
      name: "Wild Turkey Rare Breed",
      distillery: "Wild Turkey",
      category: "Barrel Proof Bourbon",
      proofDisplay: "116.8 proof",
      age: "NAS",
      size: "750ml"
    }
  });

  assert.ok(prompt.includes("Use real sources only"));
  assert.ok(prompt.includes("Breaking Bourbon"));
  assert.ok(prompt.includes("Reddit"));
  assert.ok(prompt.includes("Do not copy review paragraphs"));
});

test("imported review data is cited, usable, and intentionally compact", () => {
  const reviewData = globalThis.BarrelReviewData;
  const reviewsByBottleId = reviewData.reviewsByBottleId || {};
  const bottleIds = Object.keys(reviewsByBottleId);
  const sourceIds = new Set();
  let entryCount = 0;

  assert.equal(reviewData.schemaVersion, 1);
  assert.ok(reviewData.generatedAt);
  assert.ok(bottleIds.length >= 10);

  for (const [bottleId, entries] of Object.entries(reviewsByBottleId)) {
    assert.ok(bottleId);
    assert.ok(Array.isArray(entries));
    assert.ok(entries.length > 0);

    for (const entry of entries) {
      entryCount += 1;
      const url = new URL(entry.url);
      assert.equal(url.protocol, "https:");
      assert.notEqual(url.hostname, "example.com");
      assert.ok(entry.sourceId);
      assert.ok(entry.sourceName);
      assert.ok(entry.retrievedAt);
      assert.ok(entry.sourceType === "editorial" || entry.sourceType === "community");
      assert.ok(!sourceIds.has(entry.sourceId), "duplicate review sourceId: " + entry.sourceId);
      sourceIds.add(entry.sourceId);
      assert.ok(Array.isArray(entry.takeaways));
      assert.ok(entry.takeaways.length >= 2);

      for (const takeaway of entry.takeaways) {
        assert.ok(takeaway.length >= 40);
        assert.ok(takeaway.length <= 220);
      }
    }
  }

  assert.ok(entryCount >= 14);
});
