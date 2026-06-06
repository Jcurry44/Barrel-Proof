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

  // How to read Buffalo Trace's laser bottling-date code (shared by BTAC, EHT, etc.).
  const BT_LASER_CODE = "Buffalo Trace laser-etches a date code low on the glass (often on the back below the label — shine a light through to read it). Modern format e.g. “L 18 096 01 1050 K”: L = lot, 18 = year bottled (2018), 096 = day of year (≈96th day, early Apr), then plant / time / line. 2007–11 bottles read “K 259 10 15:47” = day 259, year 2010. The 2-digit year is your bottling year.";

  // Real batch data — proofs/years researched from community batch guides
  // (Breaking Bourbon, bourbinsane, et al.), since producers publish no master
  // list. Proofs can vary ~0.1 between sources. A batch is a string or
  // { label, proof, year }. `howToId` tells the user how to identify their bottle.
  const BATCH_LINES = [
    {
      match: ["elijah craig barrel", "elijah craig bp", "elijah craig b p"],
      label: "Elijah Craig Barrel Proof",
      howToId: "Read the batch code on the front label: letter = release of the year (A = Jan, B = May, C = Sept), then the month, then the year — e.g. C923 = 3rd release, Sept 2023. The proof is on the label too.",
      batches: [
        { label: "A120", year: 2020, proof: 136.6 }, { label: "B520", year: 2020, proof: 127.2 }, { label: "C920", year: 2020, proof: 132.8 },
        { label: "A121", year: 2021, proof: 123.6 }, { label: "B521", year: 2021, proof: 118.2 }, { label: "C921", year: 2021, proof: 120.2 },
        { label: "A122", year: 2022, proof: 120.8 }, { label: "B522", year: 2022, proof: 121.0 }, { label: "C922", year: 2022, proof: 124.8 },
        { label: "A123", year: 2023, proof: 125.6 }, { label: "B523", year: 2023, proof: 124.2 }, { label: "C923", year: 2023, proof: 125.2 },
        { label: "A124", year: 2024, proof: 119.0 }, { label: "B524", year: 2024, proof: 130.6 }, { label: "C924", year: 2024, proof: 129.0 },
        { label: "A125", year: 2025, proof: 118.2 }, { label: "B525", year: 2025, proof: 126.2 }, { label: "C925", year: 2025, proof: 129.0 },
        { label: "Batch 1–17 (pre-2020)" }
      ]
    },
    {
      match: ["larceny barrel", "larceny bp", "larceny b p"],
      label: "Larceny Barrel Proof",
      howToId: "Same code as ECBP on the front label: letter = release of the year (A = Jan, B = May, C = Sept), then month, then year — e.g. A120 = 1st release, Jan 2020.",
      batches: [
        { label: "A120", year: 2020, proof: 123.2 }, { label: "B520", year: 2020, proof: 122.2 }, { label: "C920", year: 2020, proof: 122.4 },
        { label: "A121", year: 2021, proof: 114.8 }, { label: "B521", year: 2021, proof: 121.0 }, { label: "C921", year: 2021, proof: 122.6 },
        { label: "A122", year: 2022, proof: 124.4 }, { label: "B522", year: 2022, proof: 123.8 }, { label: "C922", year: 2022, proof: 126.6 },
        { label: "A123", year: 2023, proof: 125.8 }, { label: "B523", year: 2023, proof: 124.4 }, { label: "C923", year: 2023, proof: 126.4 },
        { label: "A124", year: 2024, proof: 124.2 }, { label: "B524", year: 2024, proof: 125.4 }, { label: "C924", year: 2024, proof: 125.1 },
        { label: "A125", year: 2025, proof: 125.0 }, { label: "B525", year: 2025, proof: 117.4 }, { label: "C925", year: 2025, proof: 119.6 }
      ]
    },
    {
      // Matches "Stagg Jr" and the post-2022 rebrand to plain "Stagg", but NOT the
      // allocated "George T. Stagg" (handled by its own line below).
      match: ["stagg jr", "stagg junior", "stagg"],
      exclude: ["george t stagg", "george t. stagg", "gts"],
      label: "Stagg (Jr.)",
      howToId: "Older bottles read “Stagg Jr.” (Batches 1–17); from 2022 it's just “Stagg” with a year code (e.g. 23A). Match the label proof to the batch above.",
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
      howToId: "The 4-letter recipe code (e.g. OBSV) is the key: 2nd letter = mashbill (B = 35% rye, E = 20% rye), 4th letter = yeast. It's printed on single-barrel / store-pick labels.",
      batches: ["OBSV", "OBSK", "OBSF", "OBSO", "OBSQ", "OESV", "OESK", "OESF", "OESO", "OESQ"]
    },
    {
      match: ["booker s", "bookers"],
      label: "Booker's",
      howToId: "The batch code (e.g. 2024-01) and its name are on the front label, with the exact proof and the age statement (years-months-days) just below.",
      batches: [
        { label: "2018-01 Kathleen's", year: 2018, proof: 127.4 },
        { label: "2018-02 Backyard BBQ", year: 2018, proof: 128.8 },
        { label: "2018-03 Kentucky Chew", year: 2018, proof: 126.7 },
        { label: "2018-04 Kitchen Table", year: 2018, proof: 128.0 },
        { label: "2019-01 Teresa's", year: 2019, proof: 125.9 },
        { label: "2019-02 Shiny Barrel", year: 2019, proof: 124.0 },
        { label: "2019-03 Country Ham", year: 2019, proof: 124.7 },
        { label: "2019-04 Beaten Biscuits", year: 2019, proof: 126.1 },
        { label: "2020-01 Granny's", year: 2020, proof: 126.4 },
        { label: "2020-02 Boston", year: 2020, proof: 126.5 },
        { label: "2020-03 Pigskin", year: 2020, proof: 127.3 },
        { label: "2021-01 Donohoe's", year: 2021, proof: 125.3 },
        { label: "2021-02 Tagalong", year: 2021, proof: 127.9 },
        { label: "2021-03 Bardstown", year: 2021, proof: 125.5 },
        { label: "2021-04 Noe Strangers", year: 2021, proof: 124.4 },
        { label: "2022-01 Ronnie's", year: 2022, proof: 124.3 },
        { label: "2022-02 The Lumberyard", year: 2022, proof: 124.8 },
        { label: "2022-03 Kentucky Tea", year: 2022, proof: 126.5 },
        { label: "2022-04 Pinkie's", year: 2022, proof: 122.4 },
        { label: "2023-01 Charlie's", year: 2023, proof: 126.6 },
        { label: "2023-02 Apprentice", year: 2023, proof: 125.5 },
        { label: "2023-03 Mighty Fine", year: 2023, proof: 126.6 },
        { label: "2023-04 The Storyteller", year: 2023, proof: 127.8 },
        { label: "2024-01 Springfield", year: 2024, proof: 124.5 },
        { label: "2024-02 The Beam House", year: 2024, proof: 124.6 },
        { label: "2024-03 Master Distiller's", year: 2024, proof: 130.3 },
        { label: "2024-04 Jimmy's", year: 2024, proof: 125.8 },
        { label: "2025-01 Barry's", year: 2025, proof: 125.7 },
        { label: "2025-02 By The Pond", year: 2025, proof: 125.8 },
        { label: "2025-03 Jerry's", year: 2025, proof: 124.7 },
        { label: "2025-04 Phantom Pipes", year: 2025, proof: 126.4 }
      ]
    },
    {
      match: ["george t stagg", "gts"],
      label: "George T. Stagg",
      howToId: "BTAC labels don't print the year on the front — match the unique annual proof above. To confirm, read the laser code on the glass. " + BT_LASER_CODE,
      // Not released in 2021 (no batch met the profile). 2005 had multiple lots.
      batches: [
        { label: "2002", year: 2002, proof: 137.6 }, { label: "2003", year: 2003, proof: 142.7 },
        { label: "2004", year: 2004, proof: 129.0 }, { label: "2005", year: 2005, proof: 141.2 },
        { label: "2006", year: 2006, proof: 140.6 }, { label: "2007", year: 2007, proof: 144.8 },
        { label: "2008", year: 2008, proof: 141.8 }, { label: "2009", year: 2009, proof: 141.4 },
        { label: "2010", year: 2010, proof: 143.0 }, { label: "2011", year: 2011, proof: 142.6 },
        { label: "2012", year: 2012, proof: 142.8 }, { label: "2013", year: 2013, proof: 128.2 },
        { label: "2014", year: 2014, proof: 138.1 }, { label: "2015", year: 2015, proof: 138.2 },
        { label: "2016", year: 2016, proof: 144.1 }, { label: "2017", year: 2017, proof: 129.2 },
        { label: "2018", year: 2018, proof: 124.9 }, { label: "2019", year: 2019, proof: 116.9 },
        { label: "2020", year: 2020, proof: 130.4 }, { label: "2022", year: 2022, proof: 138.7 },
        { label: "2023", year: 2023, proof: 135.0 }, { label: "2024", year: 2024, proof: 136.1 },
        { label: "2025", year: 2025, proof: 142.8 }
      ]
    },
    {
      match: ["william larue weller", "w l w", "wlw"],
      label: "William Larue Weller",
      howToId: "The year isn't on the front — match the annual proof above, or read the glass laser code. " + BT_LASER_CODE,
      batches: [
        { label: "2005", year: 2005, proof: 121.9 }, { label: "2006", year: 2006, proof: 129.9 },
        { label: "2007", year: 2007, proof: 117.9 }, { label: "2008", year: 2008, proof: 125.3 },
        { label: "2009", year: 2009, proof: 134.8 }, { label: "2010", year: 2010, proof: 126.6 },
        { label: "2011", year: 2011, proof: 133.5 }, { label: "2012", year: 2012, proof: 123.4 },
        { label: "2013", year: 2013, proof: 136.2 }, { label: "2014", year: 2014, proof: 140.2 },
        { label: "2015", year: 2015, proof: 134.6 }, { label: "2016", year: 2016, proof: 135.4 },
        { label: "2017", year: 2017, proof: 128.2 }, { label: "2018", year: 2018, proof: 125.7 },
        { label: "2019", year: 2019, proof: 128.0 }, { label: "2020", year: 2020, proof: 134.5 },
        { label: "2021", year: 2021, proof: 125.3 }, { label: "2022", year: 2022, proof: 124.7 },
        { label: "2023", year: 2023, proof: 133.6 }, { label: "2024", year: 2024, proof: 125.8 },
        { label: "2025", year: 2025, proof: 129.0 }
      ]
    },
    {
      match: ["thomas h handy", "thomas handy"],
      label: "Thomas H. Handy",
      howToId: "Handy's proof is fairly steady year to year, so the glass laser code is the surest way to date it. " + BT_LASER_CODE,
      batches: [
        { label: "2006", year: 2006, proof: 132.7 }, { label: "2007", year: 2007, proof: 134.8 },
        { label: "2008", year: 2008, proof: 127.5 }, { label: "2009", year: 2009, proof: 129.0 },
        { label: "2010", year: 2010, proof: 126.9 }, { label: "2011", year: 2011, proof: 128.6 },
        { label: "2012", year: 2012, proof: 132.4 }, { label: "2013", year: 2013, proof: 128.4 },
        { label: "2014", year: 2014, proof: 129.2 }, { label: "2015", year: 2015, proof: 126.9 },
        { label: "2016", year: 2016, proof: 126.2 }, { label: "2017", year: 2017, proof: 127.2 },
        { label: "2018", year: 2018, proof: 128.8 }, { label: "2019", year: 2019, proof: 125.7 },
        { label: "2020", year: 2020, proof: 129.0 }, { label: "2021", year: 2021, proof: 129.5 },
        { label: "2022", year: 2022, proof: 130.9 }, { label: "2023", year: 2023, proof: 124.9 },
        { label: "2024", year: 2024, proof: 127.2 }, { label: "2025", year: 2025, proof: 129.8 }
      ]
    },
    {
      match: ["eagle rare 17"],
      label: "Eagle Rare 17",
      howToId: "Proof tells the era only: 90 = 2005–2017, 101 = 2018 on. To pin the exact year, read the glass laser code. " + BT_LASER_CODE,
      batches: [
        { label: "2005", year: 2005, proof: 90 }, { label: "2006", year: 2006, proof: 90 },
        { label: "2007", year: 2007, proof: 90 }, { label: "2008", year: 2008, proof: 90 },
        { label: "2009", year: 2009, proof: 90 }, { label: "2010", year: 2010, proof: 90 },
        { label: "2011", year: 2011, proof: 90 }, { label: "2012", year: 2012, proof: 90 },
        { label: "2013", year: 2013, proof: 90 }, { label: "2014", year: 2014, proof: 90 },
        { label: "2015", year: 2015, proof: 90 }, { label: "2016", year: 2016, proof: 90 },
        { label: "2017", year: 2017, proof: 90 }, { label: "2018", year: 2018, proof: 101 },
        { label: "2019", year: 2019, proof: 101 }, { label: "2020", year: 2020, proof: 101 },
        { label: "2021", year: 2021, proof: 101 }, { label: "2022", year: 2022, proof: 101 },
        { label: "2023", year: 2023, proof: 101 }, { label: "2024", year: 2024, proof: 101 },
        { label: "2025", year: 2025, proof: 101 }
      ]
    },
    {
      // Bottles are usually named "Colonel E.H. Taylor, Jr. Barrel Proof" — the
      // "Jr." sits mid-name, so match both with and without it.
      match: ["taylor barrel proof", "taylor jr barrel proof", "e h taylor barrel proof", "e h taylor jr barrel proof", "eht barrel proof"],
      label: "E.H. Taylor Barrel Proof",
      howToId: "Proofs repeat across years, so decode the bottling date from the glass. " + BT_LASER_CODE + " EHT Barrel Proof is bottled once a year, so the code's year = your batch.",
      batches: [
        { label: "Batch 1", year: 2012, proof: 134.5 },
        { label: "Batch 2", year: 2013, proof: 135.4 },
        { label: "Batch 3", year: 2014, proof: 129.0 },
        { label: "Batch 4", year: 2015, proof: 127.2 },
        { label: "Batch 5", year: 2016, proof: 127.5 },
        { label: "Batch 6", year: 2017, proof: 128.1 },
        { label: "Batch 7", year: 2018, proof: 129.7 },
        { label: "Batch 8", year: 2019, proof: 129.3 },
        { label: "Batch 9", year: 2020, proof: 130.3 },
        { label: "Batch 10", year: 2021, proof: 127.3 },
        { label: "Batch 11", year: 2022, proof: 129.0 },
        { label: "Batch 12", year: 2023, proof: 131.1 },
        { label: "Batch 13", year: 2024, proof: 127.3 },
        { label: "Batch 14", year: 2025, proof: 127.3 }
      ]
    },
    {
      match: ["straight from the barrel"],
      label: "Blanton's Straight From The Barrel",
      perBarrel: true,
      howToId: "Every bottle is a unique single barrel — no batch number. Read the hand-written label: dump date (first line, M-D-YY), Barrel No., Warehouse (always H), Rick No., Bottle No., and the exact barrel proof (~125–140). Log the dump date + barrel # + proof to make yours unique."
    },
    {
      match: ["old forester birthday", "birthday bourbon"],
      label: "Old Forester Birthday Bourbon",
      howToId: "The release year is printed on the front label.",
      batches: ["2015", "2016", "2017", "2018", "2019", "2020", "2021", "2022", "2023", "2024", "2025"]
    },
    {
      match: ["parker s heritage", "parkers heritage"],
      label: "Parker's Heritage Collection",
      howToId: "The edition number and theme are on the front label; each annual edition is a different whiskey.",
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
