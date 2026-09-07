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

test("share tokens round-trip a club card through a URL, compressed when possible", async () => {
  const card = club.buildCardFromState({
    statuses: { "eagle-rare-10": "owned" },
    tastings: [{ bottleId: "eagle-rare-10", score: 9.4 }, { bottleId: "imported-weller-antique-107-750ml-12345", score: 8.7 }]
  }, palate);
  const token = await club.buildShareToken(card);
  assert.ok(token.startsWith("z.") || token.startsWith("j."), "token carries its encoding prefix");
  assert.match(token, /^[A-Za-z0-9._-]+$/, "token is URL-safe");
  const url = club.buildShareUrl("https://example.test/Barrel-Proof/index.html#old", token);
  assert.equal(url, "https://example.test/Barrel-Proof/index.html#club=" + token);
  assert.equal(club.extractShareToken(url), token);
  assert.equal(club.extractShareToken("https://example.test/"), "");
  const back = await club.parseShareToken(token);
  assert.equal(back.name, "Joe");
  assert.equal(back.ratings["eagle-rare-10"], 9.4);
  assert.equal(back.ratings["imported-weller-antique-107-750ml-12345"], 8.7);
  assert.deepEqual(back.owned, ["eagle-rare-10"]);
  assert.deepEqual(back.favorites, ["eagle-rare-10", "imported-weller-antique-107-750ml-12345"]);
});

test("parseShareToken rejects garbage instead of throwing", async () => {
  assert.equal(await club.parseShareToken(""), null);
  assert.equal(await club.parseShareToken("x.notatoken"), null);
  assert.equal(await club.parseShareToken("j.!!!"), null);
  assert.equal(await club.parseShareToken("z.AAAA"), null);
});

test("a 60-rating card makes a link short enough for a group chat", async () => {
  const ratings = {};
  for (let i = 0; i < 60; i += 1) ratings["imported-some-kentucky-straight-bourbon-whiskey-750ml-" + (10000 + i)] = 7 + (i % 3);
  const token = await club.buildShareToken({ source: club.CARD_APP, name: "Dana", ratings, favorites: [], owned: [] });
  assert.ok(token.length < 1600, "compressed token is compact, got " + token.length);
  const back = await club.parseShareToken(token);
  assert.equal(Object.keys(back.ratings).length, 60);
});
