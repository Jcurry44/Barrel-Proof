(function attachClub(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.BarrelClub = factory();
  }
})(typeof self !== "undefined" ? self : this, function createClubModule() {
  const CARD_APP = "barrel-proof-club";
  const FAVORITE_THRESHOLD = 8.5;

  function average(values) {
    const clean = values.filter((value) => Number.isFinite(value));
    if (!clean.length) return null;
    return clean.reduce((sum, value) => sum + value, 0) / clean.length;
  }

  function round1(value) {
    return Math.round(value * 10) / 10;
  }

  function clampScore(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === "string" && value.trim() === "") return null;
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.min(10, n));
  }

  // Build a shareable "club card" from a person's own saved state: their tasting
  // scores become per-bottle ratings, their owned bottles become the shelf they
  // bring to the group, and their highest pours become their signature favorites.
  function buildCardFromState(state, palate) {
    const tastings = Array.isArray(state && state.tastings) ? state.tastings : [];
    const statuses = (state && state.statuses) || {};

    const scoresByBottle = {};
    for (const tasting of tastings) {
      const id = tasting && tasting.bottleId;
      const score = clampScore(tasting && tasting.score);
      if (!id || score === null) continue;
      (scoresByBottle[id] = scoresByBottle[id] || []).push(score);
    }

    const ratings = {};
    for (const id of Object.keys(scoresByBottle)) {
      const avg = average(scoresByBottle[id]);
      if (avg !== null) ratings[id] = round1(avg);
    }

    const owned = Object.keys(statuses).filter((id) => statuses[id] === "owned");

    const favorites = Object.keys(ratings)
      .map((id) => ({ id, score: ratings[id] }))
      .filter((entry) => entry.score >= FAVORITE_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((entry) => entry.id);

    return {
      source: CARD_APP,
      version: 1,
      name: cardName(palate),
      style: describeStyle(palate),
      ratings,
      favorites,
      owned
    };
  }

  function cardName(palate) {
    const name = palate && palate.name ? String(palate.name).trim() : "";
    return name.slice(0, 40) || "Me";
  }

  function describeStyle(palate) {
    const profiles = (palate && Array.isArray(palate.favoriteProfiles) ? palate.favoriteProfiles : [])
      .slice(0, 3)
      .join(", ");
    const proof = palate && Number.isFinite(Number(palate.proofPreference))
      ? "~" + Math.round(Number(palate.proofPreference)) + " proof"
      : "";
    return [proof, profiles].filter(Boolean).join(" · ") || "Bourbon drinker";
  }

  // Validate + sanitize an imported card so a malformed or hostile file can never
  // poison the club model. Returns null when the file is not a real club card.
  function normalizeCard(raw) {
    const card = raw && raw.card && typeof raw.card === "object" ? raw.card : raw;
    if (!card || typeof card !== "object") return null;
    if (card.source && card.source !== CARD_APP) return null;

    const name = String(card.name || "Friend").trim().slice(0, 40) || "Friend";
    const style = String(card.style || "Bourbon drinker").trim().slice(0, 120);

    const ratings = {};
    const rawRatings = card.ratings && typeof card.ratings === "object" ? card.ratings : {};
    for (const id of Object.keys(rawRatings)) {
      const score = clampScore(rawRatings[id]);
      if (score !== null) ratings[String(id)] = round1(score);
    }

    const favorites = (Array.isArray(card.favorites) ? card.favorites : [])
      .map((id) => String(id))
      .filter(Boolean)
      .slice(0, 12);
    const owned = (Array.isArray(card.owned) ? card.owned : [])
      .map((id) => String(id))
      .filter(Boolean);

    return { name, style, ratings, favorites, owned };
  }

  function sameName(a, b) {
    return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
  }

  // Add or replace a friend by name (re-importing a newer card updates in place).
  function mergeFriend(friends, card) {
    const list = Array.isArray(friends) ? friends.slice() : [];
    const index = list.findIndex((friend) => sameName(friend.name, card.name));
    if (index >= 0) list[index] = card;
    else list.push(card);
    return list;
  }

  function removeFriend(friends, name) {
    return (Array.isArray(friends) ? friends : []).filter((friend) => !sameName(friend.name, name));
  }

  // The group's view of one bottle: who rated it, the average, and the spread.
  function bottleConsensus(bottleId, friends) {
    const rated = (friends || [])
      .map((friend) => ({ name: friend.name, score: friend.ratings && friend.ratings[bottleId] }))
      .filter((entry) => Number.isFinite(entry.score));
    if (!rated.length) return null;
    const scores = rated.map((entry) => entry.score);
    return {
      count: rated.length,
      average: round1(average(scores)),
      high: Math.max(...scores),
      low: Math.min(...scores),
      raters: rated.sort((a, b) => b.score - a.score)
    };
  }

  // ---- Share links -----------------------------------------------------------
  // Swapping JSON files between phones is the worst part of a no-server club.
  // A card is small (name + ratings + favorites + owned ids), so it fits in a
  // link: deflate when the runtime has CompressionStream ("z." prefix), plain
  // JSON otherwise ("j." prefix), both base64url so the link survives chat apps.

  const TOKEN_PLAIN = "j.";
  const TOKEN_DEFLATE = "z.";

  function bytesToBase64Url(bytes) {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    const base64 = typeof btoa === "function" ? btoa(binary) : Buffer.from(binary, "binary").toString("base64");
    return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function base64UrlToBytes(text) {
    const base64 = String(text || "").replace(/-/g, "+").replace(/_/g, "/") + "===".slice((String(text || "").length + 3) % 4);
    const binary = typeof atob === "function" ? atob(base64) : Buffer.from(base64, "base64").toString("binary");
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  async function pipeThrough(bytes, stream) {
    const response = new Response(new Blob([bytes]).stream().pipeThrough(stream));
    return new Uint8Array(await response.arrayBuffer());
  }

  function compactCard(card) {
    return {
      n: card.name,
      s: card.style,
      r: card.ratings || {},
      f: card.favorites || [],
      o: card.owned || []
    };
  }

  function expandCard(compact) {
    if (!compact || typeof compact !== "object") return null;
    return normalizeCard({
      source: CARD_APP,
      name: compact.n,
      style: compact.s,
      ratings: compact.r,
      favorites: compact.f,
      owned: compact.o
    });
  }

  async function buildShareToken(card) {
    const clean = normalizeCard(card);
    if (!clean) throw new Error("not a club card");
    const json = JSON.stringify(compactCard(clean));
    const bytes = new TextEncoder().encode(json);
    if (typeof CompressionStream === "function" && typeof Response === "function" && typeof Blob === "function") {
      try {
        const packed = await pipeThrough(bytes, new CompressionStream("deflate-raw"));
        return TOKEN_DEFLATE + bytesToBase64Url(packed);
      } catch (error) {
        // fall through to the plain token
      }
    }
    return TOKEN_PLAIN + bytesToBase64Url(bytes);
  }

  async function parseShareToken(token) {
    const text = String(token || "").trim();
    if (!text) return null;
    try {
      let bytes;
      if (text.startsWith(TOKEN_DEFLATE)) {
        if (typeof DecompressionStream !== "function") return null;
        bytes = await pipeThrough(base64UrlToBytes(text.slice(TOKEN_DEFLATE.length)), new DecompressionStream("deflate-raw"));
      } else if (text.startsWith(TOKEN_PLAIN)) {
        bytes = base64UrlToBytes(text.slice(TOKEN_PLAIN.length));
      } else {
        return null;
      }
      const json = new TextDecoder().decode(bytes);
      return expandCard(JSON.parse(json));
    } catch (error) {
      return null;
    }
  }

  // The token rides in the URL hash so it never hits a server log:
  //   https://…/index.html#club=z.eJx…
  function buildShareUrl(baseUrl, token) {
    const base = String(baseUrl || "").split("#")[0];
    return base + "#club=" + token;
  }

  function extractShareToken(urlOrHash) {
    const text = String(urlOrHash || "");
    const match = text.match(/#club=([A-Za-z0-9._\-]+)/);
    return match ? match[1] : "";
  }

  return {
    CARD_APP,
    average,
    bottleConsensus,
    buildShareToken,
    buildShareUrl,
    extractShareToken,
    parseShareToken,
    buildCardFromState,
    describeStyle,
    mergeFriend,
    normalizeCard,
    removeFriend
  };
});
