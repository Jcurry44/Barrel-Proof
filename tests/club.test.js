const test = require("node:test");
const assert = require("node:assert/strict");
const club = require("../src/logic/club.js");

const palate = { name: "Joe", proofPreference: 105, favoriteProfiles: ["cherry", "oak", "caramel"] };

test("buildCardFromState turns tastings into per-bottle ratings", () => {
  const state = {
    statuses: { "eagle-rare-10": "owned", "rare-breed": "owned", "weller-12": "wishlist" },
    tastings: [
      { bottleId: "rare-breed", score: 9 },
      { bottleId: "rare-breed", score: 8 },     // averages to 8.5
      { bottleId: "eagle-rare-10", score: 9.4 },
      { bottleId: "weller-12", score: 7 }
    ]
  };
  const card = club.buildCardFromState(state, palate);
  assert.equal(card.source, "barrel-proof-club");
  assert.equal(card.name, "Joe");
  assert.equal(card.ratings["rare-breed"], 8.5);
  assert.equal(card.ratings["eagle-rare-10"], 9.4);
  // owned comes from statuses
  assert.deepEqual(card.owned.sort(), ["eagle-rare-10", "rare-breed"]);
  // favorites are the >=8.5 pours, highest first
  assert.deepEqual(card.favorites, ["eagle-rare-10", "rare-breed"]);
  // style summarizes the palate
  assert.match(card.style, /cherry/);
  assert.match(card.style, /105 proof/);
});

test("normalizeCard sanitizes a card and rejects non-cards", () => {
  assert.equal(club.normalizeCard(null), null);
  assert.equal(club.normalizeCard({ source: "some-other-app" }), null);

  const card = club.normalizeCard({
    card: {
      name: "  Dana  ",
      style: "barrel proof fiend",
      ratings: { "eagle-rare-10": "9.4", "bad": "nope", "hi": 99 },
      favorites: ["eagle-rare-10", 123],
      owned: ["eagle-rare-10"]
    }
  });
  assert.equal(card.name, "Dana");
  assert.equal(card.ratings["eagle-rare-10"], 9.4);
  assert.equal(card.ratings["hi"], 10); // clamped to 10
  assert.equal("bad" in card.ratings, false); // non-numeric dropped
  assert.deepEqual(card.favorites, ["eagle-rare-10", "123"]);
});

test("mergeFriend adds, then replaces by name (case-insensitive)", () => {
  let friends = [];
  friends = club.mergeFriend(friends, { name: "Dana", ratings: { a: 9 } });
  assert.equal(friends.length, 1);
  friends = club.mergeFriend(friends, { name: "Sam", ratings: { a: 7 } });
  assert.equal(friends.length, 2);
  friends = club.mergeFriend(friends, { name: "dana", ratings: { a: 6 } }); // re-import updates
  assert.equal(friends.length, 2);
  assert.equal(friends.find((f) => f.name === "dana").ratings.a, 6);
});

test("removeFriend drops by name", () => {
  const friends = [{ name: "Dana" }, { name: "Sam" }];
  const next = club.removeFriend(friends, "dana");
  assert.deepEqual(next.map((f) => f.name), ["Sam"]);
});

test("bottleConsensus summarizes how the room rated a bottle", () => {
  const friends = [
    { name: "Dana", ratings: { "eagle-rare-10": 9 } },
    { name: "Sam", ratings: { "eagle-rare-10": 8 } },
    { name: "Lee", ratings: { "weller-12": 7 } }
  ];
  const c = club.bottleConsensus("eagle-rare-10", friends);
  assert.equal(c.count, 2);
  assert.equal(c.average, 8.5);
  assert.equal(c.high, 9);
  assert.equal(c.low, 8);
  assert.equal(club.bottleConsensus("not-rated", friends), null);
});
