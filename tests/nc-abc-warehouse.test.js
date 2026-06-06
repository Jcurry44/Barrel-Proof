const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildImportPayload,
  parseNcAbcWarehouseStockHtml
} = require("../tools/import-nc-abc-warehouse.js");

function stockRow({ itemId, code, name, listingType = "Listed", available = "12", size = ".75L", pallet = "100", supplier = "Test Supplier", allotment = "24", broker = "Test Broker" }) {
  return `
<tr class="active list-generic" onclick="window.location = '/Pricing/ViewItemDetails/${itemId}'" item_id="${itemId}">
  <td>${code}</td>
  <td title="${name}">${name}</td>
  <td>${listingType}</td>
  <td>${available}</td>
  <td>${size}</td>
  <td>${pallet}</td>
  <td title="${supplier}">${supplier}</td>
  <td>${allotment}</td>
  <td>${broker}</td>
</tr>`;
}

test("NC ABC warehouse importer keeps serious whiskey and hydrates price-list details", () => {
  const html = `
<h4>Stock Report Date <span style="color:green;">5/28/2026</span></h4>
${stockRow({ itemId: "170167", code: "00028", name: "Garrison Brothers Small Batch Bourbon", supplier: "Garrison Brothers Distillery", available: "31" })}
${stockRow({ itemId: "166704", code: "00204", name: "The Macallan Double Cask 18Y", supplier: "Edrington Americas" })}
${stockRow({ itemId: "160303", code: "18134", name: "High West Barrel Select Rum (BTB)", supplier: "Constellation Brands" })}
${stockRow({ itemId: "171000", code: "17100", name: "El Mayor Extra Anejo Bourbon Finished", supplier: "Luxco" })}
`;
  const rows = parseNcAbcWarehouseStockHtml(html, {
    retrievedAt: "2026-05-28T00:00:00.000Z",
    priceRows: [
      {
        ncCode: "00-028",
        name: "Garrison Brothers Small Batch Bo...",
        supplier: "Garrison Brothers Distillery",
        producer: "Garrison Brothers Distillery",
        rawCategory: "Boutique Collection - Bourbon",
        category: "Bourbon",
        ageRaw: "004Y",
        age: "4 years",
        ageYears: 4,
        proof: 94,
        size: ".75L"
      },
      {
        ncCode: "00-204",
        name: "The Macallan Double Cask 18Y",
        supplier: "Edrington Americas",
        producer: "Edrington Americas",
        rawCategory: "Boutique Collection - Scotch",
        category: "Scotch Whisky",
        ageRaw: "018Y",
        age: "18 years",
        ageYears: 18,
        proof: 86,
        size: ".75L"
      },
      {
        ncCode: "17-100",
        name: "El Mayor Extra Anejo Bourbon Finished",
        supplier: "Luxco",
        producer: "Luxco",
        rawCategory: "Tequila",
        category: "Tequila",
        size: ".75L"
      }
    ]
  });

  assert.deepEqual(rows.map((row) => row.name), [
    "Garrison Brothers Small Batch Bourbon",
    "The Macallan Double Cask 18Y"
  ]);
  assert.equal(rows[0].category, "Bourbon");
  assert.equal(rows[0].proof, 94);
  assert.equal(rows[0].totalAvailable, 31);
  assert.equal(rows[0].reportDate, "5/28/2026");
  assert.equal(rows[1].category, "Scotch Whisky");
});

test("NC ABC warehouse payload is source-backed inventory data without retail price", () => {
  const rows = parseNcAbcWarehouseStockHtml(stockRow({
    itemId: "170789",
    code: "00124",
    name: "WhistlePig 15Y",
    supplier: "WhistlePig",
    available: "186"
  }), {
    retrievedAt: "2026-05-28T00:00:00.000Z",
    priceRows: [
      {
        ncCode: "00-124",
        name: "WhistlePig 15Y",
        supplier: "WhistlePig",
        producer: "WhistlePig",
        rawCategory: "Boutique Collection - Whiskey",
        category: "Rye Whiskey",
        ageRaw: "015Y",
        age: "15 years",
        ageYears: 15,
        proof: 92,
        size: ".75L"
      }
    ]
  });
  const payload = buildImportPayload(rows, "2026-05-28T00:00:00.000Z", ["data/raw/nc-abc/warehouse-stock-current.html"]);

  assert.equal(payload.rawRecordCount, 1);
  assert.equal(payload.bottleCount, 1);
  assert.equal(payload.bottles[0].prices.length, 0);
  assert.equal(payload.bottles[0].sourceRefs[0].sourceId, "nc_abc_warehouse_stock");
  assert.equal(payload.bottles[0].sourceRefs[0].fields.includes("totalAvailable"), true);
});
