# Barrel Proof

A premium bourbon-first whiskey decision companion for store buys, shelf
tracking, tastings, and private friend-group signals.

Serve the folder locally for the full catalog, offline shell cache, and clean
service-worker path. Direct `index.html` file opens still work through the
generated JS fallback, but browser service workers require HTTP(S).

From any PowerShell window:

```powershell
& "C:\Users\17162\OneDrive\Documents\New project\Barrel Proof\start-barrel-proof.bat"
```

Then open `http://127.0.0.1:4173/`.

## What It Does

- For You: a personal recommender that learns your palate from real use
  (tasting scores, Showdown results, what you own/pass) and recommends like a
  connoisseur, not a salesman. Two hard rules: it never puts an unbuyable bottle
  in the "Buy this" lane (allocated/unicorn bottles go to "Grails to chase",
  honestly framed), and it never quotes a price you won't actually pay.
- Build your shelf: a tap-don't-type collection wizard — pick your distilleries,
  walk each one tapping the bottles you own (with search + release filters).
  Batched lines (ECBP, Larceny BP, Stagg, Four Roses recipes, Booker's, BTAC)
  collapse to one card and expand into selectable real batches; store picks get
  a count stepper. The Shelf then shows counts, batches, and value by house.
- Real local pricing: log observed shelf prices per bottle; the buy/pass
  decision uses your observed median as the top reference, ahead of MSRP.
- Back up & restore: export your data to a dated file and import it on any
  device; reset is guarded behind a confirmation.
- Store Mode: search a bottle, enter the shelf price, and get a Buy / Consider /
  Pass recommendation. Faceted filters narrow the full catalog by whiskey type
  (Bourbon / Rye / Tennessee / Scotch / Irish) and release style (single barrel,
  small batch, bottled-in-bond, cask strength, wheated).
- Distilleries: every bottle is classified into its distillery and parent
  company (77+ known houses) with per-house analytics — proof, MSRP, hype, mash
  bill style mix, and release-type counts. Drill into a house for its full
  lineup, brand breakdown, and notable bottles; sort and filter by type. Each
  bottle's decision panel links straight to its distillery.
- Showdown (blind tasting lab): pour two bottles blind, pick a winner, and the
  lab keeps score with Elo ratings for bottles and distilleries. Tier-weighted
  scoring means beating a heavyweight counts for more than beating a daily pour,
  and "upsets" (a value bottle beating a pricier/hyped one) are surfaced while
  expected results add no noise. Head-to-head records show "you pick X over Y
  Z% of the time."
- Connoisseur data layer: derived whiskey type, mash-bill style, release flags
  (single barrel / bonded / cask strength / finished), proof tier, and a tier
  score shown on every bottle.
- Bottle visuals: real product photos where available (matched by UPC), with a
  premium data-driven illustration fallback (whiskey color by style/age, brass
  capsule, brand monogram) for the rest of the catalog.
- Bottle Scout Lite: copy a source-aware ChatGPT research prompt for the selected
  bottle without adding API cost or exposing an API key. The app checks database
  confidence first and makes Scout prominent only when meaningful facts are
  missing.
- Review Intelligence: displays cited editorial/community review takeaways only
  when real source URLs are attached; otherwise it offers a review-research
  prompt instead of inventing scores or notes.
- Cocktails: high-end bar specs for classic bourbon cocktails, with proof lane,
  glassware, ice, garnish, technique, and active-bottle fit scoring.
- Bottle cards with proof, age, source price, starter price references, profile
  tags, and friend signal when available.
- Shelf tracking for owned, wishlist, passed, and tasted bottles.
- Tasting notes with score, pour context, and flavor tags.
- Club view for friend palate signals once real friends/ratings are added.
- Local browser storage with a versioned data shape.

## Architecture

- `index.html` - static app shell.
- `styles.css` - premium responsive UI.
- `src/data/bottles.js` - seeded bottle catalog and default state.
- `src/data/friends.js` - private club ratings placeholder; starts empty until
  real friend data is added.
- `src/data/cocktails.js` - curated high-end bourbon cocktail specs.
- `src/data/reviews.js` - source-backed review summaries for curated bottles;
  every imported entry requires a real URL and compact paraphrased takeaways.
  Review aliases attach those canonical summaries to matching imported catalog
  variants without duplicating source text.
- `src/data/curated.js` - source-backed identity overlays for serious bottles
  whose raw state/catalog rows need connoisseur-grade names, makers, release
  facts, and review IDs.
- Secondary-market data is attached conservatively through curated records and
  the QA tab's DramValue Match Queue. Use it first for top-shelf/allocated
  bottles where MSRP alone would produce bad buy/pass guidance; do not blindly
  apply name-only DramValue matches across the full catalog.
- `src/data/imported-catalog.json` - full generated source-backed catalog from
  official imports for inspection and future tooling.
- `src/data/imported-catalog-index.json` - confidence-gated generated app/search
  index loaded on demand at boot.
- `src/data/imported-catalog-index.js` - generated direct-file fallback for
  browsers that cannot fetch local JSON.
- `src/data/imported-catalog.js` - legacy compatibility shim; intentionally not
  the app catalog.
- `src/data/bottle-images.js` - generated UPC/barcode -> real product image map
  (currently from LCBO) attached at boot so real photos land on the right bottle.
- `src/logic/catalog.js` - source-aware normalization, identity keys, search text,
  and merge helpers.
- `src/logic/families.js` - distillery/parent-company taxonomy + classifier,
  connoisseur attribute derivation (style, release flags, whiskey type, proof
  tier), and the house analytics aggregator (`buildIndex`).
- `src/logic/showdown.js` - blind-tasting engine: tier scoring, matchup outlook,
  Elo ratings for bottles and distilleries, head-to-head records, and upset
  detection.
- `src/logic/palate.js` - personal recommender: learned palate profile (from
  tastings / Showdown / statuses), availability tiers (shelf / allocated /
  unicorn), realistic pricing, and the two-lane For You recommender.
- `src/logic/collection.js` - tap-don't-type collection model: curated batch
  lists, release-line collapse/classification, and count/batch mutators that
  keep statuses[owned] in sync.
- `src/logic/prices.js` - observed shelf-price log (median/min/max per bottle).
- `src/logic/recommendation.js` - pure buy/pass recommendation logic; uses your
  observed prices as the top reference when present.
- `src/logic/research.js` - no-cost source-aware research prompt builder.
- `src/logic/reviews.js` - cited review-summary model and review-research prompt
  builder.
- `src/logic/cocktails.js` - cocktail fit scoring and spec formatting.
- `src/storage/store.js` - localStorage load/save/export helpers.
- `src/ui/render.js` - DOM rendering and event wiring.
- `src/main.js` - app boot.
- `service-worker.js` - caches the shell and compact catalog index for installed
  app/offline resilience.
- `tools/import-nc-abc.js` - official NC ABC price-list importer for
  retail-priced serious whiskey rows.
- `tools/import-nc-abc-warehouse.js` - official NC ABC daily warehouse stock
  importer for listing status, availability, full brand names, and serious
  whiskey stock coverage.
- `tools/import-ohlq.js` - official Ohio Liquor Brand Master importer for
  price-backed serious whiskey rows.
- `tools/import-olcc.js` - official Oregon monthly pricing importer for
  retail-priced serious whiskey rows.
- `tools/import-iowa-abd.js` - official Iowa Liquor Products importer with
  UPCs, proof, age, and retail prices for serious whiskey rows.
- `tools/import-idaho-liquor.js` - official Idaho category price-book importer
  with proof, retail prices, and serious whiskey category coverage.
- `tools/import-utah-dabs.js` - official Utah DABS product-list importer for
  retail-priced serious whiskey rows.
- `tools/import-michigan-lcc.js` - official Michigan LCC price-book importer
  with UPCs, proof, shelf prices, and serious whiskey category coverage.
- `tools/import-alabama-abc.js` - official Alabama ABC quarterly price-list
  importer with parsed proof, age, size, serious whiskey category coverage, and
  allocation/closeout sections.
- `tools/import-montana-dor.js` - official Montana DOR price-disk importer
  with product class codes, monthly bottle prices, and serious whiskey category
  coverage.
- `tools/extract-pdf-text.py` - utility for extracting embedded text from
  official PDF sources.
- `tools/import-mississippi-abc.js` - official Mississippi ABC SPA/price-change
  importer with bottle-cost observations.
- `tools/import-wv-abca.js` - official West Virginia ABCA liquor-search
  importer with product IDs, bottle-size variants, and serious whiskey category
  coverage.
- `tools/import-pa-lcb.js` - official Pennsylvania LCB wholesale spirits
  catalog importer with retail prices, proof, UPC columns, and serious whiskey
  category coverage.
- `tools/fetch-wyoming-liquor.ps1` - official Wyoming Liquor Division
  Liquor365 category fetcher.
- `tools/import-wyoming-liquor.js` - Wyoming Liquor Division importer with
  serious domestic whiskey coverage, case-pack list prices, and derived bottle
  estimates.
- `tools/import-maine-spirits.js` - official Maine Spirits master price-list
  importer with UPCs, proof, retail prices, sale prices, effective dates, and
  serious whiskey category coverage.
- `tools/import-montgomery-county-abs.js` - official Montgomery County ABS
  price-book importer with wholesale bottle prices and supplier fields.
- `tools/import-montgomery-county-abs-inventory.js` - official Montgomery
  County ABS open-data inventory importer with retail price, total inventory,
  and serious whiskey category coverage.
- `tools/import-vermont-802.js` - official Vermont 802Spirits complete
  price-list importer with proof, retail price, sale price, status, and serious
  whiskey category coverage.
- `tools/import-texas-tabc.js` - official Texas TABC approved-label importer
  for serious whiskey registrations with certificate links, TTB numbers,
  ABV/proof, and trade names.
- `tools/import-kentucky-abc.js` - official Kentucky ABC active-brands
  importer for serious whiskey registrations with approval numbers, TTB COLA
  IDs, ABV/proof, and distributors.
- `tools/import-connecticut-liquor-brands.js` - official Connecticut Liquor
  Brands importer for serious whiskey registrations, including rye, wheat
  whiskey, wheated bourbon, Canadian whisky, and world whisky categories.
- `tools/import-lcbo-whisky.js` - official LCBO whisky catalog importer for
  Ontario product identity, UPC, ABV/proof, size, product URL, CAD price
  metadata, and inventory flags.
- `tools/import-ttb-cola.js` - official TTB COLA search-results CSV importer.
- `tools/xlsx.js` - small XLSX reader used by importers that consume official
  workbooks.
- `tools/build-imported-catalog.js` - combines source imports into the full
  catalog JSON, compact app index, direct-file fallback, and legacy shim.
- `tools/build-bottle-images.js` - harvests real product image URLs from the
  imports (keyed by UPC/barcode) into `src/data/bottle-images.js`.
- `data/sources.json` - source registry.
- `docs/DATA_PIPELINE.md` - source and warehouse plan.
- `tests/*.test.js` - focused Node tests.

## Tests

```powershell
node --test tests\*.test.js
```

## Import Official Catalog Data

Save the official NC ABC price-list HTML under `data/raw/nc-abc/`, then run:

```powershell
node tools/import-nc-abc.js --input data\raw\nc-abc\price-list-current.html --out data\imports\nc-abc-bourbon-current.json
node tools/import-nc-abc-warehouse.js --input data\raw\nc-abc\warehouse-stock-current.html --price-list data\raw\nc-abc\price-list-current.html --out data\imports\nc-abc-warehouse-current.json
```

Save official TTB COLA Registry search-result CSV exports under
`data/raw/ttb-cola/`, then run:

```powershell
node tools/import-ttb-cola.js --input-dir data\raw\ttb-cola --out data\imports\ttb-cola-bourbon-current.json
```

Save the official OHLQ Brand Master JSON under `data/raw/ohlq/`, then run:

```powershell
node tools/import-ohlq.js --input data\raw\ohlq\brandmaster-current.json --out data\imports\ohlq-bourbon-current.json
```

Save the official OLCC Monthly Pricing CSV under `data/raw/olcc/`, then run:

```powershell
node tools/import-olcc.js --input data\raw\olcc\monthly-pricing-current.csv --out data\imports\olcc-bourbon-current.json
```

Save the official Iowa Liquor Products JSON under `data/raw/iowa-abd/`, then
run:

```powershell
node tools/import-iowa-abd.js --input data\raw\iowa-abd\products-current.json --out data\imports\iowa-abd-bourbon-current.json
```

Save the official Idaho numerical monthly price-list PDF text extract under
`data/raw/idaho-liquor/`, then run:

```powershell
node tools/import-idaho-liquor.js --input data\raw\idaho-liquor\text\0626-numerical-monthly-price-list.txt --out data\imports\idaho-liquor-bourbon-current.json
```

Save the official Utah DABS Product List XLSX under `data/raw/utah-dabs/`, then
run:

```powershell
node tools/import-utah-dabs.js --input data\raw\utah-dabs\May-2026-Product-List-FY26-P11.xlsx --out data\imports\utah-dabs-bourbon-current.json
```

Save the official Michigan LCC Spirits Price Book TXT under
`data/raw/michigan-lcc/`, then run:

```powershell
node tools/import-michigan-lcc.js --input data\raw\michigan-lcc\may-3-2026-price-book.txt --out data\imports\michigan-lcc-bourbon-current.json
```

Save the official Alabama ABC Quarterly Price List XLSX under
`data/raw/alabama-abc/`, then run:

```powershell
node tools/import-alabama-abc.js --input data\raw\alabama-abc\january-2026-alabama-select-spirits-pricelist.xlsx --out data\imports\alabama-abc-bourbon-current.json
```

Save the official Montana DOR Price Disk XLSX under `data/raw/montana-dor/`,
then run:

```powershell
node tools/import-montana-dor.js --input data\raw\montana-dor\price-disk-may-2026.xlsx --out data\imports\montana-dor-bourbon-current.json
```

Save the official Mississippi ABC SPA and Bailment Price Change PDFs under
`data/raw/mississippi-abc/`, extract text, then run:

```powershell
& 'C:\Users\17162\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' tools\extract-pdf-text.py --input-dir data\raw\mississippi-abc --out-dir data\raw\mississippi-abc\text
node tools/import-mississippi-abc.js --input-dir data\raw\mississippi-abc\text --out data\imports\mississippi-abc-bourbon-current.json
```

Save the official West Virginia ABCA Liquor Search JSON result sets under
`data/raw/wv-abca/`, then run:

```powershell
node tools/import-wv-abca.js --input-dir data\raw\wv-abca --out data\imports\wv-abca-bourbon-current.json
```

Save the official Pennsylvania LCB Wholesale Spirits Catalog XLSX under
`data/raw/pa-lcb/`, then run:

```powershell
node tools/import-pa-lcb.js --input data\raw\pa-lcb\wholesale-spirits-catalog-full.xlsx --out data\imports\pa-lcb-bourbon-current.json
```

Fetch and import the official Wyoming Liquor Division Liquor365 domestic whiskey
category:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\tools\fetch-wyoming-liquor.ps1
node tools/import-wyoming-liquor.js --input data\raw\wyoming-liquor\whiskey-domestic-products.json --out data\imports\wyoming-liquor-bourbon-current.json
```

Save the official Maine Spirits Master Price List XLSX under
`data/raw/maine-spirits/`, then run:

```powershell
node tools/import-maine-spirits.js --input data\raw\maine-spirits\may-2026-master-price-list-revised.xlsx --out data\imports\maine-spirits-bourbon-current.json
```

Save the official Montgomery County ABS Price Book PDF under
`data/raw/montgomery-county-abs/`, extract text, then run:

```powershell
& 'C:\Users\17162\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' tools\extract-pdf-text.py --input-dir data\raw\montgomery-county-abs --out-dir data\raw\montgomery-county-abs\text
node tools/import-montgomery-county-abs.js --input data\raw\montgomery-county-abs\text\pricebook.txt --out data\imports\montgomery-county-abs-bourbon-current.json
```

Save the official Montgomery County ABS Store Inventory and Sale Items JSON
export under `data/raw/montgomery-county-abs/`, then run:

```powershell
node tools/import-montgomery-county-abs-inventory.js --input data\raw\montgomery-county-abs\inventory-current.json --out data\imports\montgomery-county-abs-inventory-bourbon-current.json
```

Save the official Vermont 802Spirits Complete Price List PDF under
`data/raw/vermont-802/`, extract text, then run:

```powershell
& 'C:\Users\17162\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' tools\extract-pdf-text.py --input-dir data\raw\vermont-802 --out-dir data\raw\vermont-802\text
node tools/import-vermont-802.js --input data\raw\vermont-802\text\2026-may-complete-list.txt --out data\imports\vermont-802-bourbon-current.json
```

Save Texas Open Data approved-label JSON exports under `data/raw/texas-tabc/`,
then run:

```powershell
node tools/import-texas-tabc.js --input-dir data\raw\texas-tabc --out data\imports\texas-tabc-bourbon-current.json
```

Save Kentucky ABC Active Brands summary-export XLSX files under
`data/raw/kentucky-abc/`, then run:

```powershell
node tools/import-kentucky-abc.js --input-dir data\raw\kentucky-abc --out data\imports\kentucky-abc-bourbon-current.json
```

Save Connecticut Liquor Brands JSON exports under
`data/raw/connecticut-liquor-brands/`, then run:

```powershell
node tools/import-connecticut-liquor-brands.js --input-dir data\raw\connecticut-liquor-brands --out data\imports\connecticut-liquor-brands-current.json
```

Save the official LCBO whisky category page and Coveo result JSON pages under
`data/raw/lcbo/`, then run:

```powershell
node tools/import-lcbo-whisky.js --input-dir data\raw\lcbo --out data\imports\lcbo-whisky-current.json
```

Build the app catalog from every import JSON:

```powershell
node tools/build-imported-catalog.js --input-dir data\imports --out src\data\imported-catalog.json --index-out src\data\imported-catalog-index.json --index-js-out src\data\imported-catalog-index.js --legacy-js-out src\data\imported-catalog.js
```

The source-backed pipeline currently builds 25,851 raw canonical bottle records
from NC ABC, OHLQ, OLCC, Iowa ABD, Idaho Liquor, Utah DABS, Michigan LCC,
Alabama ABC, Montana DOR, Mississippi ABC, West Virginia ABCA, Pennsylvania LCB,
Wyoming Liquor Division, Maine Spirits, and Montgomery County ABS price/inventory
sources, Vermont 802Spirits, LCBO, Texas TABC approved-label records, Kentucky
ABC active-brand registrations, and Connecticut Liquor Brands registrations for
serious whiskey categories beyond bourbon. The visible app/search index is
confidence-gated to 9,583 records: rows must look like serious whiskey, have a
known maker or inferred house, and either cross-source confirmation or source
price/size evidence. Low-confidence raw rows stay in the full generated catalog
for audit work, but they do not crowd Store Mode. The canonical builder merges
compatible source rows so duplicate source spellings like 1792 Sweet Wheat become
one app bottle while preserving source counts, regions, and price observations.
TTB, TABC, Kentucky ABC, and
Connecticut imports add
label-approval/registration identity and release discovery records; they do not
include retail prices. LCBO prices are Canadian-dollar source metadata and are
not used as U.S. retail price observations. WV ABCA imports add product identity and bottle-size
coverage; they do not include retail prices. NC ABC warehouse imports add
listing status and daily stock availability; they do not include retail prices.
Mississippi prices are ABC bottle-cost observations, not consumer shelf retail.
Wyoming prices are bottle-level estimates derived from Liquor365 case-pack list
prices. Montgomery County ABS price-book prices are wholesale bottle prices;
Montgomery County ABS inventory and Vermont 802Spirits prices are retail
observations.

## Current Limitations

- Real bottle catalog starter data only; no fake friend ratings, fake tasting
  history, or demo barcode/UPC lookup codes are included.
- Barcode and label scanning are disabled until a real barcode/product or
  label-recognition source is connected.
- Starter price references are sample values and should be treated as
  placeholders until matched to source imports.
- Distillery classification covers ~58% of the catalog to a known house; the
  remainder fall back to their own label/producer text. Real product photos
  currently cover the UPC-matched subset; the rest use the illustration.

## Next Planned

- Expand distillery classification coverage and curated real photos for the
  most-viewed bottles.
- Showdown: per-flavor-profile preference breakdowns and exportable results.
- Optional barcode/label scanning once a real recognition source is connected.
