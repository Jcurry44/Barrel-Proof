# Barrel Proof Data Pipeline

The database should grow from source-backed records, not copied app lists. It is
bourbon-first, but rye, wheat whiskey, Canadian whisky, American single malt,
world whisky, and other serious whiskey categories are first-class lanes.

## Source Priority

1. **Official identity sources**
   - TTB COLA Public Registry
   - state product registration systems
   - producer product pages

2. **Official retail/catalog sources**
   - control-state catalogs such as NC ABC, OHLQ, Virginia ABC, Pennsylvania,
     and similar public catalogs
   - fields such as supplier, product name, age, proof, size, and retail price

3. **First-party user data**
   - shelf prices
   - store sightings
   - batch and barrel-pick details
   - personal and friend tasting notes

## Record Layers

- `source record`: one row exactly as a source presented it.
- `normalized bottle`: cleaned product identity derived from source records.
- `price observation`: a price tied to a source, region, size, and timestamp.
- `user observation`: first-party shelf/sighting/tasting data.
- `canonical bottle`: merged identity used by the app after deduplication.

## Importers

NC ABC importer:

```powershell
node tools/import-nc-abc.js --input data\raw\nc-abc\price-list-current.html --out data\imports\nc-abc-bourbon-current.json
```

The importer reads the official current price-list HTML and writes:

- `records`: source rows with NC code, supplier, age, proof, size, and retail price
- `bottles`: normalized, deduplicated bottle identities
- `source`: source metadata
- `retrievedAt`: import timestamp

The default NC import now keeps serious whiskey rows across bourbon,
bottled-in-bond bourbon, rye, Tennessee whiskey, Scotch, Irish whiskey, Canadian
whisky, Japanese whisky, American single malt, corn whiskey, wheat whiskey, and
related American whiskey rows. It rejects flavored whiskey, RTDs, cream/liqueur
rows, and tequila/cognac/vodka/gin false positives from special-package and
local-product sections.

NC ABC Warehouse Stock importer:

```powershell
node tools/import-nc-abc-warehouse.js --input data\raw\nc-abc\warehouse-stock-current.html --price-list data\raw\nc-abc\price-list-current.html --out data\imports\nc-abc-warehouse-current.json
```

The importer reads the official daily NC ABC warehouse stock report and writes:

- `records`: source rows with NC code, full stock-report brand name, listing
  type, total available cases, size, cases per pallet, supplier allotment, broker
  name, detail URL, report date, and source file references
- `bottles`: normalized bottle identities with no retail price observations
- `sourceFiles`: the saved warehouse report and price-list HTML used
- `source`: source metadata
- `retrievedAt`: import timestamp

The warehouse report is a current inventory/listing source, not a price book.
When a warehouse NC code matches the saved price list, the importer hydrates
proof, age, and category from that official price-list row while keeping the
warehouse source as no-price availability data. Broad mixed sections such as
`Special Packages` and `North Carolina Products` only pass when the bottle name
has a serious-whiskey signal or trusted whiskey brand signal.

OHLQ Brand Master importer:

```powershell
node tools/import-ohlq.js --input data\raw\ohlq\brandmaster-current.json --out data\imports\ohlq-bourbon-current.json
```

The importer reads the official Ohio Liquor Brand Master JSON and writes:

- `records`: source rows with OHLQ code, product name, category, type, subtype,
  size, status, retail price, and wholesale price
- `bottles`: normalized bottle identities with OHLQ retail price observations
- `source`: source metadata
- `retrievedAt`: import timestamp

OHLQ is strong for Ohio product codes, uniform state pricing, and active/special
order/delisted status. It does not include proof or producer/distillery, so those
fields should come from another source before the app treats them as known.
The default import now keeps serious whiskey categories beyond bourbon,
including rye, wheated bourbon, wheat whiskey, Tennessee whiskey, American
whiskey, American single malt, Canadian whisky, Scotch, Irish, Japanese, and
world whisky rows, while filtering flavored whiskey, moonshine, RTDs, and
gift/VAP rows.

