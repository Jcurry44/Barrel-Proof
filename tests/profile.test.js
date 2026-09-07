const test = require("node:test");
const assert = require("node:assert/strict");
const profile = require("../src/logic/profile.js");

test("normalizeProfile sanitizes name, comfort, and flavors", () => {
  const clean = profile.normalizeProfile({
    name: "  Dana   Q  ",
    proofComfort: "barrel",
    flavors: ["Cherry", "cherry", " OAK ", "", 42, "a very long flavor name that keeps going", "x", "y", "z", "w"],
    onboardedAt: "2026-09-07T00:00:00.000Z"
  });
  assert.equal(clean.name, "Dana Q");
  assert.equal(clean.proofComfort, "barrel");
  assert.deepEqual(clean.flavors.slice(0, 3), ["cherry", "oak", "42"]);
  assert.ok(clean.flavors.length <= profile.MAX_FLAVORS);
  assert.equal(profile.isOnboarded(clean), true);
  assert.equal(profile.isOnboarded(profile.normalizeProfile({})), false);
  assert.equal(profile.normalizeProfile({ proofComfort: "nonsense" }).proofComfort, "");
});

test("buildPalate turns the profile into the decision engine's palate", () => {
  const base = { name: "", proofPreference: 100, favoriteProfiles: [], avoidProfiles: ["thin"], priceDiscipline: 0.7, noveltyPreference: 0.5 };
  const palate = profile.buildPalate({ name: "Dana", proofComfort: "barrel", flavors: ["cherry", "oak"] }, base);
  assert.equal(palate.name, "Dana");
  assert.equal(palate.proofPreference, 118);
  assert.deepEqual(palate.favoriteProfiles, ["cherry", "oak", "barrel proof"]);
  assert.deepEqual(palate.avoidProfiles, ["thin"]);
  // An empty profile falls back to the neutral base: nothing is invented.
  const neutral = profile.buildPalate({}, base);
  assert.equal(neutral.name, "");
  assert.equal(neutral.proofPreference, 100);
  assert.deepEqual(neutral.favoriteProfiles, []);
  // "Easy sipper" lowers the proof preference.
  assert.equal(profile.buildPalate({ proofComfort: "easy" }, base).proofPreference, 90);
});

test("describeProfile and displayName read well", () => {
  assert.equal(profile.describeProfile({ proofComfort: "standard", flavors: ["cherry", "oak", "caramel", "honey"] }), "Full flavor · cherry, oak, caramel");
  assert.equal(profile.describeProfile({}), "");
  assert.equal(profile.displayName({ name: "" }), "Me");
  assert.equal(profile.displayName({ name: "Joe" }), "Joe");
});
