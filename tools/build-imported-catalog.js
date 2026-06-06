#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const {
  mergeCatalogRecords,
  unique
} = require("../src/logic/catalog.js");

const SOURCE_DISPLAY = {
  nc_abc: {
    idPrefix: "nc-abc-",
    priceLabel: "NC ABC retail",
    rarity: "Source-backed"
  },
  nc_abc_warehouse_stock: {
    idPrefix: "nc-abc-stock-",
    priceLabel: "No retail price in NC warehouse stock",
    rarity: "Source-backed"
  },
  ohlq_brand_master: {
    idPrefix: "ohlq-",
    priceLabel: "OHLQ retail",
    rarity: "Source-backed"
  },
  olcc_monthly_pricing: {
    idPrefix: "olcc-",
    priceLabel: "OLCC retail",
    rarity: "Source-backed"
  },
  iowa_abd_products: {
    idPrefix: "iowa-abd-",
    priceLabel: "Iowa ABD retail",
    rarity: "Source-backed"
  },
  idaho_liquor_price_book: {
    idPrefix: "idaho-liquor-",
    priceLabel: "Idaho retail",
    rarity: "Source-backed"
  },
  utah_dabs_product_list: {
    idPrefix: "utah-dabs-",
    priceLabel: "Utah DABS retail",
    rarity: "Source-backed"
  },
  michigan_lcc_price_book: {
    idPrefix: "michigan-lcc-",
    priceLabel: "Michigan LCC shelf",
    rarity: "Source-backed"
  },
  alabama_abc_quarterly_price_list: {
    idPrefix: "alabama-abc-",
    priceLabel: "Alabama ABC retail",
    rarity: "Source-backed"
  },
  montana_dor_price_disk: {
    idPrefix: "montana-dor-",
    priceLabel: "Montana DOR price",
    rarity: "Source-backed"
  },
  mississippi_abc_price_changes: {
    idPrefix: "mississippi-abc-",
    priceLabel: "MS ABC bottle cost",
    rarity: "Source-backed"
  },
  maine_spirits_master_price_list: {
    idPrefix: "maine-spirits-",
    priceLabel: "Maine Spirits retail",
    rarity: "Source-backed"
  },
  montgomery_county_abs_price_book: {
    idPrefix: "montgomery-abs-",
    priceLabel: "MoCo ABS wholesale",
    rarity: "Source-backed"
  },
  montgomery_county_abs_inventory: {
    idPrefix: "montgomery-inventory-",
    priceLabel: "MoCo ABS retail",
    rarity: "Source-backed"
  },
  vermont_802_spirits_price_list: {
    idPrefix: "vermont-802-",
    priceLabel: "VT 802 retail",
    rarity: "Source-backed"
  },
  wv_abca_liquor_search: {
    idPrefix: "wv-abca-",
    priceLabel: "No retail price in WV search",
    rarity: "Source-backed"
  },
  lcbo_whisky_catalog: {
    idPrefix: "lcbo-",
    priceLabel: "No USD price; LCBO CAD kept in source metadata",
    rarity: "Source-backed"
  },
  pa_lcb_wholesale_spirits_catalog: {
    idPrefix: "pa-lcb-",
    priceLabel: "PA LCB retail",
    rarity: "Source-backed"
  },
  wyoming_liquor_division: {
    idPrefix: "wyoming-liquor-",
    priceLabel: "WY bottle list est.",
    rarity: "Source-backed"
  },
  ttb_cola_public_registry: {
    idPrefix: "ttb-",
    priceLabel: "No retail price in TTB registry",
    rarity: "Label approval"
  },
  tabc_product_registration: {
    idPrefix: "tabc-",
    priceLabel: "No retail price in TABC registry",
    rarity: "State registration"
  },
  kentucky_abc_active_brands: {
    idPrefix: "kentucky-abc-",
    priceLabel: "No retail price in KY registration",
    rarity: "State registration"
  },
  connecticut_liquor_brands: {
    idPrefix: "connecticut-liquor-",
    priceLabel: "No retail price in CT registration",
    rarity: "State registration"
  }
};