OLCC Monthly Pricing importer:

```powershell
node tools/import-olcc.js --input data\raw\olcc\monthly-pricing-current.csv --out data\imports\olcc-bourbon-current.json
```

The importer reads the official Oregon monthly pricing CSV and writes:

- `records`: source rows with item code, extended item code, product name,
  Oregon status, normalized app category, source category, size, age, proof,
  price per bottle, and monthly as-of date
- `bottles`: normalized bottle identities with OLCC retail price observations
- `asOfDates`: the pricing month(s) included in the import
- `source`: source metadata
- `retrievedAt`: import timestamp

The default OLCC import keeps the latest as-of month in the downloaded file.
Use `--all-dates` only when building price history, because otherwise older rows
will inflate the app catalog with dated duplicate observations.
It now imports serious whiskey rows across bourbon, rye, wheated bourbon, wheat
whiskey, Tennessee whiskey, American whiskey, Canadian whisky, Scotch, Irish,
Japanese, and world whisky categories while rejecting flavored whiskey,
liqueurs, cocktails, low-proof whiskey cocktails, and non-whiskey spirits.

Iowa ABD Liquor Products importer:

```powershell
node tools/import-iowa-abd.js --input data\raw\iowa-abd\products-current.json --out data\imports\iowa-abd-bourbon-current.json
```

The importer reads Iowa's official Socrata product table and writes:

- `records`: source rows with item number, product name, category, vendor, age,
  proof, size, UPC, state bottle cost, state case cost, state bottle retail, and
  report date
- `bottles`: normalized bottle identities with Iowa retail and UPC observations
- `source`: source metadata
- `retrievedAt`: import timestamp

The default Iowa import now keeps serious whiskey rows with UPC and retail
coverage: bourbon, bottled-in-bond bourbon, rye, wheated bourbon, wheat whiskey,
Tennessee whiskey, American whiskey, Canadian whisky, Scotch, Irish, Japanese,
and world whisky. It rejects whiskey liqueurs, flavored whiskey, moonshine,
RTDs, and gift/glass pack rows.

Idaho State Liquor Division numerical monthly price-list importer:

```powershell
node tools/import-idaho-liquor.js --input data\raw\idaho-liquor\text\0626-price-book-category.txt --out data\imports\idaho-liquor-bourbon-current.json
```

The importer reads text extracted from Idaho's official category monthly
price-book PDF
and writes:

- `records`: source rows with state product code, source category, product
  name, proof, pack, size, retail price, licensee price, and effective pricing
  period
- `bottles`: normalized bottle identities with Idaho price observations
- `source`: source metadata
- `retrievedAt`: import timestamp

Idaho is a PDF source, so it is less structured than JSON or CSV. Keep the PDF
and extracted text together under `data/raw/idaho-liquor/`, and treat parser
changes cautiously. The current import uses the June 2026 category monthly
price book and keeps serious whiskey rows across bourbon, bottled-in-bond
bourbon, rye, Tennessee whiskey, Scotch, Canadian whisky, Irish whiskey,
Japanese whisky, American single malt, wheat whiskey, corn whiskey, and related
American whiskey categories while excluding flavored whiskey, cream/liqueur
rows, moonshine, RTDs, and gift/accessory packs.

TTB COLA importer:

```powershell
node tools/import-ttb-cola.js --input-dir data\raw\ttb-cola --out data\imports\ttb-cola-bourbon-current.json
```

The importer reads official CSV exports saved from TTB Public COLA Registry
search results and writes:

- `records`: source rows with TTB ID, permit number, serial number, completed
  date, brand name, fanciful name, origin, and class/type
- `bottles`: label-approval identity records with source references and direct
  COLA detail URLs
- `sourceFiles`: the local CSV exports used
- `source`: source metadata
- `retrievedAt`: import timestamp

TTB exports are label records, not retail catalogs. They are best for product
identity, release discovery, and COLA detail links. They should be paired with
control-state catalogs, user sightings, or producer pages before the app treats a
bottle as buy-decision ready.

Utah DABS Product List importer:

