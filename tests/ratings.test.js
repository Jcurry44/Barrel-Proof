const test = require("node:test");
const assert = require("node:assert/strict");
const ratings = require("../src/logic/ratings.js");

const state = {
  tastings: [
    // Weller: loved sighted, mediocre blind — the "label tax" case.
    { bottleId: "weller", score: 9.5, context: "Neat pour" },
    { bottleId: "weller", score: 9.0, context: "Rocks" },
    { bottleId: "weller", score: 7.5, context: "Blind — Tasting Night" },
    { bottleId: "weller", score: 7.9, context: "Blind — Tasting Night" },
    // Rare Breed: underrated sighted, shines blind.
    { bottleId: "rare-breed", score: 8.0, context: "Neat pour" },
    { bottleId: "rare-breed", score: 9.2, context: "blind flight" },
    // ECBP: sighted only.
    { bottleId: "ecbp", score: 9.0, context: "Neat pour" },
    // junk that must be ignored
    { bottleId: "", score: 9 },
    { bottleId: "x", score: NaN }
  ]
};

test("bottleRatings splits sighted vs blind and computes the delta", () => {
  const r = ratings.bottleRatings(state);
  assert.equal(r.weller.sightedAvg, 9.3);
  assert.equal(r.weller.blindAvg, 7.7);
  assert.equal(r.weller.delta, 1.5, "positive delta = scores higher when the label is visible");
  assert.equal(r.weller.count, 4);
  assert.equal(r["rare-breed"].delta, -1.2, "negative delta = overperforms blind");
  assert.equal(r.ecbp.blindCount, 0);
  assert.equal(r.ecbp.delta, null, "no delta without both kinds of data");
  assert.equal(r.x, undefined);
});

test("blindGaps surfaces real divergence, biggest first", () => {
  const gaps = ratings.blindGaps(ratings.bottleRatings(state), 0.5);
  assert.deepEqual(gaps.map((g) => g.bottleId), ["weller", "rare-breed"]);
  assert.ok(gaps[0].delta > 0 && gaps[1].delta < 0);
  // ecbp (no blind data) never appears
  assert.ok(!gaps.some((g) => g.bottleId === "ecbp"));
});

test("categoryBoard ranks rated bottles within a style", () => {
  const bottles = [
    { id: "weller", name: "Weller Antique" },
    { id: "rare-breed", name: "Wild Turkey Rare Breed" },
    { id: "ecbp", name: "Elijah Craig Barrel Proof" }
  ];
  const attrs = {
    weller: { whiskeyType: "Bourbon", style: "Wheated bourbon" },
    "rare-breed": { whiskeyType: "Bourbon", caskStrength: true },
    ecbp: { whiskeyType: "Bourbon", caskStrength: true }
  };
  const attrFn = (b) => attrs[b.id];
  const r = ratings.bottleRatings(state);

  const cask = ratings.categoryBoard(r, bottles, attrFn, "cask");
  assert.deepEqual(cask.rows.map((row) => row.bottle.id), ["ecbp", "rare-breed"]);
  assert.equal(cask.summary.count, 2);

  const wheated = ratings.categoryBoard(r, bottles, attrFn, "wheated");
  assert.deepEqual(wheated.rows.map((row) => row.bottle.id), ["weller"]);

  const all = ratings.categoryBoard(r, bottles, attrFn, "all");
  assert.equal(all.rows.length, 3);
  assert.equal(all.rows[0].bottle.id, "ecbp", "highest avg first");
});

test("category matching covers the style axes", () => {
  assert.ok(ratings.matchesCategory({ bottledInBond: true }, "bib"));
  assert.ok(ratings.matchesCategory({ whiskeyType: "Rye whiskey" }, "rye"));
  assert.ok(ratings.matchesCategory({ singleBarrel: true }, "single"));
  assert.ok(ratings.matchesCategory({ finished: true }, "finished"));
  assert.ok(!ratings.matchesCategory({ whiskeyType: "Bourbon" }, "rye"));
  assert.ok(ratings.matchesCategory({}, "all"));
});

test("explicit blind flag wins over context text; legacy context still recognized", () => {
  assert.ok(ratings.isBlindTasting({ blind: true, context: "Neat pour" }));
  assert.ok(!ratings.isBlindTasting({ blind: false, context: "Blind — Tasting Night" }));
  assert.ok(ratings.isBlindTasting({ context: "Blind — Tasting Night" }), "legacy Night logs without the flag");
  assert.ok(!ratings.isBlindTasting({ context: "Neat pour" }));
});

