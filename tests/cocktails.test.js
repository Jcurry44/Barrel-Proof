const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {
  formatIngredients,
  getBestCocktailForBottle,
  rankCocktailsForBottle,
  scoreCocktailForBottle
} = require("../src/logic/cocktails.js");

function loadCocktails() {
  const context = {};
  context.window = context;
  context.self = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", "data", "cocktails.js"), "utf8"), context);
  return context.BarrelCocktailData.cocktails;
}

test("cocktail manual includes complete high-end specs", () => {
  const cocktails = loadCocktails();

  assert.ok(cocktails.length >= 15);
  for (const cocktail of cocktails) {
    assert.ok(cocktail.name);
    assert.ok(cocktail.family);
    assert.ok(cocktail.proofLane);
    assert.ok(cocktail.glassware);
    assert.ok(cocktail.ice);
    assert.ok(cocktail.garnish);
    assert.ok(cocktail.barNotes);
    assert.ok(cocktail.ingredients.length >= 3);
    assert.ok(cocktail.technique.length >= 2);
  }
});

test("cocktail ranking favors a strong spirit-forward bourbon in stirred classics", () => {
  const cocktails = loadCocktails();
  const rareBreed = {
    name: "Wild Turkey Rare Breed",
    category: "Barrel Proof Bourbon",
    proof: 116.8,
    rarity: "Findable",
    profile: ["caramel", "oak", "baking spice", "tobacco"],
    bestFor: ["barrel proof", "value", "nightcap"]
  };
  const best = getBestCocktailForBottle(rareBreed, cocktails);

  assert.ok(["old-fashioned", "boulevardier", "bourbon-sazerac"].includes(best.cocktail.id));
  assert.ok(best.score >= 80);
});

test("protected sour specs penalize allocated bottles", () => {
  const cocktails = loadCocktails();
  const sour = cocktails.find((cocktail) => cocktail.id === "whiskey-sour");
  const allocated = {
    name: "Weller Antique 107",
    category: "Wheated Bourbon",
    proof: 107,
    rarity: "Allocated",
    profile: ["cherry", "wheat sweetness", "oak", "cinnamon"],
    bestFor: ["wheated", "special pour"]
  };
  const findable = {
    ...allocated,
    rarity: "Findable"
  };

  assert.ok(scoreCocktailForBottle(findable, sour) > scoreCocktailForBottle(allocated, sour));
});

test("ingredient formatting keeps amount, item, and bar note together", () => {
  const cocktails = loadCocktails();
  const oldFashioned = cocktails.find((cocktail) => cocktail.id === "old-fashioned");
  const ingredients = formatIngredients(oldFashioned);

  assert.ok(ingredients[0].includes("2 oz bourbon"));
  assert.ok(ingredients.some((ingredient) => ingredient.includes("2:1 demerara syrup")));
});

test("rankings return every cocktail sorted by fit", () => {
  const cocktails = loadCocktails();
  const bottle = {
    name: "Eagle Rare 10 Year",
    category: "Kentucky Straight Bourbon",
    proof: 90,
    rarity: "Allocated",
    profile: ["cherry", "oak", "vanilla", "orange peel"],
    bestFor: ["sharing", "classic pour", "gift"]
  };
  const ranked = rankCocktailsForBottle(bottle, cocktails);

  assert.equal(ranked.length, cocktails.length);
  assert.ok(ranked[0].score >= ranked[ranked.length - 1].score);
});