function parseArgs(argv) {
  const args = {
    inputs: [],
    out: "src/data/imported-catalog.json",
    indexOut: "src/data/imported-catalog-index.json",
    indexJsOut: "src/data/imported-catalog-index.js",
    legacyJsOut: "src/data/imported-catalog.js"
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input") args.inputs.push(argv[++i]);
    if (arg === "--input-dir") args.inputDir = argv[++i];
    if (arg === "--out") args.out = argv[++i];
    if (arg === "--index-out") args.indexOut = argv[++i];
    if (arg === "--index-js-out") args.indexJsOut = argv[++i];
    if (arg === "--legacy-js-out") args.legacyJsOut = argv[++i];
  }

  return args;
}

function resolveInputFiles(args) {
  const files = [...args.inputs];
  const inputDir = args.inputDir || (!files.length ? "data/imports" : "");

  if (inputDir && fs.existsSync(path.resolve(inputDir))) {
    const dir = path.resolve(inputDir);
    for (const entry of fs.readdirSync(dir)) {
      if (entry.toLowerCase().endsWith(".json")) files.push(path.join(dir, entry));
    }
  }

  return unique(files).map((file) => path.resolve(file));
}

function readImportPayload(file) {
  const payload = JSON.parse(fs.readFileSync(file, "utf8"));
  return {
    ...payload,
    importFile: path.relative(process.cwd(), file)
  };
}

function buildAppCatalogPayload(payloads, generatedAt = new Date().toISOString()) {
  const sourceBottles = payloads.flatMap((payload) => payload.bottles || []);
  const bottles = mergeCatalogRecords(sourceBottles).map(toAppBottle);
  const sources = payloads.map((payload) => ({
    ...(payload.source || {}),
    importFile: payload.importFile || "",
    retrievedAt: payload.retrievedAt || ""
  }));

  return {
    schemaVersion: 1,
    generatedAt,
    sources,
    sourceCount: sources.length,
    bottleCount: bottles.length,
    bottles
  };
}

function toAppBottle(bottle) {
  const sourceIds = getSourceIds(bottle);
  const primarySourceId = sourceIds[0] || "unknown";
  const sourceDisplay = getSourceDisplay(sourceIds);
  const sourcePrice = getFirstSourcePrice(bottle);
  const inferredMaker = inferMaker(bottle);
  const releaseProfile = getReleaseProfile(bottle);
  const producer = releaseProfile.producer || bottle.producer || inferredMaker.producer;
  const distillery = releaseProfile.distillery || inferredMaker.distillery || producer || "Unknown producer";
  const name = releaseProfile.name || bottle.name;

  return {
    id: sourceDisplay.idPrefix + bottle.id,
    name,
    distillery,
    producer,
    supplier: bottle.supplier,
    category: releaseProfile.category || bottle.category || "Source-backed record",
    proof: bottle.proof,
    proofs: bottle.proofs || [],
    proofDisplay: getProofDisplay(bottle),
    age: bottle.age,
    ageYears: bottle.ageYears,
    size: bottle.size,
    upc: bottle.upc || null,
    barcodes: bottle.barcodes || [],
    sourceRetailPrice: sourcePrice ? sourcePrice.retailPrice : null,
    sourcePriceLabel: sourceDisplay.priceLabel,
    rarity: releaseProfile.rarity || sourceDisplay.rarity,
    mashBill: releaseProfile.mashBill || "Unknown",
    imageTone: getImageTone(bottle, primarySourceId),
    aliases: unique([bottle.name, ...(bottle.aliases || [])]),
    profile: releaseProfile.profile || [],
    bestFor: releaseProfile.bestFor || [],
    reviewScore: releaseProfile.reviewScore || null,
    hypeIndex: releaseProfile.hypeIndex || null,
    story: releaseProfile.story || buildStory(bottle, sourceIds),
    sourceSummary: buildSourceSummary(bottle),
    sourceRefs: bottle.sourceRefs || [],
    prices: bottle.prices || [],
    labelApprovals: bottle.labelApprovals || []
  };
}

function getReleaseProfile(bottle) {
  const text = [
    bottle.name,
    ...(bottle.aliases || [])
  ].filter(Boolean).join(" ").toLowerCase();
  if (/\bgeorge\s+t\.?\s+stagg\b/.test(text) && !/\b(corazon|tequila|mezcal|anejo|a\u00f1ejo|reposado|blanco|rum|vodka|gin|cognac|brandy)\b/.test(text)) {
    return {
      name: "George T. Stagg",
      distillery: "Buffalo Trace",
      producer: "Sazerac",
      category: "Kentucky Straight Bourbon",
      rarity: "Unicorn",
      mashBill: "Buffalo Trace Mash Bill #1",
      story: "Buffalo Trace Antique Collection barrel-proof bourbon. Source rows are merged as one release family because state catalogs often list different annual proofs and shorthand names."
    };
  }
  return {};
}

