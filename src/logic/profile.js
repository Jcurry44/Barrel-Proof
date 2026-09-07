(function attachProfile(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.BarrelProfile = factory();
  }
})(typeof self !== "undefined" ? self : this, function createProfileModule() {
  // Who is holding the phone. The app used to ship one hard-coded palate (a
  // name, a proof preference, favorite flavors), so every friend who opened it
  // got that person's name on their blind flights and club card, and that
  // person's taste behind every "palate fit". The profile is per device, set
  // on first run, editable any time, and the ONLY source of ctx.palate.

  const PROOF_COMFORT = [
    { id: "easy", label: "Easy sipper", detail: "80–95 proof, smooth and approachable", proof: 90 },
    { id: "standard", label: "Full flavor", detail: "95–110 proof, the classic sweet spot", proof: 102 },
    { id: "barrel", label: "Barrel proof", detail: "115+ proof, uncut and unafraid", proof: 118 }
  ];

  // Flavor chips a new user can tap. These are the tags the seeded/curated
  // bottle profiles use, so a pick actually moves the palate-fit needle.
  const FLAVOR_OPTIONS = [
    "caramel", "vanilla", "brown sugar", "honey",
    "cherry", "dark fruit", "stone fruit", "citrus",
    "oak", "toasted oak", "baking spice", "rye spice",
    "cocoa", "tobacco", "floral", "heat"
  ];

  const MAX_FLAVORS = 6;

  const DEFAULT_PROFILE = {
    name: "",
    proofComfort: "",
    flavors: [],
    onboardedAt: ""
  };

  function cleanName(value) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, 40);
  }

  function normalizeProfile(raw) {
    const input = raw && typeof raw === "object" ? raw : {};
    const comfort = PROOF_COMFORT.find((option) => option.id === input.proofComfort);
    const seen = new Set();
    const flavors = [];
    for (const flavor of Array.isArray(input.flavors) ? input.flavors : []) {
      const clean = String(flavor == null ? "" : flavor).toLowerCase().replace(/\s+/g, " ").trim().slice(0, 24);
      if (!clean || seen.has(clean)) continue;
      seen.add(clean);
      flavors.push(clean);
      if (flavors.length >= MAX_FLAVORS) break;
    }
    return {
      name: cleanName(input.name),
      proofComfort: comfort ? comfort.id : "",
      flavors,
      onboardedAt: typeof input.onboardedAt === "string" ? input.onboardedAt : ""
    };
  }

  function isOnboarded(profile) {
    return Boolean(profile && profile.onboardedAt);
  }

  // The palate the decision engine reads. `base` is the app's neutral default;
  // the profile overrides whatever the person actually told us.
  function buildPalate(profile, base) {
    const clean = normalizeProfile(profile);
    const fallback = base && typeof base === "object" ? base : {};
    const comfort = PROOF_COMFORT.find((option) => option.id === clean.proofComfort);
    const favorites = clean.flavors.slice();
    if (comfort && comfort.id === "barrel" && !favorites.includes("barrel proof")) favorites.push("barrel proof");
    return {
      name: clean.name || cleanName(fallback.name),
      proofPreference: comfort ? comfort.proof : (Number.isFinite(Number(fallback.proofPreference)) ? Number(fallback.proofPreference) : 100),
      favoriteProfiles: favorites.length ? favorites : (Array.isArray(fallback.favoriteProfiles) ? fallback.favoriteProfiles.slice() : []),
      avoidProfiles: Array.isArray(fallback.avoidProfiles) ? fallback.avoidProfiles.slice() : [],
      priceDiscipline: Number.isFinite(Number(fallback.priceDiscipline)) ? Number(fallback.priceDiscipline) : 0.7,
      noveltyPreference: Number.isFinite(Number(fallback.noveltyPreference)) ? Number(fallback.noveltyPreference) : 0.5
    };
  }

  // One line for the header / club card: "Barrel proof · cherry, oak, caramel".
  function describeProfile(profile) {
    const clean = normalizeProfile(profile);
    const comfort = PROOF_COMFORT.find((option) => option.id === clean.proofComfort);
    const parts = [];
    if (comfort) parts.push(comfort.label);
    if (clean.flavors.length) parts.push(clean.flavors.slice(0, 3).join(", "));
    return parts.join(" · ");
  }

  function displayName(profile) {
    const clean = normalizeProfile(profile);
    return clean.name || "Me";
  }

  return {
    DEFAULT_PROFILE,
    FLAVOR_OPTIONS,
    MAX_FLAVORS,
    PROOF_COMFORT,
    buildPalate,
    describeProfile,
    displayName,
    isOnboarded,
    normalizeProfile
  };
});
