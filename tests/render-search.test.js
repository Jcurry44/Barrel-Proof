const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadUi() {
  const source = fs.readFileSync(path.join(__dirname, "../src/ui/render.js"), "utf8");
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    BarrelRecommendation: {
      money(value) {
        if (!Number.isFinite(value)) return "n/a";
        return "$" + Math.round(value).toLocaleString("en-US");
      },
      getReferencePriceInfo(bottle) {
        if (Number.isFinite(bottle.fairPrice)) return { value: bottle.fairPrice, label: "Fair value", confidence: "high" };
        if (Number.isFinite(bottle.sourceRetailPrice)) return { value: bottle.sourceRetailPrice, label: bottle.sourcePriceLabel || "Source retail", confidence: "low" };
        return { value: null, label: "No reference", confidence: "none" };
      },
      getReferencePrice(bottle) {
        return Number.isFinite(bottle.fairPrice) ? bottle.fairPrice : bottle.sourceRetailPrice;
      },
      getSecondaryMarketInfo(bottle) {
        const market = bottle.secondaryMarket || {};
        if (!Number.isFinite(market.averagePrice)) return { value: null };
        return {
          value: market.averagePrice,
          label: market.label || "Secondary market avg",
          url: market.url || "",
          sampleSize: market.sampleSize || null,
          latestPrice: market.latestPrice || null,
          observedAt: market.observedAt || "",
          confidence: market.confidence || "medium"
        };
      },
      getPriceWindow(bottle) {
        const reference = this.getReferencePriceInfo(bottle);
        return {
          hasReference: Number.isFinite(reference.value),
          reference,
          confidence: reference.confidence,
          confidenceLabel: reference.confidence === "high" ? "High confidence" : reference.confidence === "low" ? "Low confidence" : "No price anchor",
          summary: Number.isFinite(reference.value) ? "Fixture price window." : "No price anchor.",
          caveats: [],
          buyBelow: Number.isFinite(reference.value) ? Math.round(reference.value * 0.95) : null,
          considerBelow: Number.isFinite(reference.value) ? Math.round(reference.value * 1.1) : null,
          passAbove: Number.isFinite(reference.value) ? Math.round(reference.value * 1.25) : null
        };
      }
    },
    BarrelCocktails: {},
    BarrelResearch: {
      getDatabaseConfidence(bottle) {
        const missing = [];
        if (!bottle.age || bottle.age === "Unknown") missing.push("Age statement or batch-specific age");
        if (!bottle.mashBill || bottle.mashBill === "Unknown") missing.push("Mash bill");
        if (!Number.isFinite(bottle.msrp)) missing.push("Verified MSRP");
        return {
          level: missing.length ? "Partial" : "Strong",
          score: missing.length ? 68 : 90,
          missing,
          shouldScout: missing.length > 0,
          summary: "Fixture confidence summary."
        };
      },
      buildBottleResearchPrompt() {
        return "fixture research prompt";
      }
    },
    BarrelReviews: {
      buildReviewIntelligence({ bottle, reviewData }) {
        const entries = (reviewData.reviewsByBottleId && reviewData.reviewsByBottleId[bottle.id]) || [];
        return {
          hasReviews: entries.length > 0,
          sourceCount: entries.length,
          editorialCount: entries.filter((entry) => entry.sourceType === "editorial").length,
          communityCount: entries.filter((entry) => entry.sourceType === "community").length,
          consensus: entries.length ? `${entries.length} cited review source attached.` : "No cited review sources are attached to this bottle yet.",
          takeaways: [],
          sources: entries,
          suggestedSources: ["Breaking Bourbon", "r/bourbon"]
        };
      },
      buildReviewResearchPrompt() {
        return "fixture review prompt";
      }
    },
    BarrelCatalog: {
      buildSearchText(bottle) {
        return [
          bottle.name,
          bottle.producer,
          bottle.supplier,
          bottle.category,
          bottle.proof,
          ...(bottle.aliases || [])
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
      }
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return sandbox.BarrelUI;
}

function makeBottles(count, nameFactory) {
  return Array.from({ length: count }, (_, index) => {
    const name = nameFactory(index);
    return {
      id: `bottle-${index}`,
      name,
      producer: index % 2 ? "Source Producer" : "Starter Producer",
      category: "Bourbon",
      proof: 100,
      rarity: "New",
      _searchText: `${name} bourbon starter producer source producer`.toLowerCase(),
      sourcePreview: index % 2 ? [{ sourceId: "fixture" }] : []
    };
  });
}

test("store search idle state only returns a short starter lane", () => {
  const ui = loadUi();
  const bottles = makeBottles(100, (index) => `Bottle ${index}`);
  const ctx = {
    bottles,
    ui: { query: "" },
    state: { activeBottleId: "bottle-99" }
  };

  const result = ui.getFilteredBottleInfo(ctx);

  assert.equal(result.mode, "idle");
  assert.equal(result.totalMatches, 100);
  assert.ok(result.items.length <= ui.constants.MAX_EMPTY_RESULTS);
  assert.equal(result.items[0].id, "bottle-99");
});

test("store search gates one-character queries", () => {
  const ui = loadUi();
  const bottles = makeBottles(100, (index) => `Heavy Bottle ${index}`);
  const ctx = {
    bottles,
    ui: { query: "h" },
    state: { activeBottleId: "bottle-0" }
  };

  const result = ui.getFilteredBottleInfo(ctx);

  assert.equal(result.mode, "too-short");
  assert.equal(result.totalMatches, 100);
  assert.ok(result.items.length <= ui.constants.MAX_EMPTY_RESULTS);
});

test("store search caps rendered matches for large result sets", () => {
  const ui = loadUi();
  const bottles = makeBottles(95, (index) => `Rare Breed Match ${index}`);
  const ctx = {
    bottles,
    ui: { query: "rare breed" },
    state: { activeBottleId: "bottle-0" }
  };

  const result = ui.getFilteredBottleInfo(ctx);

  assert.equal(result.mode, "search");
  assert.equal(result.totalMatches, 95);
  assert.equal(result.items.length, ui.constants.MAX_SEARCH_RESULTS);
});

test("bottle intelligence model exposes facts, source coverage, and gaps", () => {
  const ui = loadUi();
  const bottle = {
    id: "george-t-stagg",
    name: "George T. Stagg",
    distillery: "Buffalo Trace",
    producer: "Sazerac",
    category: "Kentucky Straight Bourbon",
    proof: 142.8,
    proofDisplay: "125-142.8 proof",
    age: "Unknown",
    size: "750ml",
    mashBill: "Buffalo Trace Mash Bill #1",
    sourceRetailPrice: 149.99,
    sourcePriceLabel: "Alabama ABC retail",
    sourceSummary: {
      sourceCount: 11,
      priceObservationCount: 10,
      minRetailPrice: 112.5,
      maxRetailPrice: 150,
      regions: ["AL", "IA", "PA"]
    },
    sourcePreview: [
      { sourceId: "alabama_abc_quarterly_price_list", sourceRecordId: "Allocated Items:A005102" },
      { sourceId: "iowa_abd_products", sourceRecordId: "902684" }
    ]
  };
  const ctx = {
    state: { storePrice: 175 }
  };
  const result = {
    price: {
      message: "Above fair value. Buy only if it fills a real gap."
    }
  };

  const intel = ui.buildBottleIntelligence(ctx, bottle, result);

  assert.equal(intel.confidence.level, "Partial");
  assert.equal(intel.facts.find((fact) => fact.label === "Maker").value, "Buffalo Trace");
  assert.equal(intel.facts.find((fact) => fact.label === "Proof").value, "125-142.8 proof");
  assert.equal(intel.price.sourceRange, "$113-$150");
  assert.equal(intel.price.delta, "+$25");
  assert.ok(intel.source.summary.includes("11 official records"));
  assert.equal(JSON.stringify(intel.source.tags), JSON.stringify(["11 sources", "10 prices", "AL, IA, PA"]));
  assert.ok(intel.sources[0].label.includes("alabama abc"));
  assert.ok(intel.missing.includes("Age statement or batch-specific age"));
});

test("catalog quality report flags risky identity, proof, and pricing records", () => {
  const ui = loadUi();
  const report = ui.buildCatalogQualityReport([
    {
      id: "risky-stagg",
      name: "BP George T. Stagg Use Code 123",
      category: "Kentucky Straight Bourbon",
      proofDisplay: "100-140 proof",
      sourceSummary: {
        sourceCount: 3,
        priceObservationCount: 2,
        minRetailPrice: 50,
        maxRetailPrice: 220
      },
      sourcePreview: [
        { sourceId: "fixture", sourceRecordId: "1" },
        { sourceId: "fixture", sourceRecordId: "2" },
        { sourceId: "fixture", sourceRecordId: "3" }
      ]
    },
    {
      id: "supplier-only",
      name: "Broken Barrel Small Batch Bourbon",
      supplier: "Republic National Distributing Co",
      category: "Bourbon",
      proof: 95,
      proofDisplay: "95 proof",
      catalogConfidence: "priced-source",
      sourceSummary: {
        sourceCount: 1,
        priceObservationCount: 0
      },
      sourcePreview: [{ sourceId: "fixture", sourceRecordId: "4" }]
    },
    {
      id: "clean-russells",
      name: "Russell's Reserve Single Barrel",
      distillery: "Wild Turkey",
      producer: "Campari",
      category: "Kentucky Straight Bourbon",
      proof: 110,
      proofDisplay: "110 proof",
      age: "10 years",
      mashBill: "75 corn / 13 rye / 12 malted barley",
      catalogConfidence: "verified",
      sourceRetailPrice: 64.99,
      sourceSummary: {
        sourceCount: 4,
        priceObservationCount: 4,
        minRetailPrice: 60,
        maxRetailPrice: 70
      }
    }
  ]);
  const codes = report.issues.map((issue) => issue.code);

  assert.equal(report.totalRecords, 3);
  assert.equal(report.cleanCount, 1);
  assert.equal(report.issues[0].severity, "high");
  assert.ok(codes.includes("display-admin-marker"));
  assert.ok(codes.includes("missing-maker"));
  assert.ok(codes.includes("wide-proof-range"));
  assert.ok(codes.includes("large-price-spread"));
  assert.ok(codes.includes("supplier-only-maker"));
  assert.ok(codes.includes("no-source-price"));
  assert.equal(report.categoryCounts.Identity >= 3, true);
  assert.equal(report.highCount >= 3, true);
  assert.equal(report.mediumCount >= 2, true);
});

test("top shelf queue prioritizes premium bottles with weak trust signals", () => {
  const ui = loadUi();
  const queue = ui.buildTopShelfQueue({
    reviewData: { reviewsByBottleId: {} },
    state: { storePrice: 0 },
    bottles: [
      {
        id: "pappy-risk",
        name: "Pappy Van Winkle Fam Res-15 YR",
        category: "Kentucky Straight Bourbon",
        rarity: "Unicorn",
        hypeIndex: 100,
        msrp: 240,
        age: "15 years",
        proof: 107,
        sourceSummary: { sourceCount: 2 }
      },
      {
        id: "ready-cellar",
        name: "Maker's Mark Cellar Aged 2025",
        distillery: "Maker's Mark",
        producer: "Suntory Global Spirits",
        category: "Kentucky Straight Bourbon",
        rarity: "Limited",
        hypeIndex: 82,
        fairPrice: 190,
        msrp: 175,
        age: "11-14 years",
        mashBill: "70 corn / 16 wheat / 14 malted barley",
        proof: 112.9,
        curated: { canonicalId: "makers-mark-cellar-aged-2025", releaseSpecific: true },
        sourceSummary: { sourceCount: 7, priceObservationCount: 4 }
      },
      {
        id: "daily",
        name: "Everyday Bourbon",
        distillery: "Fixture",
        category: "Bourbon",
        rarity: "Findable",
        fairPrice: 35,
        age: "NAS",
        proof: 90
      }
    ]
  });

  assert.equal(queue.totalCandidates, 2);
  assert.equal(queue.items[0].bottle.id, "pappy-risk");
  assert.ok(queue.items[0].gaps.includes("curated overlay"));
  assert.ok(queue.items[0].gaps.includes("cited reviews"));
  assert.ok(queue.items[0].gaps.includes("high QA risk"));
});

test("bottle dossier marks curated reviewed bottles as ready", () => {
  const ui = loadUi();
  const bottle = {
    id: "ready-cellar",
    name: "Maker's Mark Cellar Aged 2025",
    distillery: "Maker's Mark",
    producer: "Suntory Global Spirits",
    category: "Kentucky Straight Bourbon",
    proof: 112.9,
    age: "11-14 years",
    mashBill: "70 corn / 16 wheat / 14 malted barley",
    msrp: 175,
    fairPrice: 190,
    curated: {
      canonicalId: "makers-mark-cellar-aged-2025",
      releaseSpecific: true,
      releaseLabel: "2025 release / 112.9 proof",
      sourceNote: "Fixture curated source note."
    },
    sourceSummary: { sourceCount: 7, priceObservationCount: 4 }
  };
  const dossier = ui.buildBottleDossier(
    {
      reviewData: {
        reviewsByBottleId: {
          "ready-cellar": [
            { sourceName: "Breaking Bourbon", sourceType: "editorial", url: "https://example.test/review" }
          ]
        }
      },
      state: { storePrice: 0 }
    },
    bottle,
    {}
  );

  assert.equal(dossier.grade, "Ready");
  assert.equal(dossier.trustTone, "strong");
  assert.equal(dossier.actions.length, 0);
  assert.equal(dossier.lanes.find((lane) => lane.label === "Identity").value, "Curated");
  assert.equal(dossier.lanes.find((lane) => lane.label === "Reviews").value, "1 cited");
});

test("secondary market queue separates DramValue matches from lookup candidates", () => {
  const ui = loadUi();
  const queue = ui.buildSecondaryMarketQueue({
    bottles: [
      {
        id: "pappy-matched",
        name: "Pappy Van Winkle Family Reserve 15 Year",
        distillery: "Buffalo Trace",
        category: "Kentucky Straight Bourbon",
        rarity: "Unicorn",
        hypeIndex: 100,
        msrp: 240,
        age: "15 years",
        proof: 107,
        secondaryMarket: {
          averagePrice: 2443,
          latestPrice: 1410,
          sampleSize: 50,
          url: "https://www.dramvalue.com/bottles/8015",
          observedAt: "2026-06-02"
        }
      },
      {
        id: "weller-missing",
        name: "Weller Full Proof",
        distillery: "Buffalo Trace",
        category: "Kentucky Straight Bourbon",
        rarity: "Allocated",
        hypeIndex: 94,
        msrp: 50,
        age: "NAS",
        proof: 114
      },
      {
        id: "daily",
        name: "Everyday Bourbon",
        distillery: "Fixture",
        category: "Bourbon",
        rarity: "Findable",
        fairPrice: 35,
        proof: 90
      }
    ]
  });

  assert.equal(queue.totalCandidates, 2);
  assert.equal(queue.matchedCount, 1);
  assert.equal(queue.missingCount, 1);
  assert.equal(queue.items[0].status, "missing");
  assert.equal(queue.items[0].bottle.id, "weller-missing");
  assert.ok(queue.items[0].url.includes("dramvalue.com/bottles?"));
  assert.ok(queue.items[0].url.includes("Weller%20Full%20Proof"));
  assert.equal(queue.items[1].status, "matched");
  assert.equal(queue.items[1].market.value, 2443);
});

test("market reality builder exposes secondary and shelf context", () => {
  const ui = loadUi();
  const reality = ui.buildMarketReality(
    {
      state: { storePrice: 300 }
    },
    {
      id: "pappy-15",
      name: "Pappy Van Winkle Family Reserve 15 Year",
      msrp: 240,
      rarity: "Unicorn",
      secondaryMarket: {
        label: "Secondary market avg",
        averagePrice: 1294,
        latestPrice: 1280,
        sampleSize: 50,
        url: "https://www.dramvalue.com/bottles/13489"
      }
    }
  );

  assert.equal(reality.shouldShow, true);
  assert.equal(reality.hasSecondary, true);
  assert.equal(reality.signals.length, 2);
  assert.equal(Math.round(reality.ratios.shelfToSecondary * 100), 23);
  assert.equal(reality.ratios.shelfToMsrp, 1.25);
});