function getProofDisplay(bottle) {
  const proofs = uniqueProofs([...(bottle.proofs || []), bottle.proof]);
  if (!proofs.length) return "";
  if (proofs.length > 1 && proofs[proofs.length - 1] - proofs[0] > 1.5) {
    return formatProof(proofs[0]) + "-" + formatProof(proofs[proofs.length - 1]) + " proof";
  }
  return formatProof(proofs[proofs.length - 1]) + " proof";
}

function uniqueProofs(values) {
  return Array.from(new Set((values || [])
    .map(parseProofValue)
    .filter(Number.isFinite)
    .map((value) => Math.round(value * 10) / 10)))
    .sort((a, b) => a - b);
}

function parseProofValue(value) {
  if (typeof value === "number") return value > 0 ? value : null;
  const clean = String(value || "").replace(/[^0-9.]/g, "");
  if (!clean) return null;
  const parsed = Number(clean);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function formatProof(value) {
  return Number.isInteger(value) ? String(value) : String(value).replace(/\.0$/, "");
}

const MAKER_RULES = [
  { pattern: /\b(george\s*t\.?\s*stagg|stagg(?:\s+jr\.?)?|weller|william\s+larue\s+weller|eagle\s+rare|buffalo\s+trace|e\.?\s*h\.?\s*taylor|colonel\s+e\.?\s*h\.?\s*taylor|blanton'?s|elmer\s+t\.?\s+lee|rock\s+hill\s+farms|sazerac\s+rye|thomas\s+h\.?\s+handy|benchmark)\b/i, distillery: "Buffalo Trace", producer: "Sazerac" },
  { pattern: /\b(1792|barton)\b/i, distillery: "Barton 1792", producer: "Sazerac" },
  { pattern: /\b(old\s+forester|woodford\s+reserve|coopers'? craft)\b/i, distillery: "Brown-Forman", producer: "Brown-Forman" },
  { pattern: /\bjack\s+daniel'?s\b/i, distillery: "Jack Daniel Distillery", producer: "Brown-Forman" },
  { pattern: /\bgeorge\s+dickel\b/i, distillery: "Cascade Hollow", producer: "Diageo" },
  { pattern: /\b(wild\s+turkey|rare\s+breed|russell'?s\s+reserve|kentucky\s+spirit)\b/i, distillery: "Wild Turkey", producer: "Campari" },
  { pattern: /\b(elijah\s+craig|heaven\s+hill|old\s+fitzgerald|l\.?\s*arceny|larceny|henry\s+mckenna|bernheim)\b/i, distillery: "Heaven Hill", producer: "Heaven Hill" },
  { pattern: /\b(four\s+roses)\b/i, distillery: "Four Roses", producer: "Kirin" },
  { pattern: /\b(maker'?s\s+mark)\b/i, distillery: "Maker's Mark", producer: "Beam Suntory" },
  { pattern: /\b(knob\s+creek|booker'?s|baker'?s|basil\s+hayden|jim\s+beam|little\s+book|hardin'?s\s+creek)\b/i, distillery: "James B. Beam", producer: "Beam Suntory" },
  { pattern: /\b(michter'?s)\b/i, distillery: "Michter's", producer: "Michter's" },
  { pattern: /\b(new\s+riff)\b/i, distillery: "New Riff", producer: "New Riff" },
  { pattern: /\b(mgp|remus|rossville\s+union)\b/i, distillery: "Ross & Squibb", producer: "MGP" },
  { pattern: /\b(barrell|stellum)\b/i, distillery: "Barrell Craft Spirits", producer: "Barrell Craft Spirits" },
  { pattern: /\bfound\s+north\b/i, distillery: "Found North", producer: "Found North" }
];

function inferMaker(bottle) {
  const text = [
    bottle.name,
    bottle.producer,
    bottle.supplier,
    ...(bottle.aliases || [])
  ].filter(Boolean).join(" ");
  const rule = MAKER_RULES.find((candidate) => candidate.pattern.test(text));
  return rule ? { distillery: rule.distillery, producer: rule.producer } : {};
}

function getSourceIds(bottle) {
  return unique((bottle.sourceRefs || []).map((sourceRef) => sourceRef.sourceId));
}

function getSourceDisplay(sourceIds) {
  if (sourceIds.length === 1 && SOURCE_DISPLAY[sourceIds[0]]) return SOURCE_DISPLAY[sourceIds[0]];
  const firstKnown = sourceIds.find((sourceId) => SOURCE_DISPLAY[sourceId]);
  if (firstKnown) {
    return {
      ...SOURCE_DISPLAY[firstKnown],
      idPrefix: "imported-",
      rarity: "Multi-source"
    };
  }
  return {
    idPrefix: "imported-",
    priceLabel: "Source retail",
    rarity: "Source-backed"
  };
}

function getFirstSourcePrice(bottle) {
  return (bottle.prices || []).find((price) => isUsableRetailPrice(price, bottle));
}

function getImageTone(bottle, primarySourceId) {
  if (bottle.bottleKind === "rye") return "copper";
  if (primarySourceId === "ttb_cola_public_registry") return "bronze";
  return "mahogany";
}

function buildStory(bottle, sourceIds) {
  if (sourceIds.length === 1 && sourceIds[0] === "ttb_cola_public_registry") {
    return "Federal label approval record. Use this for product identity and release discovery, then pair it with retail/catalog data for buy decisions.";
  }
  if (sourceIds.length === 1 && sourceIds[0] === "lcbo_whisky_catalog") {
    return "Official LCBO Ontario catalog record. CAD prices are preserved in source metadata and are not used as U.S. shelf-price observations.";
  }
  return "";
}

function buildSourceSummary(bottle) {
  const sourceRefs = bottle.sourceRefs || [];
  const prices = (bottle.prices || []).filter((price) => isUsableRetailPrice(price, bottle));
  const regions = unique(prices.map((price) => price.region).filter(Boolean));
  const retailPrices = prices.map((price) => price.retailPrice).filter(Number.isFinite);
  return {
    sourceCount: sourceRefs.length,
    sourceIds: getSourceIds(bottle),
    priceObservationCount: retailPrices.length,
    minRetailPrice: retailPrices.length ? Math.min(...retailPrices) : null,
    maxRetailPrice: retailPrices.length ? Math.max(...retailPrices) : null,
    regions
  };
}

function isUsableRetailPrice(price, bottle = {}) {
  if (!price || !Number.isFinite(price.retailPrice)) return false;
  const value = price.retailPrice;
  if (value <= 0) return false;
  const size = String(price.size || bottle.size || "").toLowerCase();
  const min = minimumUsableRetailPrice(size, bottle);
  if (value < min) return false;
  return true;
}

function minimumUsableRetailPrice(size, bottle = {}) {
  let floor = 10;
  if (/1\.75\s*l|1750\s*ml/.test(size)) floor = 20;
  else if (/\b1\s*l|1000\s*ml/.test(size)) floor = 15;
  else if (/700\s*ml|720\s*ml|750\s*ml/.test(size)) floor = 12;
  else if (/375\s*ml/.test(size)) floor = 8;
  else if (/200\s*ml/.test(size)) floor = 5;
  else if (/100\s*ml/.test(size)) floor = 3;
  else if (/50\s*ml/.test(size)) floor = 2;

  const ageYears = getHighestAgeSignal(bottle);
  if (/700\s*ml|720\s*ml|750\s*ml/.test(size)) {
    const text = [
      bottle.name,
      bottle.category,
      ...((bottle.aliases || []))
    ].filter(Boolean).join(" ").toLowerCase();
    const proof = Number.isFinite(bottle.proof) ? bottle.proof : null;
    if (/\bstraight\s+from\s+the\s+barrel\b/.test(text)) floor = Math.max(floor, 75);
    else if (Number(proof) >= 115 || /\b(barrel\s+proof|cask\s+strength)\b/.test(text)) floor = Math.max(floor, 35);
    if (ageYears >= 21) floor = Math.max(floor, 100);
    else if (ageYears >= 16) floor = Math.max(floor, 50);
    else if (ageYears >= 12) floor = Math.max(floor, 35);
  }

  return floor;
}

function getHighestAgeSignal(bottle = {}) {
  const values = [];
  if (Number.isFinite(bottle.ageYears)) values.push(bottle.ageYears);
  const text = [
    bottle.name,
    bottle.age,
    ...((bottle.aliases || []))
  ].filter(Boolean).join(" ");
  for (const match of text.matchAll(/\b(\d{1,2}(?:\.\d+)?)\s*(?:years?|yrs?|yr|yo)\b/gi)) {
    const value = Number(match[1]);
    if (Number.isFinite(value)) values.push(value);
  }
  return values.length ? Math.max(...values) : null;
}

function buildIndexPayload(appPayload) {
  const confidentBottles = dedupeVisibleReleaseFamilies(appPayload.bottles.filter(isConfidentAppBottle));
  return {
    schemaVersion: appPayload.schemaVersion,
    generatedAt: appPayload.generatedAt,
    sourceCount: appPayload.sourceCount,
    fullBottleCount: appPayload.bottleCount,
    bottleCount: confidentBottles.length,
    sources: appPayload.sources,
    bottles: confidentBottles.map(toIndexBottle)
  };
}

function dedupeVisibleReleaseFamilies(bottles) {
  const byFamily = new Map();
  const visible = [];
  for (const bottle of bottles) {
    const familyKey = getVisibleReleaseFamilyKey(bottle);
    if (!familyKey) {
      visible.push(bottle);
      continue;
    }
    const existing = byFamily.get(familyKey);
    if (!existing) {
      byFamily.set(familyKey, bottle);
      visible.push(bottle);
      continue;
    }
    if (scoreVisibleReleaseBottle(bottle) > scoreVisibleReleaseBottle(existing)) {
      byFamily.set(familyKey, bottle);
      const index = visible.indexOf(existing);
      if (index >= 0) visible[index] = bottle;
    }
  }
  return visible;
}

function getVisibleReleaseFamilyKey(bottle) {
  const text = [
    bottle.name,
    ...(bottle.aliases || [])
  ].filter(Boolean).join(" ").toLowerCase();
  if (/\bgeorge\s+t\.?\s+stagg\b/.test(text) && !/\b(corazon|tequila|mezcal|anejo|a\u00f1ejo|reposado|blanco|rum|vodka|gin|cognac|brandy)\b/.test(text)) {
    return "george-t-stagg";
  }
  return "";
}

function scoreVisibleReleaseBottle(bottle) {
  const summary = bottle.sourceSummary || buildSourceSummary(bottle);
  const sourceCount = summary.sourceCount || 0;
  const priceCount = summary.priceObservationCount || 0;
  let score = sourceCount * 8 + priceCount * 14;
  if (bottle.size) score += 25;
  if (Number.isFinite(bottle.proof)) score += 8;
  if (getCatalogConfidence(bottle) === "verified") score += 50;
  if (getCatalogConfidence(bottle) === "cross-checked") score += 20;
  return score;
}

function toIndexBottle(bottle) {
  return compactObject({
    id: bottle.id,
    name: bottle.name,
    distillery: bottle.distillery === "Unknown producer" ? null : bottle.distillery,
    producer: bottle.producer,
    supplier: bottle.supplier,
    category: bottle.category,
    proof: bottle.proof,
    proofDisplay: bottle.proofDisplay,
    age: bottle.age,
    ageYears: bottle.ageYears,
    size: bottle.size,
    upc: bottle.upc,
    barcodes: bottle.barcodes || [],
    sourceRetailPrice: bottle.sourceRetailPrice,
    sourcePriceLabel: bottle.sourcePriceLabel,
    rarity: bottle.rarity,
    mashBill: bottle.mashBill === "Unknown" ? null : bottle.mashBill,
    imageTone: bottle.imageTone,
    aliases: bottle.aliases || [],
    profile: bottle.profile || [],
    bestFor: bottle.bestFor || [],
    reviewScore: bottle.reviewScore,
    hypeIndex: bottle.hypeIndex,
    story: bottle.story,
    catalogConfidence: getCatalogConfidence(bottle),
    sourceSummary: toIndexSourceSummary(bottle.sourceSummary),
    sourcePreview: (bottle.sourceRefs || []).slice(0, 4).map((sourceRef) => ({
      sourceId: sourceRef.sourceId,
      sourceRecordId: sourceRef.sourceRecordId
    }))
  });
}

function isConfidentAppBottle(bottle) {
  const summary = bottle.sourceSummary || buildSourceSummary(bottle);
  const sourceCount = summary.sourceCount || 0;
  const priceCount = summary.priceObservationCount || 0;
  const text = bottleSearchText(bottle);

  if (looksLikeNonWhiskeyBottle(bottle)) return false;
  if (hasTinyBottleSize(bottle)) return false;
  if (hasTruncatedDisplayName(bottle)) return false;
  if (hasWeakDisplayName(bottle)) return false;
  if (hasPromotionalDisplayName(bottle)) return false;
  if (hasConflictingAgeSignals(bottle)) return false;
  if (hasUncuratedWideProofRange(bottle)) return false;
  if (!hasWhiskeyIdentity(bottle, text)) return false;
  if (!hasKnownMaker(bottle)) return false;
  if (sourceCount >= 2) return true;
  if (priceCount >= 1 && bottle.size) return true;
  return false;
}

function hasTruncatedDisplayName(bottle) {
  return /\.\.\./.test(String(bottle.name || ""));
}

function hasWeakDisplayName(bottle) {
  const value = String(bottle.name || "").trim();
  if (!value) return true;
  if (/^\(?[a-z]{1,5}\)?\s*\d+(?:\.\d+)?\s*(?:ml|l)$/i.test(value)) return true;
  if (/^\d+(?:\.\d+)?\s*(?:ml|l)$/i.test(value)) return true;
  if (/^(?:bourbon|rye|whiskey|whisky|scotch)$/i.test(value)) return true;
  return false;
}

function hasTinyBottleSize(bottle) {
  const size = String(bottle.size || "").toLowerCase().replace(/\s+/g, "");
  return /^(?:50|100|187|200|250|300)ml$/.test(size);
}

function hasPromotionalDisplayName(bottle) {
  const value = String(bottle.name || "").trim().toLowerCase();
  if (!value) return false;
  const hasExplicitWhiskey = /\b(whisk(?:e)?y|whisky|bourbon|brbn|bbn|rye|scotch|tennessee|single\s+malt)\b/i.test(value);
  if (hasExplicitWhiskey) return false;
  return /\b(major\s+legal|soccer|football|basketball|baseball|display|promo(?:tional)?|souvenir)\b/i.test(value);
}

function hasConflictingAgeSignals(bottle) {
  if (!Number.isFinite(bottle.ageYears)) return false;
  const nameAge = getNameAgeSignal(bottle);
  return Number.isFinite(nameAge) && Math.abs(nameAge - bottle.ageYears) > 1;
}

function getNameAgeSignal(bottle) {
  const text = String(bottle.name || "");
  const match = text.match(/\b(\d{1,2}(?:\.\d+)?)\s*(?:years?|yrs?|yr|yo)\b/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function hasUncuratedWideProofRange(bottle) {
  if (isCuratedVariableProofRelease(bottle)) return false;
  const proofs = uniqueProofs([...(bottle.proofs || []), bottle.proof]);
  if (proofs.length < 2) return false;
  return proofs[proofs.length - 1] - proofs[0] >= 12;
}

function isCuratedVariableProofRelease(bottle) {
  const text = [
    bottle.name,
    ...(bottle.aliases || [])
  ].filter(Boolean).join(" ").toLowerCase();
  return /\bgeorge\s+t\.?\s+stagg\b/.test(text) &&
    !/\b(corazon|tequila|mezcal|anejo|a\u00f1ejo|reposado|blanco|rum|vodka|gin|cognac|brandy)\b/.test(text);
}

function getCatalogConfidence(bottle) {
  const summary = bottle.sourceSummary || buildSourceSummary(bottle);
  if (summary.sourceCount >= 2 && summary.priceObservationCount >= 1) return "verified";
  if (summary.sourceCount >= 2) return "cross-checked";
  return "priced-source";
}

function bottleSearchText(bottle) {
  return [
    bottle.name,
    bottle.category,
    bottle.producer,
    bottle.supplier,
    ...(bottle.aliases || [])
  ].filter(Boolean).join(" ").toLowerCase();
}

function hasWhiskeyIdentity(bottle, text) {
  const category = String(bottle.category || "").toLowerCase();
  return /\b(whisk(?:e)?y|whisky|bourbon|brbn|bbn|rye|scotch|tennessee|single\s+malt|sour\s+mash)\b/i.test(text) ||
    /\b(bourbon|rye|whiskey|whisky|scotch|tennessee|single\s+malt|canadian|irish|japanese|wheat)\b/i.test(category);
}

function hasKnownMaker(bottle) {
  return Boolean([bottle.distillery, bottle.producer, bottle.supplier]
    .map((value) => String(value || "").trim())
    .find((value) => value && value.toLowerCase() !== "unknown producer"));
}

function looksLikeNonWhiskeyBottle(bottle) {
  const productText = [
    bottle.name,
    ...(bottle.aliases || [])
  ].filter(Boolean).join(" ").toLowerCase();
  const fullText = bottleSearchText(bottle);
  const hasExplicitWhiskey = /\b(whisk(?:e)?y|whisky|bourbon|brbn|bbn|rye|scotch|tennessee|single\s+malt|sour\s+mash)\b/i.test(productText);
  if (/\b(corazon|tequila|mezcal|anejo|a\u00f1ejo|reposado|blanco|rum|vodka|gin|cognac|brandy)\b/i.test(productText) && !hasExplicitWhiskey) {
    return true;
  }
  return /\b(cocktail|cream|gift|glass|jigger|liqueur|mini(?:s|ature)?|moonshine|ready\s*to\s*(?:drink|serve|pour)|rtd|syrup|wine|beer|cider|seltzer)\b/i.test(fullText);
}

function toIndexSourceSummary(summary) {
  if (!summary) return null;
  return compactObject({
    sourceCount: summary.sourceCount,
    priceObservationCount: summary.priceObservationCount,
    minRetailPrice: summary.minRetailPrice,
    maxRetailPrice: summary.maxRetailPrice,
    regions: summary.regions || []
  });
}

function compactObject(value) {
  const result = {};
  for (const [key, fieldValue] of Object.entries(value)) {
    if (fieldValue === null || fieldValue === undefined || fieldValue === "") continue;
    if (Array.isArray(fieldValue) && fieldValue.length === 0) continue;
    result[key] = fieldValue;
  }
  return result;
}

function writeJsonFile(payload, outPath, options = {}) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const json = options.compact ? JSON.stringify(payload) : JSON.stringify(payload, null, 2);
  fs.writeFileSync(outPath, json + "\n");
}

function writeIndexScript(indexPayload, outPath) {
  const js = "(function attachImportedCatalogIndex(global) {\n" +
    "  global.BarrelImportedCatalogIndex = " + JSON.stringify(indexPayload) + ";\n" +
    "})(typeof window !== \"undefined\" ? window : globalThis);\n";
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, js);
}

function writeLegacyShim(outPath) {
  const js = "(function attachImportedCatalog(global) {\n" +
    "  global.BarrelImportedCatalog = { schemaVersion: 1, generatedAt: \"\", sourceCount: 0, bottleCount: 0, bottles: [] };\n" +
    "})(typeof window !== \"undefined\" ? window : globalThis);\n";
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, js);
}

async function main() {
  const args = parseArgs(process.argv);
  const inputFiles = resolveInputFiles(args);
  if (!inputFiles.length) {
    throw new Error("No import JSON files found. Pass --input files or place imports in data/imports.");
  }

  const payloads = inputFiles.map(readImportPayload);
  const appPayload = buildAppCatalogPayload(payloads);
  const indexPayload = buildIndexPayload(appPayload);
  writeJsonFile(appPayload, path.resolve(args.out));
  writeJsonFile(indexPayload, path.resolve(args.indexOut), { compact: true });
  writeIndexScript(indexPayload, path.resolve(args.indexJsOut));
  writeLegacyShim(path.resolve(args.legacyJsOut));
  process.stdout.write("Wrote " + appPayload.bottleCount + " source-backed bottles from " + inputFiles.length + " import file(s).\n");
  process.stdout.write("Wrote app catalog JSON, search index JSON, JS fallback, and legacy shim.\n");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = {
  buildAppCatalogPayload,
  buildIndexPayload,
  toAppBottle,
  toIndexBottle,
  writeJsonFile,
  writeIndexScript,
  writeLegacyShim
};