```powershell
node tools/import-utah-dabs.js --input data\raw\utah-dabs\May-2026-Product-List-FY26-P11.xlsx --out data\imports\utah-dabs-bourbon-current.json
```

The importer reads the official Utah DABS product-list spreadsheet and writes:

- `records`: source rows with CSC product code, description, normalized app
  category, source category/class codes, size, retail price, item status,
  special pricing flag, and vendor
- `bottles`: normalized bottle identities with Utah retail price observations
- `source`: source metadata
- `retrievedAt`: import timestamp

The default Utah import keeps serious-whiskey classes across bourbon, Tennessee
whiskey, rye, Scotch, Canadian whisky, Irish whiskey, miscellaneous imported
whisky, domestic whiskey, and blended whiskey. It excludes the flavored whiskey
class plus non-whiskey products, while still requiring official whiskey classes
so bourbon-barrel wines and similar false positives stay out.

Michigan LCC Spirits Price Book importer:

```powershell
node tools/import-michigan-lcc.js --input data\raw\michigan-lcc\may-3-2026-price-book.txt --out data\imports\michigan-lcc-bourbon-current.json
```

The importer reads the official Michigan tab-delimited spirits price book and
writes:

- `records`: source rows with liquor code, product name, authorized distributor,
  vendor, liquor type, proof, size, UPC, on-premise price, off-premise price,
  shelf price, and effective date
- `bottles`: normalized bottle identities with Michigan shelf price and UPC
  observations
- `source`: source metadata
- `retrievedAt`: import timestamp

The default Michigan import now keeps serious whiskey rows across bourbon,
bottled-in-bond bourbon, rye, wheated bourbon, wheat whiskey, Tennessee whiskey,
American whiskey, Canadian whisky, Scotch, Irish, Japanese, and world whisky
categories. It rejects creams, prepared cocktails, liqueurs, flavored novelty
whiskey, low-proof whiskey cocktails, and non-whiskey spirits while preserving
legitimate cask-finished whiskey rows.

Alabama ABC Quarterly Price List importer:

```powershell
node tools/import-alabama-abc.js --input data\raw\alabama-abc\january-2026-alabama-select-spirits-pricelist.xlsx --out data\imports\alabama-abc-bourbon-current.json
```

The importer reads the official Alabama ABC quarterly price-list workbook and
writes:

- `records`: source rows with ABC product number, product name, source
  sheet/section, normalized serious whiskey category, pack, bottle price, case
  price, closeout price fields, proof parsed from the product name, age parsed
  from the product name, and size parsed from the product name
- `bottles`: normalized bottle identities with Alabama retail price observations
- `source`: source metadata
- `retrievedAt`: import timestamp

Alabama is less structured than the JSON/TSV sources. The default import now
keeps serious whiskey rows across bourbon, bottled-in-bond bourbon, rye,
Tennessee whiskey, American whiskey, American single malt, wheat whiskey,
Canadian whisky, Scotch, Irish whiskey, Japanese whisky, and world whisky. It
uses source sections when they are specific and name/brand gates for broad
allocated, luxury, LTO, new-product, and closeout sections. It excludes bourbon
creams, liqueurs, RTD cocktails, moonshine, flavored whiskey, gift/accessory
packs, and non-whiskey spirits.

Montana DOR Price Disk importer:

```powershell
node tools/import-montana-dor.js --input data\raw\montana-dor\price-disk-may-2026.xlsx --out data\imports\montana-dor-bourbon-current.json
```

The importer reads Montana's official monthly price disk and writes:

- `records`: source rows with item code, month, product class, NABCA number,
  size code, product name, units per case, bottle price, inventory class,
  maintained flag, repack fields, proof parsed from the product name, age parsed
  from the product name, and normalized size
- `bottles`: normalized bottle identities with Montana monthly price observations
- `source`: source metadata
- `retrievedAt`: import timestamp

