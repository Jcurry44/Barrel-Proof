(function attachRecommendation(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.BarrelRecommendation = factory();
  }
})(typeof self !== "undefined" ? self : this, function createRecommendationModule() {
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function average(values) {
    const clean = values.filter((value) => Number.isFinite(value));
    if (!clean.length) return null;
    return clean.reduce((sum, value) => sum + value, 0) / clean.length;
  }

  function money(value) {
    if (!Number.isFinite(value)) return "n/a";
    return "$" + Math.round(value).toLocaleString("en-US");
  }

  function getSourceRetailPrice(bottle) {
    if (Number.isFinite(bottle.sourceRetailPrice)) return bottle.sourceRetailPrice;
    const prices = Array.isArray(bottle.prices) ? bottle.prices : [];
    const latest = prices.find((price) => Number.isFinite(price.retailPrice));
    return latest ? latest.retailPrice : null;
  }

  function getSecondaryMarketInfo(bottle) {
    const market = bottle.secondaryMarket || {};
    const value = firstFinite(
      market.averagePrice,
      bottle.secondaryMarketAverage,
      bottle.marketAveragePrice,
      market.latestPrice,
      bottle.secondaryMarketPrice
    );
    if (!Number.isFinite(value)) {
      return { value: null, type: "none", label: "No secondary market", confidence: "none" };
    }
    return {
      value,
      type: "secondary",
      label: market.label || bottle.secondaryMarketLabel || "Secondary market avg",
      confidence: market.confidence || bottle.secondaryMarketConfidence || "medium",
      sourceName: market.sourceName || bottle.secondaryMarketSourceName || "",
      url: market.url || bottle.secondaryMarketUrl || "",
      sampleSize: Number.isFinite(market.sampleSize) ? market.sampleSize : null,
      latestPrice: Number.isFinite(market.latestPrice) ? market.latestPrice : null,
      minPrice: Number.isFinite(market.minPrice) ? market.minPrice : null,
      maxPrice: Number.isFinite(market.maxPrice) ? market.maxPrice : null,
      observedAt: market.observedAt || ""
    };
  }

  // The catalog's source price is whichever state's price the importer met
  // first, but control-state shelf prices differ by 30%+ and the odd typo
  // ($15,000 for a $150 bottle) slips through. Anchor on the observed RANGE:
  //   - one observation: use it;
  //   - a tight range (max/min <= 1.6): the midpoint is the typical shelf price;
  //   - a wide range: sizes or errors are mixed in, so trust the low cluster
  //     (the first price if it sits near the minimum, else the minimum itself).
  function getSourceRetailPriceInfo(bottle) {
    const first = getSourceRetailPrice(bottle);
    if (!Number.isFinite(first)) return { value: null, observations: 0, spread: null, basis: "none" };
    const summary = (bottle && bottle.sourceSummary) || {};
    const observations = Number(summary.priceObservationCount) || 0;
    const min = Number(summary.minRetailPrice);
    const max = Number(summary.maxRetailPrice);
    if (observations < 2 || !Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max < min) {
      return { value: first, observations: Math.max(1, observations), spread: 1, basis: "single" };
    }
    const spread = max / min;
    if (spread <= 1.6) {
      return { value: Math.round(((min + max) / 2) * 100) / 100, observations, spread, basis: "midpoint" };
    }
    return { value: first <= min * 1.6 ? first : min, observations, spread, basis: "low-cluster" };
  }

  function getReferencePrice(bottle) {
    return getReferencePriceInfo(bottle).value;
  }

  function getReferencePriceInfo(bottle) {
    // Your own observed shelf prices are the most relevant anchor for "what
    // will I actually pay" — they outrank modeled fair value and MSRP.
    if (Number.isFinite(bottle.observedPrice)) {
      const n = Number(bottle.observedCount) || 1;
      return {
        value: bottle.observedPrice,
        type: "observed",
        label: n >= 2 ? "Your observed median (" + n + " sightings)" : "Your observed price",
        confidence: n >= 3 ? "high" : "medium"
      };
    }
    if (Number.isFinite(bottle.fairPrice)) {
      return { value: bottle.fairPrice, type: "fair", label: "Fair value", confidence: "high" };
    }
    const secondaryMarket = getSecondaryMarketInfo(bottle);
    if (Number.isFinite(secondaryMarket.value)) {
      return secondaryMarket;
    }
    if (Number.isFinite(bottle.msrp)) {
      if (isAllocatedMarketBottle(bottle)) {
        return {
          value: bottle.msrp,
          type: "msrp-allocated",
          label: "MSRP allocation guardrail",
          confidence: "low"
        };
      }
      return { value: bottle.msrp, type: "msrp", label: "MSRP reference", confidence: "medium" };
    }
    const sourceInfo = getSourceRetailPriceInfo(bottle);
    if (Number.isFinite(sourceInfo.value)) {
      if (sourceInfo.basis === "midpoint") {
        return {
          value: sourceInfo.value,
          type: "source",
          label: "Typical state retail (" + sourceInfo.observations + " prices)",
          confidence: sourceInfo.observations >= 3 ? "medium" : "low",
          observations: sourceInfo.observations
        };
      }
      if (sourceInfo.basis === "low-cluster") {
        return {
          value: sourceInfo.value,
          type: "source",
          label: "Source retail (prices vary widely)",
          confidence: "low",
          observations: sourceInfo.observations
        };
      }
      return {
        value: sourceInfo.value,
        type: "source",
        label: bottle.sourcePriceLabel || "Source retail",
        confidence: "low",
        observations: sourceInfo.observations
      };
    }
    return { value: null, type: "none", label: "No reference", confidence: "none" };
  }

  function isAllocatedHint(bottle, options) {
    return Boolean(options && options.allocated) || bottle.rarity === "Allocated" || bottle.rarity === "Unicorn";
  }

  function getPriceBands(bottle, options) {
    if (bottle.priceBands) return bottle.priceBands;
    const reference = getReferencePriceInfo(bottle);
    const referencePrice = reference.value;
    if (!Number.isFinite(referencePrice)) return null;
    // An allocated bottle's state list price or MSRP is a price almost nobody
    // gets. Judge it like the MSRP guardrail: near retail is a win, 2x is
    // still reasonable for the hunt, 3x is where the market lives.
    if (isAllocatedHint(bottle, options) && (reference.type === "source" || reference.type === "msrp")) {
      return {
        buy: Math.round(referencePrice * 1.25),
        consider: Math.round(referencePrice * 2),
        pass: Math.round(referencePrice * 3)
      };
    }
    if (reference.type === "source") {
      return {
        buy: Math.round(referencePrice * 0.85),
        consider: Math.round(referencePrice * 1.0),
        pass: Math.round(referencePrice * 1.15)
      };
    }
    // Secondary is what collectors pay, not what a bottle is worth to drink:
    // a Buy has to sit well under it, and matching it is merely the going rate.
    if (reference.type === "secondary") {
      return {
        buy: Math.round(referencePrice * 0.7),
        consider: Math.round(referencePrice * 1.0),
        pass: Math.round(referencePrice * 1.2)
      };
    }
    if (reference.type === "msrp-allocated") {
      return {
        buy: Math.round(referencePrice * 1.25),
        consider: Math.round(referencePrice * 2),
        pass: Math.round(referencePrice * 3)
      };
    }
    return {
      buy: Math.round(referencePrice * 0.95),
      consider: Math.round(referencePrice * 1.1),
      pass: Math.round(referencePrice * 1.25)
    };
  }

  function getPriceWindow(bottle) {
    const reference = getReferencePriceInfo(bottle);
    const bands = getPriceBands(bottle);
    const hasReference = Boolean(bands && Number.isFinite(reference.value));
    const caveats = [];

    if (!hasReference) {
      caveats.push("No verified price anchor is attached yet.");
    } else if (reference.type === "source") {
      caveats.push("Control-state or source retail is a real observation, not a full fair-market target.");
    } else if (reference.type === "msrp") {
      caveats.push("MSRP is useful for retail sanity checks but does not capture allocated-market premiums.");
    } else if (reference.type === "msrp-allocated") {
      caveats.push("MSRP is being used as an allocated-bottle guardrail until a real secondary-market result is attached.");
    } else if (reference.type === "secondary") {
      caveats.push("Secondary market data reflects auction/collector demand, not drinking value.");
    }

    if (bottle.hypeIndex > 88) {
      caveats.push("High-hype bottle: secondary prices can detach from drinking value.");
    }

    return {
      hasReference,
      reference,
      bands,
      buyBelow: hasReference ? bands.buy : null,
      considerBelow: hasReference ? bands.consider : null,
      passAbove: hasReference ? bands.pass : null,
      confidence: reference.confidence || "none",
      confidenceLabel: getPriceConfidenceLabel(reference.confidence),
      summary: hasReference
        ? buildPriceWindowSummary(reference, bands)
        : "Barrel Proof needs MSRP, fair value, or an official/source retail observation before it can draw a reliable buy window.",
      caveats
    };
  }

  function getMarketReality(bottle, shelfPrice) {
    const msrp = Number.isFinite(bottle.msrp) ? bottle.msrp : null;
    const sourceRetail = getSourceRetailPrice(bottle);
    const secondary = getSecondaryMarketInfo(bottle);
    const reference = getReferencePriceInfo(bottle);
    const enteredPrice = Number(shelfPrice);
    const hasShelfPrice = Number.isFinite(enteredPrice) && enteredPrice > 0;
    const hasSecondary = Number.isFinite(secondary.value);
    const ratios = {
      shelfToMsrp: hasShelfPrice && Number.isFinite(msrp) && msrp > 0 ? enteredPrice / msrp : null,
      shelfToSecondary: hasShelfPrice && hasSecondary && secondary.value > 0 ? enteredPrice / secondary.value : null,
      secondaryToMsrp: hasSecondary && Number.isFinite(msrp) && msrp > 0 ? secondary.value / msrp : null
    };
    const signals = [];
    const caveats = [];

    if (Number.isFinite(msrp)) signals.push({ label: "MSRP", value: money(msrp), tone: "neutral" });
    if (Number.isFinite(sourceRetail)) signals.push({ label: "Official retail", value: money(sourceRetail), tone: "neutral" });
    if (hasSecondary) {
      signals.push({
        label: secondary.label || "Secondary avg",
        value: money(secondary.value),
        tone: "market"
      });
    }

    if (!hasSecondary && isAllocatedMarketBottle(bottle)) {
      caveats.push("No secondary-market result is attached yet; MSRP alone can understate allocated-market demand.");
    }
    if (Number.isFinite(ratios.secondaryToMsrp) && ratios.secondaryToMsrp >= 3) {
      caveats.push("Secondary pricing is far above MSRP, so separate collector value from drinking value.");
    }
    if (reference.type === "source") {
      caveats.push("Official retail is a real source observation, not a full fair-market estimate.");
    }
    if (hasShelfPrice && Number.isFinite(ratios.shelfToSecondary) && ratios.shelfToSecondary <= 0.35) {
      caveats.push("Shelf price is dramatically below secondary-market history; verify bottle, size, and release before celebrating.");
    }

    return {
      shouldShow: hasSecondary || isAllocatedMarketBottle(bottle) || Number.isFinite(msrp) || Number.isFinite(sourceRetail),
      hasSecondary,
      reference,
      msrp,
      sourceRetail,
      secondary,
      shelfPrice: hasShelfPrice ? enteredPrice : null,
      ratios,
      signals,
      caveats,
      summary: buildMarketRealitySummary({
        bottle,
        hasShelfPrice,
        shelfPrice: enteredPrice,
        msrp,
        sourceRetail,
        secondary,
        ratios
      })
    };
  }

  function buildMarketRealitySummary(input) {
    const hasSecondary = Number.isFinite(input.secondary.value);
    if (input.hasShelfPrice && hasSecondary) {
      const pieces = [
        "Shelf is " + formatPercent(input.ratios.shelfToSecondary) + " of secondary"
      ];
      if (Number.isFinite(input.ratios.shelfToMsrp)) {
        pieces.push(formatRatio(input.ratios.shelfToMsrp) + " MSRP");
      }
      return pieces.join(" and ") + ".";
    }
    if (hasSecondary) {
      const saleText = input.secondary.sampleSize ? " across " + input.secondary.sampleSize + " sales" : "";
      const latestText = Number.isFinite(input.secondary.latestPrice) ? " Latest: " + money(input.secondary.latestPrice) + "." : "";
      return "Secondary average is " + money(input.secondary.value) + saleText + "." + latestText;
    }
    if (Number.isFinite(input.msrp) && Number.isFinite(input.sourceRetail)) {
      return "MSRP and official retail are available, but no secondary-market result is attached yet.";
    }
    if (Number.isFinite(input.msrp)) {
      return "MSRP is available; allocated-market bottles still need secondary context.";
    }
    if (Number.isFinite(input.sourceRetail)) {
      return "Official source retail is available; fair-market context still needs verification.";
    }
    return "No market anchors are attached yet.";
  }

  function isAllocatedMarketBottle(bottle) {
    const text = [
      bottle.rarity,
      bottle.name,
      bottle.category,
      ...(bottle.bestFor || [])
    ].filter(Boolean).join(" ").toLowerCase();
    return (
      text.includes("unicorn") ||
      text.includes("allocated") ||
      text.includes("limited") ||
      Number(bottle.hypeIndex) >= 72 ||
      Number(bottle.msrp) >= 100 ||
      Number(bottle.fairPrice) >= 120
    );
  }

  function buildPriceWindowSummary(reference, bands) {
    return [
      "Buy under " + money(bands.buy) + ".",
      "Consider to " + money(bands.consider) + ".",
      "Pass above " + money(bands.pass) + ".",
      "Anchor: " + reference.label + "."
    ].join(" ");
  }

  function getPriceConfidenceLabel(confidence) {
    if (confidence === "high") return "High confidence";
    if (confidence === "medium") return "Medium confidence";
    if (confidence === "low") return "Low confidence";
    return "No price anchor";
  }

  function formatPercent(value) {
    if (!Number.isFinite(value)) return "n/a";
    return Math.round(value * 100) + "%";
  }

  function formatRatio(value) {
    if (!Number.isFinite(value)) return "n/a";
    return value >= 10 ? Math.round(value) + "x" : value.toFixed(value >= 2 ? 1 : 2) + "x";
  }

  function firstFinite() {
    for (const value of arguments) {
      if (Number.isFinite(value)) return value;
    }
    return null;
  }

  function getFriendAverage(bottleId, friends) {
    return average((friends || []).map((friend) => friend.ratings && friend.ratings[bottleId]));
  }

  function getPalateMatch(bottle, palate) {
    const favoriteProfiles = new Set((palate.favoriteProfiles || []).map((tag) => tag.toLowerCase()));
    const bottleTags = [
      ...(bottle.profile || []),
      ...(bottle.bestFor || []),
      bottle.category || ""
    ].map((tag) => tag.toLowerCase());
    const hits = bottleTags.filter((tag) => favoriteProfiles.has(tag));
    const proofDelta = Math.abs((bottle.proof || 90) - (palate.proofPreference || 95));
    const proofScore = clamp(1 - proofDelta / 55, 0, 1);
    const tagScore = clamp(hits.length / 3, 0, 1);
    return clamp(tagScore * 0.68 + proofScore * 0.32, 0, 1);
  }

  // Palate fit is only a real signal when there is something to compare: flavor
  // tags on the bottle AND favorite flavors on the palate, or a learned fit
  // passed in from the recommender. Most catalog rows carry no flavor tags, so
  // pretending to know (a proof-only 27%) misleads and drags every verdict down.
  function getPalateFit(bottle, palate, options) {
    const learned = options && Number.isFinite(options.learnedFit) ? clamp(options.learnedFit, 0, 1) : null;
    const favorites = (palate && palate.favoriteProfiles) || [];
    const hasTags = ((bottle && bottle.profile) || []).length > 0 || ((bottle && bottle.bestFor) || []).length > 0;
    const hasFavorites = favorites.length > 0;
    if (hasTags && hasFavorites) {
      const tagFit = getPalateMatch(bottle, palate);
      if (learned !== null) return { score: clamp(tagFit * 0.5 + learned * 0.5, 0, 1), known: true, basis: "blended" };
      return { score: tagFit, known: true, basis: "tags" };
    }
    if (learned !== null) return { score: learned, known: true, basis: "learned" };
    const proofPreference = Number(palate && palate.proofPreference);
    if (Number.isFinite(proofPreference) && Number.isFinite(Number(bottle && bottle.proof))) {
      const proofDelta = Math.abs(Number(bottle.proof) - proofPreference);
      return { score: clamp(1 - proofDelta / 55, 0, 1), known: true, basis: "proof" };
    }
    return { score: 0.5, known: false, basis: "unknown" };
  }

  function getReviewSignal(bottle) {
    const sourceCount = getReviewSourceCount(bottle);
    if (!hasSourcedReviewScore(bottle) || !Number.isFinite(bottle.reviewScore)) {
      return {
        score: 0.5,
        value: null,
        sourceCount,
        sourced: false
      };
    }
    return {
      score: clamp((bottle.reviewScore - 75) / 22, 0, 1),
      value: bottle.reviewScore,
      sourceCount,
      sourced: true
    };
  }

  function hasSourcedReviewScore(bottle) {
    if (bottle.reviewScoreSource === "cited-review-data") return true;
    if (bottle.reviewSummary && bottle.reviewSummary.hasNumericScore === true) return true;
    return false;
  }

  function getReviewSourceCount(bottle) {
    if (Number.isFinite(bottle.reviewSourceCount)) return bottle.reviewSourceCount;
    if (Array.isArray(bottle.reviewSources)) return bottle.reviewSources.length;
    if (bottle.reviewSummary && Number.isFinite(bottle.reviewSummary.sourceCount)) return bottle.reviewSummary.sourceCount;
    return 0;
  }

  function getPricePosition(bottle, shelfPrice, options) {
    const price = Number(shelfPrice);
    if (!Number.isFinite(price) || price <= 0) {
      return {
        ratioToMsrp: null,
        ratioToFair: null,
        priceWindow: getPriceWindow(bottle),
        grade: "Unknown",
        score: 0.45,
        message: "Enter the shelf price to judge the buy window."
      };
    }

    const reference = getReferencePriceInfo(bottle);
    const referencePrice = reference.value;
    const bands = getPriceBands(bottle, options);
    if (!bands || !Number.isFinite(referencePrice)) {
      return {
        ratioToMsrp: Number.isFinite(bottle.msrp) ? price / bottle.msrp : null,
        ratioToFair: null,
        referencePrice: null,
        bands: null,
        priceWindow: getPriceWindow(bottle),
        grade: "Unknown",
        score: 0.45,
        message: "No source-backed reference price is available yet."
      };
    }

    const ratioToMsrp = Number.isFinite(bottle.msrp) ? price / bottle.msrp : null;
    const ratioToFair = price / referencePrice;
    let grade = "Fair";
    let score = 0.62;
    let message = "Price is workable, but not a steal.";

    if (price <= bands.buy) {
      grade = "Strong";
      score = 0.92;
      message = "Below fair value. This is the buy zone.";
    } else if (price <= bands.consider) {
      grade = "Good";
      score = reference.type === "secondary" ? 0.6 : 0.7;
      message = reference.type === "secondary"
        ? "Close to what the secondary market asks. You're paying the going rate, not finding a deal."
        : "Close to fair value. Reasonable if you want it.";
    } else if (price <= bands.pass) {
      grade = "Stretched";
      score = 0.48;
      message = "Above fair value. Buy only if it fills a real gap.";
    } else {
      grade = "Bad";
      score = 0.18;
      message = "Meaningfully above fair value. The bottle has to be special.";
    }

    if (Number.isFinite(ratioToMsrp) && ratioToMsrp > 2.5 && bottle.hypeIndex > 80 && reference.type !== "msrp-allocated") {
      score -= 0.08;
      message = "Hype tax is doing real work here.";
    }

    if (reference.type === "source") {
      score -= 0.08;
      message += " Reference is a control-state/source retail observation, not a confirmed fair-market target.";
    } else if (reference.type === "secondary") {
      message += " Reference is secondary-market data, so MSRP and drinker value still matter.";
    } else if (reference.type === "msrp-allocated") {
      score -= 0.06;
      message += " Reference is an MSRP allocation guardrail until secondary data is attached.";
    }

    return {
      ratioToMsrp,
      ratioToFair,
      referencePrice,
      reference,
      bands,
      priceWindow: getPriceWindow(bottle),
      grade,
      score: clamp(score, 0, 1),
      message
    };
  }

  // Allocated-bottle economics: a grail at (or anywhere near) retail is a buy,
  // full stop — these bottles trade at multiples of MSRP and may never be seen
  // at this price again. Owning one already makes a retail backup BETTER, not
  // worse. No score blend is allowed to talk someone out of a Handy at $70.
  // options.allocated lets the caller pass what the availability model knows
  // (brand tokens like "elmer t lee" or "stagg") for catalog rows that carry no
  // rarity or hype fields of their own.
  function isGrailSteal(bottle, shelfPrice, options) {
    const price = Number(shelfPrice);
    if (!Number.isFinite(price) || price <= 0) return false;
    const allocated = isAllocatedHint(bottle, options) || Number(bottle.hypeIndex) >= 85;
    if (!allocated) return false;
    const msrp = Number(bottle.msrp);
    const fair = Number(bottle.fairPrice);
    const secondary = getSecondaryMarketInfo(bottle).value;
    const sourceRetail = getSourceRetailPriceInfo(bottle).value;
    // The retail anchor: MSRP when curated, else the typical state list price.
    const retail = Number.isFinite(msrp) ? msrp : (Number.isFinite(sourceRetail) ? sourceRetail : NaN);
    if (Number.isFinite(msrp) && price <= msrp * 1.15) return true;
    if (Number.isFinite(fair) && Number.isFinite(msrp) && fair >= msrp * 1.5 && price <= fair * 0.7) return true;
    // Half of what the secondary market asks is a steal, as long as it is not
    // already deep into collector territory relative to retail.
    if (Number.isFinite(secondary) && price <= secondary * 0.5 && (!Number.isFinite(retail) || price <= retail * 2.5)) return true;
    // No fair-value or secondary anchor at all: allocated bottles trade at
    // multiples of retail, so anything within 1.5x retail is still well under
    // what the market asks. A Weller 12 at $65 is a buy, not a "hype tax".
    if (Number.isFinite(retail) && !Number.isFinite(fair) && !Number.isFinite(secondary) && price <= retail * 1.5) return true;
    return false;
  }

  function scoreBottleDecision(input) {
    const bottle = input.bottle;
    const palate = input.palate || {};
    const friends = input.friends || [];
    const status = input.status || "none";
    const shelfPrice = Number(input.shelfPrice);
    const allocationOptions = { allocated: Boolean(input.allocated) };
    const price = getPricePosition(bottle, shelfPrice, allocationOptions);
    const palateFit = getPalateFit(bottle, palate, { learnedFit: input.learnedFit });
    const palateMatch = palateFit.score;
    const friendAverage = getFriendAverage(bottle.id, friends);
    const friendKnown = Number.isFinite(friendAverage);
    const friendScore = friendKnown ? clamp((friendAverage - 6.5) / 3, 0, 1) : 0.5;
    const reviewSignal = getReviewSignal(bottle);
    const grailSteal = isGrailSteal(bottle, shelfPrice, allocationOptions);
    const ownedPenalty = status === "owned" && !grailSteal ? 0.16 : 0;
    const passedPenalty = status === "passed" && !grailSteal ? 0.08 : 0;
    const rarityBoost = bottle.rarity === "Unicorn" || bottle.rarity === "Allocated" ? 0.05 : 0;
    // Against a real fair/secondary reference, paying well over it on a hyped
    // bottle is a hype tax. Against the MSRP guardrail it is not: every real
    // shelf price for an allocated bottle sits above MSRP by definition.
    const guardrailReference = Boolean(price.reference && price.reference.type === "msrp-allocated");
    const hypePenalty = bottle.hypeIndex > 88 && price.ratioToFair > 1.15 && !guardrailReference ? 0.12 : 0;

    // Only signals the app actually has get a vote. Filling unknown palate,
    // club, and review signals with a neutral 0.5 capped every price-only
    // verdict at "Consider" — a bottle well under its typical price could never
    // be a Buy for someone who had not logged pours yet.
    const priceKnown = price.grade !== "Unknown";
    const components = [
      { key: "price", weight: 0.36, score: price.score, known: priceKnown },
      { key: "palate", weight: palateFit.basis === "proof" ? 0.12 : 0.24, score: palateMatch, known: palateFit.known },
      { key: "friends", weight: 0.18, score: friendScore, known: friendKnown },
      { key: "reviews", weight: 0.17, score: reviewSignal.score, known: reviewSignal.sourced }
    ];
    const knownComponents = components.filter((component) => component.known);
    const knownWeight = knownComponents.reduce((sum, component) => sum + component.weight, 0);
    const base = knownWeight > 0
      ? knownComponents.reduce((sum, component) => sum + component.weight * component.score, 0) / knownWeight
      : 0.5;
    const evidence = {};
    for (const component of components) evidence[component.key] = component.known;

    let score = clamp(base + rarityBoost - ownedPenalty - passedPenalty - hypePenalty, 0, 1);

    if (price.grade === "Bad" && price.ratioToFair > 1.55 && bottle.hypeIndex > 80) {
      score = Math.min(score, 0.46);
    }

    // Grail at retail overrides everything: palate fit, friend signal, and
    // ownership are noise next to a once-a-year bottle at store price.
    if (grailSteal) {
      score = Math.max(score, 0.93);
    }

    let decision = "Consider";
    if (score >= 0.72) decision = "Buy";
    if (score < 0.49) decision = "Pass";

    const reasons = [];
    const cautions = [];

    if (grailSteal) {
      const sourceRetail = getSourceRetailPriceInfo(bottle).value;
      const retailText = Number.isFinite(Number(bottle.msrp))
        ? " (MSRP " + money(Number(bottle.msrp)) + ")"
        : (Number.isFinite(sourceRetail) ? " (typical retail " + money(sourceRetail) + ")" : "");
      reasons.push("Allocated-bottle economics: " + money(Number(shelfPrice)) + " on a bottle that trades far above retail" + retailText + ". You may not see this price again — buy it.");
      if (status === "owned") {
        reasons.push("You already own one — a backup at this price is the best deal in bourbon, not a reason to pass.");
      }
    }

    reasons.push(price.message);

    if (palateFit.known && palateFit.basis !== "proof" && palateMatch >= 0.72) {
      reasons.push("Strong fit for your palate profile.");
    } else if (palateFit.known && palateFit.basis !== "proof" && palateMatch <= 0.38) {
      cautions.push("Palate fit is not obvious based on your saved preferences.");
    } else if (palateFit.basis === "proof" && palateMatch <= 0.3) {
      cautions.push("Well outside your usual proof range.");
    }

    if (friendAverage && friendAverage >= 8.6) {
      reasons.push("Your group has rated this highly.");
    } else if (friendAverage && friendAverage < 8) {
      cautions.push("Friend signal is mixed.");
    }

    if (status === "owned" && !grailSteal) {
      cautions.push("You already own this. It needs to be backup-bottle pricing.");
    }

    if (bottle.hypeIndex > 88 && price.ratioToFair > 1.1 && !guardrailReference) {
      cautions.push("Hype is likely inflating the shelf price.");
    }

    if (price.grade === "Bad" && price.ratioToFair > 1.55) {
      cautions.push("This is a great-bottle-bad-price setup.");
    }

    if (Number.isFinite(shelfPrice) && shelfPrice <= bottle.msrp * 1.1 && reviewSignal.sourced && reviewSignal.value >= 88) {
      reasons.push("Near MSRP with sourced review support.");
    }

    let evidenceNote = "";
    if (priceKnown && !evidence.palate && !evidence.friends && !evidence.reviews) {
      evidenceNote = "Judged on price alone so far. Log a few pours or add your club's cards to sharpen this call.";
    } else if (priceKnown && !evidence.friends) {
      evidenceNote = "No club ratings for this bottle yet.";
    }

    return {
      decision,
      score,
      confidence: Math.round(score * 100),
      evidence,
      evidenceNote,
      price,
      palateMatch,
      palateFit,
      friendAverage,
      friendScore,
      reviewScore: reviewSignal.value,
      reviewSignal,
      reasons,
      cautions,
      summary: buildSummary({ bottle, decision, shelfPrice, price, friendAverage, status })
    };
  }

  function buildSummary({ bottle, decision, shelfPrice, price, friendAverage, status }) {
    const priceText = Number.isFinite(Number(shelfPrice)) ? money(Number(shelfPrice)) : "the entered price";
    const friendText = friendAverage ? " Friend avg: " + friendAverage.toFixed(1) + "." : "";
    const statusText = status === "owned" ? " You already have one." : "";
    const referenceText = price && price.reference && price.reference.type === "source"
      ? "against source retail"
      : price && price.reference && price.reference.type === "secondary"
        ? "against secondary market"
        : price && price.reference && price.reference.type === "msrp-allocated"
          ? "against MSRP for an allocated bottle"
          : "against the best price reference";
    return (
      decision +
      " at " +
      priceText +
      ". " +
      bottle.name +
      " is " +
      price.grade.toLowerCase() +
      " " +
      referenceText +
      "." +
      friendText +
      statusText
    );
  }

  function rankBottlesForStore({ bottles, shelfPrices, palate, friends, statuses }) {
    return bottles
      .map((bottle) => {
        const shelfPrice = shelfPrices && shelfPrices[bottle.id] ? shelfPrices[bottle.id] : bottle.shelfAverage;
        return {
          bottle,
          result: scoreBottleDecision({
            bottle,
            shelfPrice,
            palate,
            friends,
            status: statuses && statuses[bottle.id]
          })
        };
      })
      .sort((a, b) => b.result.score - a.result.score);
  }

  return {
    average,
    clamp,
    getFriendAverage,
    getPalateFit,
    getPalateMatch,
    getReviewSignal,
    getPricePosition,
    getPriceBands,
    getPriceWindow,
    getMarketReality,
    getReferencePrice,
    getReferencePriceInfo,
    getSecondaryMarketInfo,
    getSourceRetailPrice,
    getSourceRetailPriceInfo,
    money,
    isGrailSteal,
    rankBottlesForStore,
    scoreBottleDecision
  };
});
