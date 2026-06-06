const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildBottleResearchPrompt,
  buildKnownFacts,
  buildMissingFacts,
  getDatabaseConfidence
} = require("../src/logic/research.js");

const sourceBackedBottle = {
  id: "olcc-russells",
  name: "Russells Reserve 10 Year Old Bourbon",
  distillery: "Unknown producer",
  producer: "",
  category: "DOMESTIC WHISKEY",
  proof: 90,
  age: "10 years",
  size: "750ml",
  mashBill: "Unknown",
  prices: [
    {
      sourceId: "olcc_monthly_pricing",
      region: "OR",
      retailPrice: 44.95,
      size: "750ml",
      status: "Regular",
      asOfDate: "07/01/2024",
      retrievedAt: "2026-05-28T00:00:00.000Z"
    }
  ],
  sourceRefs: [
    {
      sourceId: "olcc_monthly_pricing",
      sourceRecordId: "99900013475",
      sourceUrl: "https://catalog.data.gov/dataset/olcc-monthly-pricing",
      retrievedAt: "2026-05-28T00:00:00.000Z"
    }
  ]
};

test("research prompt includes source-backed facts and no-invention rules", () => {
  const prompt = buildBottleResearchPrompt({
    bottle: sourceBackedBottle,
    shelfPrice: 48
  });

  assert.ok(prompt.includes("Russells Reserve 10 Year Old Bourbon"));
  assert.ok(prompt.includes("Entered shelf price: $48"));
  assert.ok(prompt.includes("Price observation: $44.95"));
  assert.ok(prompt.includes("olcc_monthly_pricing"));
  assert.ok(prompt.includes("Do not invent proof, age, mash bill, MSRP, release details, reviews, or UPCs."));
  assert.ok(prompt.includes("Import candidates"));
});

test("known facts include source refs and price observations", () => {
  const facts = buildKnownFacts(sourceBackedBottle, 48);

  assert.ok(facts.some((fact) => fact.includes("Proof: 90 proof")));
  assert.ok(facts.some((fact) => fact.includes("Price observation: $44.95")));
  assert.ok(facts.some((fact) => fact.includes("Source reference: olcc_monthly_pricing")));
});

test("missing facts call out weak database fields", () => {
  const missing = buildMissingFacts({
    name: "Mystery Bourbon",
    age: "Unknown",
    mashBill: "Unknown",
    sourceRefs: [],
    prices: []
  });

  assert.ok(missing.includes("Proof"));
  assert.ok(missing.includes("Mash bill"));
  assert.ok(missing.includes("Verified MSRP"));
  assert.ok(missing.includes("Source-backed identity record"));
});

test("database confidence prefers strong local records before Scout", () => {
  const confidence = getDatabaseConfidence({
    ...sourceBackedBottle,
    distillery: "Wild Turkey",
    msrp: 45,
    mashBill: "75% corn, 13% rye, 12% malted barley",
    story: "Official product description."
  });

  assert.equal(confidence.level, "Strong");
  assert.equal(confidence.shouldScout, false);
});

test("database confidence opens Scout for thin records", () => {
  const confidence = getDatabaseConfidence({
    name: "Mystery Bourbon",
    age: "Unknown",
    sourceRefs: [],
    prices: []
  });

  assert.equal(confidence.level, "Thin");
  assert.equal(confidence.shouldScout, true);
  assert.ok(confidence.missing.includes("Proof"));
});
