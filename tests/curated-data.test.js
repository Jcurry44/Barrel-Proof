const test = require("node:test");
const assert = require("node:assert/strict");
require("../src/data/curated.js");

test("curated bottle overlay is source-backed and points aliases at real records", () => {
  const data = globalThis.BarrelCuratedData;
  const bottlesById = data.bottlesById || {};

  assert.equal(data.schemaVersion, 1);
  assert.ok(Object.keys(bottlesById).length >= 25);

  for (const [aliasId, canonicalId] of Object.entries(data.bottleAliases || {})) {
    assert.ok(aliasId);
    assert.ok(bottlesById[canonicalId], aliasId + " points at missing curated record " + canonicalId);
  }

  for (const [bottleId, bottle] of Object.entries(bottlesById)) {
    assert.ok(bottleId);
    assert.ok(bottle.displayName);
    assert.ok(bottle.distillery || bottle.producer);
    assert.ok(Array.isArray(bottle.sources), bottleId + " is missing sources");
    assert.ok(bottle.sources.length >= 1, bottleId + " needs at least one source");
    for (const source of bottle.sources) {
      assert.ok(source.sourceName);
      const url = new URL(source.url);
      assert.equal(url.protocol, "https:");
    }
  }
});

test("priority allocated and limited bottles have curated decision overlays", () => {
  const data = globalThis.BarrelCuratedData;
  const bottlesById = data.bottlesById || {};
  const priorityIds = [
    "george-t-stagg",
    "william-larue-weller-2025",
    "eagle-rare-17-2025",
    "weller-full-proof",
    "weller-12-year",
    "russells-reserve-15-year",
    "four-roses-limited-edition-2025",
    "old-fitzgerald-bib-11-year",
    "jack-daniels-14-year",
    "michters-10-year-bourbon",
    "parkers-heritage-19th-edition",
    "heaven-hill-heritage-19-year-wheat"
  ];

  for (const id of priorityIds) {
    const bottle = bottlesById[id];
    assert.ok(bottle, id + " needs a curated overlay");
    assert.ok(Number.isFinite(bottle.msrp), id + " needs MSRP or SRP");
    assert.ok(Number.isFinite(bottle.hypeIndex), id + " needs hype index");
    assert.ok(Array.isArray(bottle.reviewIds), id + " needs review mapping");
    assert.ok(bottle.reviewIds.length >= 1, id + " needs at least one review id");
    assert.ok(bottle.story.length >= 80, id + " needs store-mode story context");
  }

  assert.equal(data.bottleAliases["imported-george-t-stagg-kentucky-straight-bourbon-750ml-151-018416-75"], "george-t-stagg");
  assert.equal(data.bottleAliases["pa-lcb-w-l-weller-full-proof-straight-bourbon-750ml-000082079"], "weller-full-proof");
});
