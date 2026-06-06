(function attachNight(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.BarrelNight = factory();
  }
})(typeof self !== "undefined" ? self : this, function createNightModule() {
  function average(values) {
    const clean = values.filter((value) => Number.isFinite(value));
    if (!clean.length) return null;
    return clean.reduce((sum, value) => sum + value, 0) / clean.length;
  }

  function round1(value) {
    return Math.round(value * 10) / 10;
  }

  function numOrNull(value) {
    return Number.isFinite(Number(value)) ? Number(value) : null;
  }

  function clampScore(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === "string" && value.trim() === "") return null;
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.min(10, n));
  }

  // Glass labels A, B, C ... so tasters score by glass, never by bottle name.
  function glassLetters(count) {
    const out = [];
    for (let i = 0; i < count; i += 1) out.push(String.fromCharCode(65 + (i % 26)));
    return out;
  }

  function uniqueNames(names) {
    const seen = new Set();
    const out = [];
    for (const raw of names || []) {
      const name = String(raw || "").trim().slice(0, 40);
      const key = name.toLowerCase();
      if (!name || seen.has(key)) continue;
      seen.add(key);
      out.push(name);
    }
    return out;
  }

  function defaultShuffle(list) {
    const arr = list.slice();
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  // Turn a chosen set of bottles + tasters into a blind flight: each bottle is
  // assigned to a shuffled glass letter so the pour order hides identity.
  function createFlight(bottles, tasters, options) {
    const opts = options || {};
    const shuffle = typeof opts.shuffle === "function" ? opts.shuffle : defaultShuffle;
    const clean = (bottles || []).filter((bottle) => bottle && bottle.id);
    const shuffled = shuffle(clean);
    const letters = glassLetters(shuffled.length);
    return {
      id: opts.id || "flight",
      createdAt: opts.createdAt || "",
      status: "scoring",
      pours: shuffled.map((bottle, index) => ({
        glass: letters[index],
        bottleId: bottle.id,
        bottleName: bottle.name
      })),
      tasters: uniqueNames(tasters),
      scores: {}
    };
  }

  function setScore(flight, glass, taster, score) {
    if (!flight) return flight;
    if (!flight.scores || typeof flight.scores !== "object") flight.scores = {};
    if (!flight.scores[glass] || typeof flight.scores[glass] !== "object") flight.scores[glass] = {};
    const value = clampScore(score);
    if (value === null) delete flight.scores[glass][taster];
    else flight.scores[glass][taster] = value;
    return flight;
  }

  function scoredCount(flight) {
    let count = 0;
    const scores = (flight && flight.scores) || {};
    for (const glass of Object.keys(scores)) count += Object.keys(scores[glass]).length;
    return count;
  }

  function expectedScores(flight) {
    const pours = (flight && flight.pours) || [];
    const tasters = (flight && flight.tasters) || [];
    return pours.length * Math.max(1, tasters.length);
  }

  function canReveal(flight) {
    return Boolean(flight) && (flight.pours || []).length >= 2 && scoredCount(flight) > 0;
  }

  // Score one glass across all tasters.
  function glassAverage(flight, glass) {
    const row = ((flight && flight.scores) || {})[glass] || {};
    return numOrNull(round1(average(Object.values(row)) || NaN));
  }

  // Reveal: map glasses back to bottles, rank by the room's average, and surface a
  // headline (value win, hype upset, etc). `lookup(bottleId)` supplies price/hype.
  function flightResults(flight, lookup) {
    const rows = ((flight && flight.pours) || []).map((pour) => {
      const row = ((flight.scores || {})[pour.glass]) || {};
      const scores = Object.keys(row)
        .map((taster) => ({ taster, score: row[taster] }))
        .filter((entry) => Number.isFinite(entry.score))
        .sort((a, b) => b.score - a.score);
      const avg = scores.length ? round1(average(scores.map((s) => s.score))) : null;
      const info = (lookup && lookup(pour.bottleId)) || {};
      return {
        glass: pour.glass,
        bottleId: pour.bottleId,
        bottleName: pour.bottleName,
        scores,
        average: avg,
        refPrice: numOrNull(info.refPrice),
        hype: numOrNull(info.hype)
      };
    });
    const ranked = rows.filter((r) => r.average !== null).sort((a, b) => b.average - a.average);
    const unscored = rows.filter((r) => r.average === null);
    return {
      ranked,
      unscored,
      headline: buildHeadline(ranked),
      tasters: (flight && flight.tasters) || []
    };
  }

  function buildHeadline(ranked) {
    if (ranked.length < 2) return ranked.length ? ranked[0].bottleName + " stood alone." : "";
    const winner = ranked[0];
    const last = ranked[ranked.length - 1];

    const priced = ranked.filter((r) => Number.isFinite(r.refPrice));
    if (priced.length >= 2) {
      const cheapest = priced.reduce((a, b) => (b.refPrice < a.refPrice ? b : a));
      const dearest = priced.reduce((a, b) => (b.refPrice > a.refPrice ? b : a));
      if (cheapest.bottleId === winner.bottleId && cheapest.refPrice < dearest.refPrice) {
        return "Value win — the cheapest pour in the flight took first place blind.";
      }
      if (dearest.bottleId === last.bottleId && dearest.refPrice > cheapest.refPrice) {
        return "Upset — the priciest pour finished last blind.";
      }
    }

    const hyped = ranked.filter((r) => Number.isFinite(r.hype));
    if (hyped.length >= 2) {
      const mostHyped = hyped.reduce((a, b) => (b.hype > a.hype ? b : a));
      if (mostHyped.bottleId === last.bottleId && mostHyped.hype >= 80) {
        return "Hype check — the most-hyped bottle landed at the bottom blind.";
      }
      if (mostHyped.bottleId === winner.bottleId && mostHyped.hype >= 80) {
        return "Hype confirmed — the most-hyped bottle actually won blind.";
      }
    }

    return winner.bottleName + " took the flight.";
  }

  return {
    average,
    canReveal,
    clampScore,
    createFlight,
    expectedScores,
    flightResults,
    glassAverage,
    glassLetters,
    scoredCount,
    setScore,
    uniqueNames
  };
});