test("guess matching is generous but not sloppy", () => {
  const eagle = { name: "Eagle Rare 10 Year", aliases: ["eagle rare", "er10"] };
  assert.ok(ratings.isGuessCorrect("eagle rare", eagle));
  assert.ok(ratings.isGuessCorrect("Eagle Rare 10", eagle));
  assert.ok(ratings.isGuessCorrect("ER10", eagle), "alias match");
  assert.ok(!ratings.isGuessCorrect("weller", eagle));
  assert.ok(!ratings.isGuessCorrect("", eagle));
  assert.ok(!ratings.isGuessCorrect("e", eagle), "too short to count");
  assert.ok(!ratings.isGuessCorrect("eagle rare", null));
});

test("guessVerdict gives partial credit for the right house or style", () => {
  const wlw = { name: "William Larue Weller", aliases: ["wlw"] };
  const meta = { distillery: "Buffalo Trace", style: "Wheated bourbon" };
  assert.equal(ratings.guessVerdict("william larue weller", wlw, meta).level, "nailed");
  assert.equal(ratings.guessVerdict("buffalo trace", wlw, meta).level, "close");
  assert.match(ratings.guessVerdict("buffalo trace", wlw, meta).why, /Buffalo Trace/);
  assert.equal(ratings.guessVerdict("some kind of wheater", wlw, meta).level, "close");
  assert.match(ratings.guessVerdict("a wheated bomb", wlw, meta).why, /wheated/i);
  assert.equal(ratings.guessVerdict("four roses", wlw, meta).level, "miss");
  assert.equal(ratings.guessVerdict("", wlw, meta).level, "miss");
  // unknown producer never grants house credit
  assert.equal(ratings.guessVerdict("unknown producer", { name: "X" }, { distillery: "Unknown producer", style: "" }).level, "miss");
});

test("rebuyBoard: latest verdict per bottle wins; buckets are right", () => {
  const board = ratings.rebuyBoard([
    { bottleId: "weller", date: "2026-01-01", rebuy: false },
    { bottleId: "weller", date: "2026-05-01", rebuy: true },   // rebought, finished again → latest wins
    { bottleId: "ecbp", date: "2026-03-01", rebuy: false },
    { bottleId: "rare-breed", date: "2026-06-01", rebuy: null }
  ]);
  assert.deepEqual(board.rebuys.map((e) => e.bottleId), ["weller"]);
  assert.deepEqual(board.enoughs.map((e) => e.bottleId), ["ecbp"]);
  assert.deepEqual(board.unanswered.map((e) => e.bottleId), ["rare-breed"]);
  assert.equal(board.finishedCount, 3);
  assert.equal(ratings.rebuyBoard([]).finishedCount, 0);
  assert.equal(ratings.rebuyBoard(undefined).finishedCount, 0);
});

test("identity resolver merges duplicate spellings into one rating record", () => {
  const splitState = { tastings: [
    { bottleId: "eagle-import", score: 9, context: "Neat" },
    { bottleId: "eagle-seed", score: 8, context: "Neat" }
  ]};
  const links = { "eagle-import": "eagle-seed" };
  const merged = ratings.bottleRatings(splitState, (id) => links[id] || id);
  assert.equal(merged["eagle-import"], undefined);
  assert.equal(merged["eagle-seed"].count, 2);
  assert.equal(merged["eagle-seed"].avg, 8.5);
});

test("scoreDistribution buckets pours and frames percentiles", () => {
  const dist = ratings.scoreDistribution([5, 6.5, 7.5, 8.2, 8.7, 9.1, 9.4].map((score) => ({ score })));
  assert.equal(dist.count, 7);
  assert.deepEqual(dist.buckets.map((b) => b.count), [1, 1, 1, 2, 2]);
  assert.equal(dist.topShare(9), 28.6);
  assert.ok(dist.p90 >= 9);
  assert.equal(ratings.scoreDistribution([]), null);
});

test("ratingConflicts finds score-vs-pick disagreements both directions", () => {
  const r = { a: { avg: 9.2 }, b: { avg: 8.2 }, c: { avg: 7.0 } };
  const matchups = [
    { aId: "a", bId: "b", winnerId: "b" },
    { aId: "b", bId: "a", winnerId: "b" },
    { aId: "a", bId: "c", winnerId: "a" }   // consistent — no conflict
  ];
  const conflicts = ratings.ratingConflicts(r, matchups);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].ratedHigher, "a");
  assert.equal(conflicts[0].pickedMore, "b");
  assert.equal(conflicts[0].record, "2–0");
});
