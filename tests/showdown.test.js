const test = require("node:test");
const assert = require("node:assert");

require("../src/logic/families.js");
require("../src/logic/showdown.js");
const S = globalThis.BarrelShowdown;

const bottles = {
  pappy: { id: "pappy", name: "Pappy Van Winkle 15", hypeIndex: 100, rarity: "Unicorn", msrp: 120, distillery: "Buffalo Trace", category: "Kentucky Straight Bourbon" },
  jim: { id: "jim", name: "Jim Beam White Label", hypeIndex: 15, rarity: "Findable", msrp: 18, distillery: "Jim Beam", category: "Kentucky Straight Bourbon" },
  eagle: { id: "eagle", name: "Eagle Rare 10", hypeIndex: 74, rarity: "Allocated", msrp: 40, distillery: "Buffalo Trace", category: "Kentucky Straight Bourbon" }
};

test("tierScore ranks a trophy bottle above a daily pour", () => {
  assert.ok(S.tierScore(bottles.pappy) > S.tierScore(bottles.jim));
});

test("matchupOutlook flags a clear favorite by tier gap", () => {
  const o = S.matchupOutlook(bottles.pappy, bottles.jim);
  assert.equal(o.favorite, "a");
  assert.ok(o.absGap >= 22);
});

test("compute builds Elo ratings and win/loss records", () => {
  const matchups = [
    { id: "1", aId: "jim", bId: "eagle", winnerId: "jim" },
    { id: "2", aId: "pappy", bId: "jim", winnerId: "pappy" }
  ];
  const data = S.compute(matchups, bottles);
  assert.equal(data.total, 2);
  const jim = data.bottleStandings.find((b) => b.id === "jim");
  assert.equal(jim.w, 1);
  assert.equal(jim.l, 1);
  assert.ok(data.distStandings.length >= 1, "distillery ladder populated");
});

test("upset detection surfaces a value bottle beating a trophy", () => {
  const data = S.compute([{ id: "1", aId: "jim", bId: "pappy", winnerId: "jim" }], bottles);
  assert.equal(data.upsets.length, 1);
  assert.equal(data.upsets[0].winner.id, "jim");
});

test("an expected result (trophy beats daily) is NOT an upset", () => {
  const data = S.compute([{ id: "1", aId: "pappy", bId: "jim", winnerId: "pappy" }], bottles);
  assert.equal(data.upsets.length, 0);
});

test("ties split the score and count for both bottles", () => {
  const data = S.compute([{ id: "1", aId: "eagle", bId: "jim", winnerId: "tie" }], bottles);
  const eagle = data.bottleStandings.find((b) => b.id === "eagle");
  assert.equal(eagle.t, 1);
});

test("invalid or self matchups are ignored", () => {
  const data = S.compute([
    { id: "1", aId: "jim", bId: "jim", winnerId: "jim" },
    { id: "2", aId: "jim", bId: "ghost", winnerId: "jim" }
  ], bottles);
  assert.equal(data.total, 0);
});
