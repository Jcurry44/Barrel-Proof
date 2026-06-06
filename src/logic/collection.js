(function attachCollection(global) {
  // Fast, tap-don't-type collection model.
  //
  // - Curated batch lists for marquee batched lines (ECBP, Larceny BP, Stagg,
  //   Four Roses recipes, Booker's, BTAC) so you select REAL batches, no typing.
  // - Open-ended picks (single-barrel store picks) get tap-to-own + a count and
  //   an optional label.
  // - Everything else is one tap.
  //
  // Collection lives on state.collection[bottleId] = { count, batches[], note }.
  // statuses[bottleId] = "owned" is kept in sync so the shelf and recommender
  // (which read statuses) just work.

  function range(letterMonths, years) {
    const out = [];
    for (const y of years) for (const lm of letterMonths) out.push(lm + String(y).slice(-2));
    return out;
  }

  // Elijah Craig / Larceny BP use [release][month][year]: A=Jan(1), B=May(5), C=Sep(9).
  const ABC = ["A1", "B5", "C9"];
  const ECBP_YEARS = [2020, 2021, 2022, 2023, 2024, 2025];

  const BATCH_LINES = [
    {
      // "Elijah Craig Barrel ___" is always Barrel Proof — match the stem so
      // OCR variants ("Barrel PR", "Barrel Program") still collapse to one line.
      match: ["elijah craig barrel", "elijah craig bp", "elijah craig b p"],
      label: "Elijah Craig Barrel Proof",
      batches: range(ABC, ECBP_YEARS).concat(["Batch 1–17 (older)"])
    },
    {
      match: ["larceny barrel", "larceny bp", "larceny b p"],
      label: "Larceny Barrel Proof",
      batches: range(ABC, [2020, 2021, 2022, 2023, 2024, 2025])
    },
    {
      match: ["stagg jr", "stagg junior"],
      label: "Stagg Jr",
      batches: Array.from({ length: 23 }, (_, i) => "Batch " + (i + 1))
    },
    {
      match: ["four roses single barrel", "four roses private", "four roses store pick", "four roses obsv", "four roses recipe"],
      label: "Four Roses (recipe)",
      batches: ["OBSV", "OBSK", "OBSF", "OBSO", "OBSQ", "OESV", "OESK", "OESF", "OESO", "OESQ"]
    },
    {
      match: ["booker s", "bookers"],
      label: "Booker's",
      batches: ["2020", "2021", "2022", "2023", "2024", "2025"].flatMap((y) => ["01", "02", "03", "04"].map((n) => y + "-" + n))
    },
    {
      match: ["george t stagg", "gts"],
      label: "George T. Stagg",
      batches: ["2017", "2018", "2019", "2020", "2022", "2023", "2024"]
    },
    {
      match: ["william larue weller", "w l w", "wlw"],
      label: "William Larue Weller",
      batches: ["2017", "2018", "2019", "2020", "2021", "2022", "2023", "2024"]
    },
    {
      match: ["thomas h handy", "thomas handy"],
      label: "Thomas H. Handy",
      batches: ["2018", "2019", "2020", "2021", "2022", "2023", "2024"]
    },
    {
      match: ["eagle rare 17"],
      label: "Eagle Rare 17",
      batches: ["2018", "2019", "2020", "2021", "2022", "2023", "2024"]
    },
    {
      match: ["old forester birthday", "birthday bourbon"],
      label: "Old Forester Birthday Bourbon",
      batches: ["2015", "2016", "2017", "2018", "2019", "2020", "2021", "2022", "2023", "2024"]
    },
    {
      match: ["parker s heritage", "parkers heritage"],
      label: "Parker's Heritage Collection",
      batches: Array.from({ length: 18 }, (_, i) => "Edition " + (i + 1))
    }
  ];

  function norm(value) {
    return " " + String(value == null ? "" : value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() + " ";
  }

  // Which curated batch line (if any) a bottle belongs to.
  function batchLineFor(bottle) {
    const hay = norm(bottle && bottle.name);
    for (const line of BATCH_LINES) {
      if (line.match.some((m) => hay.indexOf(norm(m).trim()) !== -1)) return line;
    }
    return null;
  }

  // A normalized "line" key so the catalog's many spellings of one release
  // collapse to a single card in the wizard.
  function lineKey(bottle) {
    const line = batchLineFor(bottle);
    if (line) return "line:" + line.label.toLowerCase();
    let n = String((bottle && bottle.name) || "").toLowerCase();
    n = n
      .replace(/\([^)]*\)/g, " ")                              // parentheticals
      .replace(/\b\d+(\.\d+)?\s*(ml|l|liter|litre)\b/g, " ")   // bottle sizes (keep ages)
      .replace(/\b(19|20)\d{2}\b/g, " ")                       // years
      .replace(/\bbatch\s*[a-z]?\d+\b/g, " ")                  // batch codes
      .replace(/\b[a-z]\d{2,3}\b/g, " ")                       // A123-style codes
      .replace(/\b(kentucky|tennessee|straight|bourbon|whiskey|whisky|spirit)\b/g, " ")
      .replace(/\b(store|private|single barrel|barrel|pick|selection|select|hand picked|handpicked|btb|psb)\b/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    return n || String((bottle && bottle.id) || "");
  }

  // Is this an open-ended store-pick line (no finite batch list)?
  function isOpenPick(bottle) {
    if (batchLineFor(bottle)) return false;
    const n = norm(bottle && bottle.name);
    return /\bsingle barrel\b|\bstore pick\b|\bprivate\b|\bselection\b|\bhand picked\b|\bbtb\b|\bbarrel select\b/.test(n);
  }

  function lineType(bottle) {
    if (batchLineFor(bottle)) return "batched";
    if (isOpenPick(bottle)) return "pick";
    return "standard";
  }

  // Collapse a list of bottles into one card per release line.
  function collapse(bottles) {
    const map = new Map();
    for (const bottle of bottles) {
      const key = lineKey(bottle);
      let group = map.get(key);
      if (!group) {
        group = { key, rep: bottle, members: [], type: lineType(bottle), line: batchLineFor(bottle) };
        map.set(key, group);
      }
      group.members.push(bottle);
      // Prefer a representative with curated metadata / shorter name.
      if (String(bottle.name).length < String(group.rep.name).length) group.rep = bottle;
    }
    return [...map.values()];
  }

  // ---- Model mutators (operate on state.collection, sync statuses) ---------

  function ensure(state) {
    if (!state.collection || typeof state.collection !== "object") state.collection = {};
    if (!state.statuses || typeof state.statuses !== "object") state.statuses = {};
    return state.collection;
  }

  function entry(state, bottleId) {
    const col = ensure(state);
    return col[bottleId] || null;
  }

  function ownedCount(state, bottleId) {
    const e = entry(state, bottleId);
    return e ? e.count : 0;
  }

  function setCount(state, bottleId, count) {
    const col = ensure(state);
    const c = Math.max(0, Math.round(count));
    if (c <= 0) {
      delete col[bottleId];
      if (state.statuses[bottleId] === "owned") delete state.statuses[bottleId];
      return;
    }
    const prev = col[bottleId] || { count: 0, batches: [], note: "" };
    col[bottleId] = { count: c, batches: prev.batches || [], note: prev.note || "" };
    state.statuses[bottleId] = "owned";
  }

  function toggle(state, bottleId) {
    if (ownedCount(state, bottleId) > 0) setCount(state, bottleId, 0);
    else setCount(state, bottleId, 1);
    return ownedCount(state, bottleId) > 0;
  }

  function setBatches(state, bottleId, batches) {
    const col = ensure(state);
    const clean = Array.from(new Set((batches || []).filter(Boolean)));
    if (!clean.length) {
      if (col[bottleId]) {
        col[bottleId].batches = [];
        if (col[bottleId].count <= 0) setCount(state, bottleId, 0);
      }
      return;
    }
    const prev = col[bottleId] || { count: 0, batches: [], note: "" };
    col[bottleId] = { count: Math.max(prev.count, clean.length), batches: clean, note: prev.note || "" };
    state.statuses[bottleId] = "owned";
  }

  function toggleBatch(state, bottleId, batch) {
    const e = entry(state, bottleId);
    const set = new Set((e && e.batches) || []);
    if (set.has(batch)) set.delete(batch);
    else set.add(batch);
    setBatches(state, bottleId, [...set]);
    return set.has(batch);
  }

  function totals(state) {
    const col = ensure(state);
    let lines = 0;
    let bottles = 0;
    for (const id in col) {
      lines += 1;
      bottles += col[id].count || 0;
    }
    return { lines, bottles };
  }

  global.BarrelCollection = {
    BATCH_LINES,
    batchLineFor,
    lineKey,
    isOpenPick,
    lineType,
    collapse,
    ownedCount,
    entry,
    setCount,
    toggle,
    setBatches,
    toggleBatch,
    totals
  };
})(typeof window !== "undefined" ? window : globalThis);