The default Montana import now uses product class codes for serious whiskey
coverage across bourbon, bottled-in-bond bourbon, Tennessee whiskey, rye,
American whiskey, Canadian whisky, Scotch, Irish whiskey, Japanese whisky, and
world whisky. It keeps legitimate specialty/cask-finished whiskey rows while
excluding samples, trade-show cases, liqueurs, cocktails, moonshine, flavored
novelty whiskey, and low-seriousness specialty products.

Mississippi ABC 2026 SPA and Bailment Price Change importer:

```powershell
& 'C:\Users\17162\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' tools\extract-pdf-text.py --input-dir data\raw\mississippi-abc --out-dir data\raw\mississippi-abc\text
node tools/import-mississippi-abc.js --input-dir data\raw\mississippi-abc\text --out data\imports\mississippi-abc-bourbon-current.json
```

The extractor reads embedded text from official Mississippi DOR/ABC PDF
documents. The importer writes:

- `records`: filtered source rows with item code, source category, product name,
  size, units per case, effective date, document type, bottle cost, SPA bottle
  cost when applicable, status/change fields, proof/age parsed from the name,
  and source file
- `bottles`: normalized bottle identities with Mississippi ABC bottle-cost
  observations
- `sourceFiles`: extracted text files used
- `source`: source metadata
- `retrievedAt`: import timestamp

The default Mississippi import keeps straight bourbon, bottled-in-bond bourbon,
Tennessee whiskey, and bourbon-labeled whiskey rows while rejecting rye-only,
flavored, RTD, liqueur, wine, and other non-bourbon false positives. These are
ABC bottle-cost observations from SPA/price-change documents, not consumer shelf
retail prices and not a full current catalog.

West Virginia ABCA Liquor Search importer:

```powershell
node tools/import-wv-abca.js --input-dir data\raw\wv-abca --out data\imports\wv-abca-bourbon-current.json
```

The importer reads saved JSON result sets from the official WV ABCA liquor
search and writes:

- `records`: source rows with product ID, configuration ID, product name, raw
  bottle-size list, normalized size variant, search terms, and source files
- `bottles`: normalized bottle identities with WV ABCA source references
- `sourceFiles`: the saved WV ABCA search-result JSON files used
- `source`: source metadata
- `retrievedAt`: import timestamp

WV ABCA is a product-search source, not a price book. It adds source-backed
identity coverage and bottle sizes, but it should not be used as a shelf-price
source. The default import keeps serious whiskey rows across bourbon, rye,
Tennessee whiskey, American whiskey, American single malt, wheat whiskey,
Canadian whisky, Scotch, Irish whiskey, Japanese whisky, and broad whisky search
coverage while rejecting creams, RTD cocktails, flavored products, gift packs,
vodka, and other false positives.

Pennsylvania LCB Wholesale Spirits Catalog importer:

```powershell
node tools/import-pa-lcb.js --input data\raw\pa-lcb\wholesale-spirits-catalog-full.xlsx --out data\imports\pa-lcb-bourbon-current.json
```

The importer reads Pennsylvania's official wholesale spirits catalog workbook
and writes:

- `records`: source rows with PLCB item number, SCC values, item description,
  class/group, liquid volume, case pack, current regular retail, promotion
  fields, proof, UPCs, country, and source row count
- `bottles`: normalized bottle identities with Pennsylvania retail price and
  UPC observations
- `source`: source metadata
- `retrievedAt`: import timestamp

The default Pennsylvania import now keeps serious whiskey rows from the
Pennsylvania `Whiskey` group across bourbon, rye, Scotch, Canadian whisky, Irish
whiskey, and curated `Other` whiskey records such as Tennessee whiskey, wheat
whiskey, American single malt, Japanese whisky, and American whiskey. It rejects
flavored whiskey, cocktail/RTD rows, low-proof whiskey cocktails,
gift/accessory bundles, multi-packs, and non-whiskey products.
Repeated SCC/case rows are deduplicated into one bottle-size record per PLCB
item while retaining all observed UPCs and SCC references.

