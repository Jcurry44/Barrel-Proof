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
