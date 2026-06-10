(function attachRatings(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.BarrelRatings = factory();
  }
})(typeof self !== "undefined" ? self : this, function createRatingsModule() {
  // A pour scored during a blind flight is logged with a "Blind" context by the
  // Night tab; anything else counts as sighted (label visible).
  function isBlindTasting(tasting) {
    return /blind/i.test(String(tasting && tasting.context || ""));
  }

  function round1(value) {
    return Math.round(value * 10) / 10;
  }

  function average(values) {
    if (!values.length) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  // Your rating record per bottle: sighted vs blind kept separate, plus the
  // delta between them (positive = you score it higher when you can SEE it —
  // the label tax; negative = it overperforms blind).
  function bottleRatings(state) {
    const byBottle = {};
    for (const tasting of (state && state.tastings) || []) {
      const id = tasting && tasting.bottleId;
      const score = Number(tasting && tasting.score);
      if (!id || !Number.isFinite(score)) continue;
      const row = byBottle[id] || (byBottle[id] = { sighted: [], blind: [] });
      (isBlindTasting(tasting) ? row.blind : row.sighted).push(score);
    }
    const out = {};
    for (const id of Object.keys(byBottle)) {
      const row = byBottle[id];
      const all = row.sighted.concat(row.blind);
      const sightedAvg = average(row.sighted);
      const blindAvg = average(row.blind);
      out[id] = {
        count: all.length,
        avg: round1(average(all)),
        sightedCount: row.sighted.length,
        sightedAvg: sightedAvg === null ? null : round1(sightedAvg),
        blindCount: row.blind.length,
        blindAvg: blindAvg === null ? null : round1(blindAvg),
        delta: sightedAvg !== null && blindAvg !== null ? round1(sightedAvg - blindAvg) : null
      };
    }
    return out;
  }

  // Bottles where your sighted and blind scores genuinely diverge.
  function blindGaps(ratings, minGap) {
    const threshold = Number.isFinite(minGap) ? minGap : 0.5;
    return Object.keys(ratings || {})
      .map((id) => ({ bottleId: id, ...ratings[id] }))
      .filter((row) => row.delta !== null && Math.abs(row.delta) >= threshold)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }

  // Style categories, evaluated against BarrelFamilies attributes (injected so
  // this module stays dependency-free and testable).
  const CATEGORIES = [
    { key: "all", label: "All" },
    { key: "bourbon", label: "Bourbon" },
    { key: "rye", label: "Rye" },
    { key: "bib", label: "Bottled in Bond" },
    { key: "cask", label: "Cask strength" },
    { key: "wheated", label: "Wheated" },
    { key: "single", label: "Single barrel" },
    { key: "finished", label: "Finished" }
  ];

  function matchesCategory(attrs, key) {
    const a = attrs || {};
    if (key === "all") return true;
    if (key === "bourbon") return a.whiskeyType === "Bourbon";
    if (key === "rye") return a.whiskeyType === "Rye whiskey" || a.isRye === true;
    if (key === "bib") return a.bottledInBond === true;
    if (key === "cask") return a.caskStrength === true;
    if (key === "wheated") return a.style === "Wheated bourbon" || a.isWheatWhiskey === true;
    if (key === "single") return a.singleBarrel === true;
    if (key === "finished") return a.finished === true;
    return false;
  }

  // Leaderboard for one category: your rated bottles of that style, best first.
  function categoryBoard(ratings, bottles, attrFn, key, limit) {
    const byId = new Map((bottles || []).map((bottle) => [bottle.id, bottle]));
    const rows = [];
    for (const id of Object.keys(ratings || {})) {
      const bottle = byId.get(id);
      if (!bottle) continue;
      if (!matchesCategory(attrFn ? attrFn(bottle) : {}, key)) continue;
      rows.push({ bottle, ...ratings[id] });
    }
    rows.sort((a, b) => (b.avg - a.avg) || (b.count - a.count) || String(a.bottle.name).localeCompare(String(b.bottle.name)));
    const summary = {
      count: rows.length,
      avg: rows.length ? round1(rows.reduce((sum, row) => sum + row.avg, 0) / rows.length) : null
    };
    return { rows: rows.slice(0, Number.isFinite(limit) ? limit : 12), summary };
  }

  return {
    CATEGORIES,
    average,
    blindGaps,
    bottleRatings,
    categoryBoard,
    isBlindTasting,
    matchesCategory
  };
});