Wyoming Liquor Division Liquor365 importer:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\tools\fetch-wyoming-liquor.ps1
node tools/import-wyoming-liquor.js --input data\raw\wyoming-liquor\whiskey-domestic-products.json --out data\imports\wyoming-liquor-bourbon-current.json
```

The fetcher reads the official Liquor365 domestic whiskey category pages and
writes a compact raw JSON extraction. The importer then writes:

- `records`: filtered source rows with item number, product URL, category,
  parsed package/size, case pack, source list price, derived bottle estimate,
  availability label, source notes, proof/age parsed from the name, and source
  page references
- `bottles`: normalized bottle identities with Wyoming source references and
  bottle-level list estimates derived from case-pack pricing
- `source`: source metadata
- `retrievedAt`: source extraction timestamp

The default Wyoming import now keeps serious domestic whiskey rows across
bourbon, rye, Tennessee whiskey, American whiskey, blended whiskey, American
single malt, wheat whiskey, corn whiskey, and Canadian whisky. It rejects
obvious gift packs, flavored products, RTDs, multi-pack samplers, and accessory
bundles, and labels prices as derived estimates because Liquor365 publishes
case-pack list prices.

Maine Spirits Master Price List importer:

```powershell
node tools/import-maine-spirits.js --input data\raw\maine-spirits\may-2026-master-price-list-revised.xlsx --out data\imports\maine-spirits-bourbon-current.json
```

The importer reads Maine Spirits' official master price-list workbook and
writes:

- `records`: filtered source rows with item number, product name, size, units,
  proof, product category, UPC, agency cost, retail price, sale price, savings,
  effective dates, and source metadata
- `bottles`: normalized bottle identities with Maine retail or sale price
  observations and UPCs
- `source`: source metadata
- `retrievedAt`: import timestamp

The default Maine import now keeps serious whiskey rows across bourbon, rye,
wheated bourbon, wheat whiskey, Tennessee whiskey, American whiskey, Scotch,
Canadian whisky, Irish whiskey, Japanese whisky, and world whisky. It rejects
flavored whiskey, low-proof whiskey liqueur/cocktail rows, gift/accessory
bundles, VAPs, and non-whiskey products while preserving legitimate
cask-finished and packaged-in-box whiskey rows. Sale price is preferred when
present, with regular retail preserved on the price observation.

Montgomery County ABS Price Book importer:

```powershell
& 'C:\Users\17162\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' tools\extract-pdf-text.py --input-dir data\raw\montgomery-county-abs --out-dir data\raw\montgomery-county-abs\text
node tools/import-montgomery-county-abs.js --input data\raw\montgomery-county-abs\text\pricebook.txt --out data\imports\montgomery-county-abs-bourbon-current.json
```

The extractor reads embedded text from Montgomery County ABS' official price
book PDF. The importer writes:

- `records`: filtered liquor rows with product code, source section, product
  name, size, tag/status, bottles per case, wholesale case price, wholesale
  bottle price, supplier, effective period, proof/age parsed from the name, and
  source file
- `bottles`: normalized bottle identities with Montgomery County wholesale
  bottle-price observations
- `sourceFiles`: extracted text files used
- `source`: source metadata
- `retrievedAt`: import timestamp

The default Montgomery County import keeps category-backed bourbon, clearly
bourbon-labeled whiskey, and serious Tennessee whiskey. It rejects beer/wine
bourbon-barrel false positives, flavored whiskey, cocktail kits, glass bundles,
rye-only products, Scotch, and other non-bourbon rows. Prices are wholesale
bottle prices, not consumer shelf retail.

Montgomery County ABS Store Inventory importer:

```powershell
node tools/import-montgomery-county-abs-inventory.js --input data\raw\montgomery-county-abs\inventory-current.json --out data\imports\montgomery-county-abs-inventory-bourbon-current.json
```

The importer reads Montgomery County's official Socrata/open-data JSON export
for ABS Store Inventory and Sale Items and writes:

- `records`: filtered rows with product code, source category, description,
  normalized size, total inventory, regular price, sale price, sale end date,
  and proof/age parsed from the description
- `bottles`: normalized bottle identities with Montgomery County retail price
  observations and aggregate inventory
- `source`: source metadata
- `retrievedAt`: import timestamp

The default inventory import now keeps serious whiskey rows across bourbon,
bottled-in-bond bourbon, rye, Tennessee whiskey, Scotch, Irish whiskey, Canadian
whisky, American single malt, Japanese whisky, and world whisky. It rejects BIB
wine boxes, beer/wine false positives, flavored whiskey, RTDs, gift packs,
accessory bundles, and low-seriousness specialty products. Sale price is used as
the current retail observation when present, with regular price preserved.

Vermont 802Spirits Complete Price List importer:

```powershell
& 'C:\Users\17162\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' tools\extract-pdf-text.py --input-dir data\raw\vermont-802 --out-dir data\raw\vermont-802\text
node tools/import-vermont-802.js --input data\raw\vermont-802\text\2026-may-complete-list.txt --out data\imports\vermont-802-bourbon-current.json
```

The extractor reads embedded text from Vermont 802Spirits' official monthly
complete price-list PDF. The importer writes:

- `records`: filtered source rows with code, category, product name, size,
  regular retail price, sale price, savings, proof, status, and as-of month
- `bottles`: normalized bottle identities with Vermont retail price observations
- `source`: source metadata
- `retrievedAt`: import timestamp

The default Vermont import now keeps serious whiskey rows across bourbon, rye,
wheated bourbon, Tennessee whiskey, American whiskey, Scotch, Canadian whisky,
Irish whiskey, Japanese whisky, and related serious whiskey categories. It
rejects flavored whiskey, cocktails, creams/liqueurs, party buckets, VAP/gift
rows, and non-whiskey products. Sale price is used as the current retail
observation when present, with regular price preserved.

Texas TABC Approved Product Label importer:

```powershell
node tools/import-texas-tabc.js --input-dir data\raw\texas-tabc --out data\imports\texas-tabc-bourbon-current.json
```

The importer reads Texas Open Data approved-label JSON exports and writes:

- `records`: filtered source rows with TABC certificate number, permit/license
  number, brand name, approval date, trade name, ABV/proof, TTB number, and
  direct certificate PDF link
- `bottles`: label-registration identities with Texas TABC source references
  and label approval metadata
- `sourceFiles`: local JSON exports used
- `source`: source metadata
- `retrievedAt`: import timestamp

The default Texas import now keeps serious whiskey registrations across bourbon,
bottled-in-bond bourbon, rye, wheated bourbon, wheat whiskey, Tennessee whiskey,
American whiskey, American single malt, Canadian whisky, Scotch, Irish,
Japanese, and world whisky rows. Bourbon-only mode still rejects ex-bourbon and
rye context rows so world whisky does not pollute the bourbon lane. The importer
rejects flavored products, creams, cocktail/RTD rows, non-whiskey spirits, low
ABV whiskey cocktails, moonshine, gift packs, and samplers. Texas TABC is a
state registration source, not a retail price or availability source.

Kentucky ABC Active Brands importer:

```powershell
node tools/import-kentucky-abc.js --input-dir data\raw\kentucky-abc --out data\imports\kentucky-abc-bourbon-current.json
```

The importer reads official Kentucky Active Brands summary-export XLSX files and
writes:

- `records`: filtered source rows with Kentucky approval number, TTB COLA ID,
  brand/label description, status, ABV/proof, package size when available,
  supplier/licensee, distributor permit/name, approval date, and source file
- `bottles`: state-registration identities with Kentucky ABC source references
  and label approval metadata
- `sourceFiles`: local XLSX exports used
- `source`: source metadata
- `retrievedAt`: import timestamp

The default Kentucky import now keeps serious whiskey registrations from
bourbon, rye, whiskey, whisky, Found North, Tennessee, Jack Daniel, George
Dickel, and Uncle Nearest searches. It includes bourbon, bottled-in-bond
bourbon, rye, wheated bourbon, wheat whiskey, Tennessee whiskey, American single
malt, Canadian whisky, and selected world whisky rows. It rejects tea, beer,
low-ABV, cocktail/RTD, flavored, liqueur, non-whiskey spirits, gift/VAP rows,
and barrel-aged non-whiskey products. Kentucky ABC is a state registration
source, not a retail price or availability source; the export also includes
distributor-level duplication, which the importer deduplicates into registration
metadata.

Connecticut Liquor Brands importer:

```powershell
node tools/import-connecticut-liquor-brands.js --input-dir data\raw\connecticut-liquor-brands --out data\imports\connecticut-liquor-brands-current.json
```

The importer reads official Connecticut Open Data JSON exports and writes:

- `records`: filtered source rows with Connecticut registration number, brand
  name, status, effective date, expiration date, out-of-state shipper,
  supervisor credential, wholesaler credentials, category inferred from brand
  language, and source file
- `bottles`: state-registration identities with Connecticut source references
  and label approval metadata
- `sourceFiles`: local JSON exports used
- `source`: source metadata
- `retrievedAt`: import timestamp

The default Connecticut import is broader than the bourbon-only starters: it
keeps serious whiskey categories including bourbon, bottled-in-bond bourbon,
wheated bourbon, rye, wheat whiskey, Tennessee whiskey, American whiskey,
American single malt, Canadian whisky, Scotch, Irish, Japanese, and other world
whisky records. It rejects bourbon-barrel wine and beer, cocktails/RTDs, creams,
flavored products, obvious liqueurs, and other whiskey-adjacent false positives.
Connecticut Liquor Brands is a state registration source, not a retail price or
availability source.

LCBO Whisky Catalog importer:

```powershell
node tools/import-lcbo-whisky.js --input-dir data\raw\lcbo --out data\imports\lcbo-whisky-current.json
```

The importer reads saved LCBO whisky category/Coveo result JSON pages and
writes:

- `records`: filtered source rows with LCBO product ID, SKU, product URL, name,
  brand, category path, country/region, ABV/proof, size, UPC, CAD price
  metadata, online inventory flags, and source file
- `bottles`: normalized serious-whisky identities with LCBO source references
  and Canadian-dollar price metadata
- `sourceFiles`: local HTML/JSON pages used
- `source`: source metadata
- `retrievedAt`: import timestamp

LCBO is useful for Canadian and world whisky coverage, UPCs, ABV/proof, and
product URLs. Its prices are Ontario CAD catalog metadata, so the app preserves
them as source metadata rather than U.S. retail observations for buy/pass
scoring.

App catalog builder:

```powershell
node tools/build-imported-catalog.js --input-dir data\imports --out src\data\imported-catalog.json --index-out src\data\imported-catalog-index.json --index-js-out src\data\imported-catalog-index.js --legacy-js-out src\data\imported-catalog.js
```

The builder combines every import JSON into four generated artifacts:

- `src/data/imported-catalog.json`: full source-backed catalog for inspection
  and future tooling
- `src/data/imported-catalog-index.json`: confidence-gated app/search index
  fetched on boot
- `src/data/imported-catalog-index.js`: direct-file fallback when local JSON
  fetch is blocked
- `src/data/imported-catalog.js`: legacy compatibility shim

The builder canonicalizes compatible source rows so source spelling variants
merge into one app bottle while preserving source counts, regions, and price
observation summaries. The full generated catalog remains the audit pool; Store
Mode uses only the confidence-gated index so one-off registration rows, non-
whiskey false positives, and records without a trustworthy maker do not compete
with bottles a serious whiskey drinker would expect to see.

## Guardrails

- Do not invent UPCs, scan results, friend ratings, or tasting history.
- Every imported fact should carry `sourceId`, `sourceRecordId`, and
  `retrievedAt`.
- Every price should carry source, region, size, and timestamp.
- User-entered prices are first-party observations, not official prices.
- Use official/public sources or explicit APIs. Avoid scraping apps or retailers
  where terms do not allow it.
- TTB Public COLA Registry search exports are capped by the registry, so split
  searches by date/class and keep each exported CSV under `data/raw/ttb-cola/`.
