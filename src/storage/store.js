(function attachStore(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(root);
  } else {
    root.BarrelStore = factory(root);
  }
})(typeof window !== "undefined" ? window : globalThis, function createStore(global) {
  const STORAGE_KEY = "barrel-proof-state-v1";
  const CURRENT_VERSION = 9;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeState(state, defaults, options = {}) {
    const fallback = clone(defaults);
    const input = state && typeof state === "object" ? state : {};
    const migrated = migrateState(input);
    const normalized = {
      ...fallback,
      ...migrated,
      schemaVersion: CURRENT_VERSION,
      statuses: {
        ...fallback.statuses,
        ...(migrated.statuses || {})
      },
      tastings: Array.isArray(migrated.tastings) ? migrated.tastings : fallback.tastings,
      huntLog: Array.isArray(migrated.huntLog) ? migrated.huntLog : fallback.huntLog,
      matchups: Array.isArray(migrated.matchups) ? migrated.matchups : (fallback.matchups || []),
      collection: migrated.collection && typeof migrated.collection === "object" ? migrated.collection : (fallback.collection || {}),
      prices: migrated.prices && typeof migrated.prices === "object" ? migrated.prices : (fallback.prices || {}),
      club: migrated.club && typeof migrated.club === "object" ? migrated.club : (fallback.club || { friends: [] }),
      activeFlight: migrated.activeFlight && typeof migrated.activeFlight === "object" ? migrated.activeFlight : (fallback.activeFlight || null),
      flights: Array.isArray(migrated.flights) ? migrated.flights : (fallback.flights || []),
      barcodeLinks: migrated.barcodeLinks && typeof migrated.barcodeLinks === "object" ? migrated.barcodeLinks : (fallback.barcodeLinks || {}),
      killLog: Array.isArray(migrated.killLog) ? migrated.killLog : (fallback.killLog || [])
    };
    return validateState(normalized, fallback, options);
  }

  function migrateState(input) {
    const version = Number(input.schemaVersion) || 0;
    const next = { ...input };
    if (version < 1) {
      next.statuses = next.statuses && typeof next.statuses === "object" ? next.statuses : {};
      next.tastings = Array.isArray(next.tastings) ? next.tastings : [];
      next.huntLog = Array.isArray(next.huntLog) ? next.huntLog : [];
    }
    if (version < 2) {
      next.storePrice = Number.isFinite(Number(next.storePrice)) ? Number(next.storePrice) : "";
    }
    if (version < 3) {
      next.matchups = Array.isArray(next.matchups) ? next.matchups : [];
    }
    if (version < 4) {
      next.collection = next.collection && typeof next.collection === "object" ? next.collection : {};
    }
    if (version < 5) {
      next.prices = next.prices && typeof next.prices === "object" ? next.prices : {};
    }
    if (version < 6) {
      next.club = next.club && typeof next.club === "object"
        ? { friends: Array.isArray(next.club.friends) ? next.club.friends : [] }
        : { friends: [] };
    }
    if (version < 7) {
      next.activeFlight = next.activeFlight && typeof next.activeFlight === "object" ? next.activeFlight : null;
      next.flights = Array.isArray(next.flights) ? next.flights : [];
    }
    if (version < 8) {
      next.barcodeLinks = next.barcodeLinks && typeof next.barcodeLinks === "object" ? next.barcodeLinks : {};
    }
    if (version < 9) {
      next.killLog = Array.isArray(next.killLog) ? next.killLog : [];
    }
    return next;
  }

  function validateState(state, fallback, options = {}) {
    const bottleIds = new Set(options.bottleIds || []);
    if (bottleIds.size && !bottleIds.has(state.activeBottleId)) {
      state.activeBottleId = bottleIds.has(fallback.activeBottleId)
        ? fallback.activeBottleId
        : Array.from(bottleIds)[0] || fallback.activeBottleId;
    }
    // Only prune "ghost" statuses against the loaded catalog when that catalog is
    // trustworthy. If the catalog failed to load (seed/fallback mode), pruning would
    // permanently delete the user's owned/wishlist/passed tags for every imported
    // bottle on the next save. Data preservation wins over tidiness on a degraded boot.
    if (bottleIds.size && options.pruneStatuses !== false) {
      state.statuses = Object.fromEntries(
        Object.entries(state.statuses || {}).filter(([bottleId]) => bottleIds.has(bottleId))
      );
    }
    return state;
  }

  function load(defaults, options = {}) {
    try {
      const raw = global.localStorage && global.localStorage.getItem(STORAGE_KEY);
      if (!raw) return normalizeState(defaults, defaults, options);
      return normalizeState(JSON.parse(raw), defaults, options);
    } catch (error) {
      console.warn("Failed to load Barrel Proof state:", error);
      return normalizeState(defaults, defaults, options);
    }
  }

  function save(state) {
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (error) {
      console.warn("Failed to save Barrel Proof state:", error);
      return false;
    }
  }

  function reset(defaults, options = {}) {
    global.localStorage.removeItem(STORAGE_KEY);
    return normalizeState(defaults, defaults, options);
  }

  return {
    CURRENT_VERSION,
    STORAGE_KEY,
    load,
    migrateState,
    normalizeState,
    reset,
    save
  };
});
