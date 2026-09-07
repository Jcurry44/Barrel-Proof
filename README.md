# Barrel Proof

A private bourbon companion for the shelf you are building, the pours you
log, and the friends you drink with. Look up any bottle, keep your shelf
without typing, score pours blind or sighted, run blind flights for the room,
and settle head-to-heads with Showdown.

No accounts, no servers, no tracking. Everything you log stays on your phone.
It installs to the home screen like a native app and works offline.

Live at **https://jcurry44.github.io/Barrel-Proof/**

## Run it

Any static file server works. From the repo root:

```bash
python3 -m http.server 4173 --bind 127.0.0.1     # then open http://127.0.0.1:4173/
```

or `npx serve .` — or on Windows, double-click `start-barrel-proof.bat`.

Opening `index.html` straight from the file system also works (the catalog
loads from a JS fallback), but the service worker and offline cache need HTTP.

## Deploying

GitHub Pages serves the `main` branch from the repository root, and every
push to `main` redeploys within a minute. The service worker fetches app code
network-first, so friends get updates on their next launch without
reinstalling; the multi-megabyte catalog refreshes in the background.

## Share it with your group

Send the Pages link. On a phone the first open asks for a name, a proof
comfort level, and a few favorite flavors — thirty seconds — then:

- **Install it**: iPhone → Share → *Add to Home Screen*. Android → the browser's
  *Install app* / *Add to Home screen* prompt. It launches full-screen and offline.
- **Trade club cards**: More → Club → *Share my card* makes a link that carries
  your ratings, favorites, and shelf. Friends tap it and their app asks to add
  you. Re-share after a tasting night to update your card.
- **Share the app itself**: More → *Share the app*.

Everyone's data lives only on their own device. **Back up to a file** (More)
exports everything; **Restore from a backup** brings it onto a new phone.

## What it does

- **Bottles** — search 8,500+ bottles or scan the barcode. Each bottle card
  shows what it is, what state catalogs list it for, your pours, the room's
  rating, and your shelf status, and lets you log the price you saw. Results
  collapse the catalog's many spellings of one product into a single row.
- **For You** — a recommender seeded by your profile and sharpened by every
  pour, Showdown, and shelf status you log. It never puts an unbuyable bottle
  in the findable lane.
- **Shelf** — a tap-don't-type collection builder (pick your distilleries, tap
  what you own; batched lines like ECBP and Booker's expand into real
  batches), quick add for ripping through a cabinet, and value by house.
- **Tastings** — a flavor wheel, blind or sighted pours, batch tags, and a
  ratings view that shows the gap between what you score blind and sighted.
- **Showdown** — blind head-to-heads with tier-weighted Elo for bottles and
  distilleries, upsets surfaced, head-to-head records kept.
- **Night** — run a blind flight for the room: shuffled glasses, per-taster
  scores, a reveal, and a recap ready for the group chat.
- **Cocktails** — bar-grade specs matched to the active bottle.
- **Club** — friends' cards merge into the group signal on every scorecard.
- **Distilleries** — every bottle classified into its house and parent company
  with proof, style, and release analytics.

## Architecture

Vanilla JavaScript, no build step. Logic is separated from rendering and
covered by Node's built-in test runner.

| Path | Role |
|---|---|
| `index.html`, `styles.css` | app shell, self-hosted fonts (`fonts/`), premium responsive UI |
| `src/main.js` | boot: merge seed + imported catalog, migrate saved data, build the palate from the profile |
| `src/ui/render.js` | rendering and event wiring (bottom navigation, sheets, scorecard, every tab) |
| `src/logic/recommendation.js` | the Buy / Consider / Pass engine: price anchors, bands, allocation economics, evidence-weighted verdicts |
| `src/logic/palate.js` | learned palate profile, availability tiers, realistic pricing, the For You recommender |
| `src/logic/profile.js` | per-device profile (name, proof comfort, flavor leanings) and the palate it produces |
| `src/logic/collection.js` | batch lines, `lineKey` (wizard grouping) and `productKey` (search grouping) |
| `src/logic/families.js` | distillery taxonomy, classifier, attribute derivation, house analytics |
| `src/logic/club.js` | club cards, consensus, and compressed share links |
| `src/logic/showdown.js`, `night.js`, `ratings.js`, `cocktails.js`, `prices.js`, `barcode.js`, `research.js`, `reviews.js`, `catalog.js` | one concern each |
| `src/storage/store.js` | versioned localStorage state with migrations and id aliasing |
| `src/data/` | seed bottles, curated overlays, reviews, cocktails, bottle images, and the generated catalog index |
| `service-worker.js` | network-first app code, stale-while-revalidate catalog, offline shell |
| `tools/` | official-source importers and the catalog builder (see below) |
| `tests/` | `node --test tests/*.test.js` |

## Tests

```bash
node --test tests/*.test.js
```

GitHub Actions runs the suite on every push (`.github/workflows/ci.yml`).

## Catalog data

The visible catalog is generated from official state liquor authorities and
federal label registries (NC ABC, OHLQ, OLCC, Iowa ABD, Idaho, Utah DABS,
Michigan LCC, Alabama ABC, Montana DOR, Mississippi ABC, West Virginia ABCA,
Pennsylvania LCB, Wyoming, Maine Spirits, Montgomery County ABS, Vermont
802Spirits, LCBO, Texas TABC, Kentucky ABC, Connecticut, TTB COLA). Of ~25,700
raw records, the ~8,500 with a known maker and either a confirmed price or
cross-source identity ship in `src/data/imported-catalog-index.json`; the
rest stay in the (git-ignored) full catalog for audit work.

Rebuilding needs the raw exports under `data/raw/` and the importers in
`tools/` (see `docs/DATA_PIPELINE.md` for the per-source commands), then:

```bash
node tools/build-imported-catalog.js --input-dir data/imports \
  --out src/data/imported-catalog.json \
  --index-out src/data/imported-catalog-index.json \
  --index-js-out src/data/imported-catalog-index.js \
  --legacy-js-out src/data/imported-catalog.js \
  --prev-index src/data/imported-catalog-index.json
```

`node tools/slim-catalog-index.js` re-slims an already-built index (drops
redundant aliases and per-record previews) and rewrites the JS fallback.

Prices in the catalog are official list prices, not your local shelf. Log the
prices you see on a bottle's scorecard and the app anchors on those first.

## Price check (beta)

The Buy / Consider / Pass engine (`src/logic/recommendation.js`) is complete
and tested but ships switched off: More → *Price check · beta* turns it on
for one device (`?pricecheck=1` for one visit). Its price anchors are state
list prices from control states, which run below open-market shelves such as
New York's, so a fair local price can read as "Pass" until the group's own
sightings anchor it. Keep logging the prices you see; that data is what makes
it trustworthy.

## Maintainer tools

More → *Data tools* switches on the catalog quality queues (identity, proof,
and pricing flags; top-shelf hardening; DramValue match queue). Off by default
so friends never see them. `?dev=1` in the URL does the same for one visit.

## Accuracy

Bottle facts and list prices come from the sources above and from curated
records; list prices are not your local shelf. Corrections welcome.
