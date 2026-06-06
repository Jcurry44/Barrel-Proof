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
      // Matches "Stagg Jr" and the post-2022 rebrand to plain "Stagg", but NOT the
      // allocated "George T. Stagg" (handled by its own line below).
      match: ["stagg jr", "stagg junior", "stagg"],
      exclude: ["george t stagg", "george t. stagg", "gts"],
      label: "Stagg (Jr.)",
      // Real batches with bottling proof + release year. Source: community batch
      // guides (Buffalo Trace doesn't publish a master list); proofs are widely
      // cross-referenced and may vary ±0.1 between sources.
      batches: [
        { label: "Batch 1", year: 2013, proof: 134.4 },
        { label: "Batch 2", year: 2014, proof: 128.7 },
        { label: "Batch 3", year: 2014, proof: 132.1 },
        { label: "Batch 4", year: 2015, proof: 132.2 },
        { label: "Batch 5", year: 2015, proof: 129.7 },
        { label: "Batch 6", year: 2016, proof: 132.5 },
        { label: "Batch 7", year: 2016, proof: 130.0 },
        { label: "Batch 8", year: 2017, proof: 129.5 },
        { label: "Batch 9", year: 2017, proof: 131.9 },
        { label: "Batch 10", year: 2018, proof: 126.4 },
        { label: "Batch 11", year: 2018, proof: 127.9 },
        { label: "Batch 12", year: 2019, proof: 132.3 },
        { label: "Batch 13", year: 2019, proof: 128.4 },
        { label: "Batch 14", year: 2020, proof: 130.2 },
        { label: "Batch 15", year: 2020, proof: 131.1 },
        { label: "Batch 16", year: 2021, proof: 130.9 },
        { label: "Batch 17", year: 2021, proof: 128.7 },
        { label: "Batch 18", year: 2022, proof: 131.0 },
        { label: "Batch 19", year: 2022, proof: 130.0 },
        { label: "Batch 20", year: 2023, proof: 132.2 },
        { label: "Batch 21", year: 2023, proof: 130.2 },
        { label: "Batch 22", year: 2023, proof: 127.8 },
        { label: "Batch 23", year: 2023, proof: 125.9 },
        { label: "Batch 24", year: 2024, proof: 127.6 },
        { label: "Batch 25", year: 2024, proof: 127.8 },
        { label: "Batch 26", year: 2024, proof: 128.9 },
        { label: "Batch 27", year: 2025, proof: 126.5 }
      ]
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
      // GTS was not released in 2021 (barrels didn't meet profile).
      batches: ["2017", "2018", "2019", "2020", "2022", "2023", "2024", "2025"]
    },
    {
      match: ["william larue weller", "w l w", "wlw"],
      label: "William Larue Weller",
      batches: ["2017", "2018", "2019", "2020", "2021", "2022", "2023", "2024", "2025"]
    },
    {
      match: ["thomas h handy", "thomas handy"],
      label: "Thomas H. Handy",
      batches: ["2018", "2019", "2020", "2021", "2022", "2023", "2024", "2025"]
    },
    {
      match: ["eagle rare 17"],
      label: "Eagle Rare 17",
      batches: ["2018", "2019", "2020", "2021", "2022", "2023", "2024", "2025"]
    },
    {
      match: ["old forester birthday", "birthday bourbon"],
      label: "Old Forester Birthday Bourbon",
      batches: ["2015", "2016", "2017", "2018", "2019", "2020", "2021", "2022", "2023", "2024", "2025"]
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
      if (line.exclude && line.exclude.some((m) => hay.indexOf(norm(m).trim()) !== -1)) continue;
      if (line.match.some((m) => hay.indexOf(norm(m).trim()) !== -1)) return line;
    }
    return null;
  }

  // A batch entry is either a plain string ("2024") or { label, proof, year }.
  function batchLabel(batch) {
    return batch && typeof batch === "object" ? batch.label : batch;
  }
  function batchProof(batch) {
    return batch && typeof batch === "object" && Number.isFinite(batch.proof) ? batch.proof : null;
  }
  function batchYear(batch) {
    return batch && typeof batch === "object" && batch.year ? batch.year : null;
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
    batchLabel,
    batchProof,
    batchYear,
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
