const test = require("node:test");
const assert = require("node:assert/strict");
const night = require("../src/logic/night.js");

const reverseShuffle = (list) => list.slice().reverse();

test("createFlight assigns shuffled glass letters and dedupes tasters", () => {
  const bottles = [
    { id: "a", name: "Eagle Rare" },
    { id: "b", name: "Rare Breed" },
    { id: "c", name: "Weller 12" }
  ];
  const flight = night.createFlight(bottles, ["Joe", "joe", " Dana "], { shuffle: reverseShuffle });
  assert.equal(flight.status, "scoring");
  // reversed order -> glass A is the last bottle
  assert.deepEqual(flight.pours.map((p) => p.glass), ["A", "B", "C"]);
  assert.deepEqual(flight.pours.map((p) => p.bottleId), ["c", "b", "a"]);
  // tasters trimmed + case-insensitively deduped
  assert.deepEqual(flight.tasters, ["Joe", "Dana"]);
});

test("setScore / scoredCount / canReveal track progress and clamp", () => {
  const flight = night.createFlight([{ id: "a", name: "A" }, { id: "b", name: "B" }], ["Joe"], { shuffle: (l) => l });
  assert.equal(night.canReveal(flight), false);
  night.setScore(flight, "A", "Joe", 9);
  night.setScore(flight, "B", "Joe", 99); // clamped to 10
  assert.equal(night.scoredCount(flight), 2);
  assert.equal(flight.scores.B.Joe, 10);
  assert.equal(night.canReveal(flight), true);
  assert.equal(night.expectedScores(flight), 2);
  night.setScore(flight, "A", "Joe", ""); // empty removes
  assert.equal(night.scoredCount(flight), 1);
});

test("flightResults ranks by room average and flags a value win", () => {
  const bottles = [
    { id: "cheap", name: "Cheap Pour" },
    { id: "dear", name: "Pricey Pour" }
  ];
  const flight = night.createFlight(bottles, ["Joe", "Dana"], { shuffle: (l) => l });
  // glass A = cheap, glass B = dear
  night.setScore(flight, "A", "Joe", 9);
  night.setScore(flight, "A", "Dana", 9);
  night.setScore(flight, "B", "Joe", 6);
  night.setScore(flight, "B", "Dana", 7);
  const lookup = (id) => (id === "cheap" ? { refPrice: 40, hype: 30 } : { refPrice: 200, hype: 95 });
  const results = night.flightResults(flight, lookup);
  assert.equal(results.ranked[0].bottleName, "Cheap Pour");
  assert.equal(results.ranked[0].average, 9);
  assert.equal(results.ranked[1].average, 6.5);
  assert.match(results.headline, /Value win/);
});

test("flightResults flags a hype upset when prices are equal", () => {
  const bottles = [{ id: "hyped", name: "Hyped" }, { id: "sleeper", name: "Sleeper" }];
  const flight = night.createFlight(bottles, ["Joe"], { shuffle: (l) => l });
  night.setScore(flight, "A", "Joe", 5); // hyped scores low
  night.setScore(flight, "B", "Joe", 9); // sleeper wins
  const lookup = (id) => (id === "hyped" ? { refPrice: 80, hype: 96 } : { refPrice: 80, hype: 20 });
  const results = night.flightResults(flight, lookup);
  assert.equal(results.ranked[0].bottleName, "Sleeper");
  assert.match(results.headline, /Hype check/);
});

test("unscored glasses are reported, not ranked", () => {
  const flight = night.createFlight([{ id: "a", name: "A" }, { id: "b", name: "B" }], ["Joe"], { shuffle: (l) => l });
  night.setScore(flight, "A", "Joe", 8);
  const results = night.flightResults(flight, () => ({}));
  assert.equal(results.ranked.length, 1);
  assert.equal(results.unscored.length, 1);
  assert.equal(results.unscored[0].bottleName, "B");
});
