const test = require("node:test");
const assert = require("node:assert/strict");
const store = require("../src/storage/store.js");

const defaults = {
  schemaVersion: 1,
  activeBottleId: "rare-breed",
  storePrice: "",
  statuses: {},
  tastings: [],
  huntLog: []
};

test("save reports failure (false) when storage throws, so the UI can warn", () => {
  const original = globalThis.localStorage;
  globalThis.localStorage = {
    setItem() { throw new Error("QuotaExceededError"); },
    getItem() { return null; },
    removeItem() {}
  };
  try {
    assert.equal(store.save({ schemaVersion: 5 }), false);
  } finally {
    globalThis.localStorage = original;
  }
});

test("save reports success (true) when storage accepts the write", () => {
  const original = globalThis.localStorage;
  const backing = {};
  globalThis.localStorage = {
    setItem(key, value) { backing[key] = value; },
    getItem(key) { return backing[key] || null; },
    removeItem(key) { delete backing[key]; }
  };
  try {
    assert.equal(store.save({ schemaVersion: 5 }), true);
  } finally {
    globalThis.localStorage = original;
  }
});

test("state normalization migrates schema instead of blindly stamping it", () => {
  const state = store.normalizeState({
    schemaVersion: 1,
    activeBottleId: "rare-breed",
    storePrice: "72",
    statuses: { "rare-breed": "owned" },
    tastings: [],
    huntLog: []
  }, defaults, { bottleIds: ["rare-breed"] });

  assert.equal(state.schemaVersion, store.CURRENT_VERSION);
  assert.equal(state.storePrice, 72);
  assert.equal(state.statuses["rare-breed"], "owned");
});

test("state normalization replaces stale active bottle ids and removes ghost statuses", () => {
  const state = store.normalizeState({
    schemaVersion: 2,
    activeBottleId: "ghost-bottle",
    statuses: {
      "ghost-bottle": "owned",
      "eagle-rare-10": "wishlist"
    }
  }, defaults, { bottleIds: ["rare-breed", "eagle-rare-10"] });

  assert.equal(state.activeBottleId, "rare-breed");
  assert.deepEqual(state.statuses, { "eagle-rare-10": "wishlist" });
});

test("statuses are preserved when the catalog degrades to seed mode (pruneStatuses:false)", () => {
  // Catalog failed to load, so only the tiny seed list is available. The user's
  // owned/wishlist tags for imported bottles must NOT be deleted on this boot.
  const state = store.normalizeState({
    schemaVersion: 5,
    activeBottleId: "rare-breed",
    statuses: {
      "rare-breed": "owned",
      "weller-antique-imported": "wishlist"
    }
  }, defaults, { bottleIds: ["rare-breed", "eagle-rare-10"], pruneStatuses: false });

  assert.equal(state.statuses["weller-antique-imported"], "wishlist");
  assert.equal(state.statuses["rare-breed"], "owned");
});

test("idAliases migrate every kind of user data to surviving bottle ids", () => {
  const aliases = { "old-eagle": "new-eagle", "old-weller": "mid-weller", "mid-weller": "new-weller" };
  const state = store.normalizeState({
    schemaVersion: 10,
    activeBottleId: "old-eagle",
    statuses: { "old-eagle": "owned", "new-eagle": "wishlist", "old-weller": "tasted" },
    collection: { "old-eagle": { count: 2, batches: ["B1"], note: "" }, "new-eagle": { count: 1, batches: ["B2"], note: "" } },
    prices: { "old-eagle": [{ price: 40 }] },
    tastings: [{ bottleId: "old-eagle", score: 9 }],
    killLog: [{ bottleId: "old-weller", date: "2026-01-01", rebuy: true }],
    matchups: [{ aId: "old-eagle", bId: "old-weller", winnerId: "old-eagle" }],
    identityLinks: { "old-eagle": "new-eagle" },
    barcodeLinks: { "012": "old-eagle" },
    flights: [{ pours: [{ glass: "A", bottleId: "old-weller" }], tasters: [] }]
  }, { schemaVersion: 10, activeBottleId: "new-eagle", storePrice: "", statuses: {}, tastings: [], huntLog: [] }, { idAliases: aliases });

  assert.equal(state.activeBottleId, "new-eagle");
  assert.equal(state.statuses["new-eagle"], "wishlist", "existing target value wins");
  assert.equal(state.statuses["new-weller"], "tasted", "chained alias resolves twice");
  assert.equal(state.statuses["old-eagle"], undefined);
  assert.equal(state.collection["new-eagle"].count, 3, "counts merge");
  assert.deepEqual(state.collection["new-eagle"].batches.sort(), ["B1", "B2"]);
  assert.equal(state.prices["new-eagle"].length, 1);
  assert.equal(state.tastings[0].bottleId, "new-eagle");
  assert.equal(state.killLog[0].bottleId, "new-weller");
  assert.equal(state.matchups[0].winnerId, "new-eagle");
  assert.deepEqual(state.identityLinks, {}, "self-links dropped after remap");
  assert.equal(state.barcodeLinks["012"], "new-eagle");
  assert.equal(state.flights[0].pours[0].bottleId, "new-weller");
});
