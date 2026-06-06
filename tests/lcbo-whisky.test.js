const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildImportPayload,
  parseLcboCoveoPayloads
} = require("../tools/import-lcbo-whisky.js");

function result(raw) {
  return {
    title: raw.ec_name,
    clickUri: "https://www.lcbo.com/en/" + String(raw.permanentid || raw.ec_skus[0]),
    raw: {
      lcbo_selling_package_name: "bottle",
      stores_stock: "true",
      is_buyable: "true",
      enabled: "true",
      ...raw
    }
  };
}

test("LCBO importer keeps broad serious whisky categories", () => {
  const rows = parseLcboCoveoPayloads([
    {
      results: [
        result({
          ec_skus: ["111"],
          permanentid: "111",
          ec_name: "W.L. Weller Antique 107 Kentucky Straight Bourbon Whiskey",
          ec_brand: "W.L. Weller",
          country_of_manufacture: "United States",
          lcbo_alcohol_percent: 53.5,
          lcbo_total_volume: 750,
          ec_price: 72.95,
          ec_final_price: 72.95,
          ec_category: ["Products|Spirits|Whisky|American Whiskey & Bourbon|Bourbon"]
        }),
        result({
          ec_skus: ["222"],
          permanentid: "222",
          ec_name: "Woodford Reserve Straight Rye Whiskey",
          ec_brand: "Woodford Reserve",
          country_of_manufacture: "United States",
          lcbo_alcohol_percent: 45.2,
          lcbo_total_volume: 750,
          ec_price: 54.95,
          ec_category: ["Products|Spirits|Whisky|American Whiskey & Bourbon|American Rye Whiskey"]
        }),
        result({
          ec_skus: ["333"],
          permanentid: "333",
          ec_name: "Milk & Honey Classic Single Malt Whisky Kosher",
          ec_brand: "Milk & Honey",
          country_of_manufacture: "Israel",
          lcbo_alcohol_percent: 46,
          lcbo_total_volume: 750,
          ec_price: 104.95,
          ec_category: ["Products|Spirits|Whisky|Japanese & International Whiskey|Japanese & International Single Malt Whisky"]
        })
      ]
    }
  ], { retrievedAt: "2026-05-28T00:00:00.000Z" });

  assert.deepEqual(rows.map((row) => row.category), [
    "Bourbon",
    "Rye Whiskey",
    "Single Malt / World Whisky"
  ]);
  assert.equal(rows[0].proof, 107);
  assert.equal(rows[2].country, "Israel");
});

test("LCBO importer rejects flavored and adjacent false positives", () => {
  const rows = parseLcboCoveoPayloads([
    {
      results: [
        result({
          ec_skus: ["444"],
          permanentid: "444",
          ec_name: "Crown Royal Peach Whisky",
          ec_brand: "Crown Royal",
          lcbo_total_volume: 750,
          ec_category: ["Products|Spirits|Whisky|Canadian Whisky|Canadian Flavoured Whisky"]
        }),
        result({
          ec_skus: ["555"],
          permanentid: "555",
          ec_name: "Yokaichi Barley Mugi Honkaku Shochu",
          ec_brand: "Yokaichi",
          lcbo_total_volume: 750,
          ec_category: ["Products|Spirits|Whisky|Japanese & International Whiskey"]
        }),
        result({
          ec_skus: ["666"],
          permanentid: "666",
          ec_name: "Two Stacks Irish Whiskey Fruit Drops Dram In A Can",
          ec_brand: "Two Stacks",
          lcbo_selling_package_name: "can",
          lcbo_total_volume: 100,
          ec_category: ["Products|Spirits|Whisky|Irish Whiskey"]
        }),
        result({
          ec_skus: ["777"],
          permanentid: "777",
          ec_name: "The Macallan Double Cask 18 Year Old Whisky",
          ec_brand: "The Macallan",
          country_of_manufacture: "United Kingdom",
          lcbo_alcohol_percent: 43,
          lcbo_total_volume: 750,
          ec_price: 479.95,
          ec_category: ["Products|Spirits|Whisky|Scotch Whisky|Highland Single Malt Scotch Whisky"]
        })
      ]
    }
  ], { retrievedAt: "2026-05-28T00:00:00.000Z" });

  assert.deepEqual(rows.map((row) => row.name), ["The Macallan Double Cask 18 Year Old Whisky"]);
  assert.equal(rows[0].category, "Scotch Whisky");
});

test("LCBO payload keeps CAD price as source metadata, not app retail price", () => {
  const rows = parseLcboCoveoPayloads([
    {
      results: [
        result({
          ec_skus: ["888"],
          permanentid: "888",
          ec_name: "Found North Batch 010 Whisky",
          ec_brand: "Found North",
          country_of_manufacture: "Canada",
          lcbo_alcohol_percent: 65.1,
          lcbo_total_volume: 750,
          ec_price: 199.95,
          ec_final_price: 189.95,
          online_inventory: 12,
          upc_number: "123456789012",
          ec_category: ["Products|Spirits|Whisky|Canadian Whisky"]
        })
      ]
    }
  ], { retrievedAt: "2026-05-28T00:00:00.000Z" });
  const payload = buildImportPayload(rows, "2026-05-28T00:00:00.000Z", ["data/raw/lcbo/whisky-coveo-0.json"]);

  assert.equal(payload.rawRecordCount, 1);
  assert.equal(payload.bottles[0].prices.length, 0);
  assert.equal(payload.bottles[0].sourceRefs[0].priceCad, 199.95);
  assert.equal(payload.bottles[0].sourceRefs[0].finalPriceCad, 189.95);
  assert.equal(payload.bottles[0].barcodes[0], "123456789012");
});
