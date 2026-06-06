#!/usr/bin/env node

// Builds src/data/bottle-images.js: a UPC/barcode -> real product image map.
//
// Some source catalogs (currently LCBO) carry real product photos on their
// sourceRefs. The slimmed app catalog index drops sourceRefs, so we can't read
// those images at runtime directly. This tool harvests every real image URL
// from the raw imports and keys it by UPC/barcode, which the index DOES keep.
// At boot the app attaches bottle.imageUrl for any bottle whose code matches,
// so real photos light up on exactly the right bottle (UPC is an exact key).
//
// Run: node tools/build-bottle-images.js   (regenerate after refreshing imports)

const fs = require("node:fs");
const path = require("node:path");

const IMPORTS_DIR = path.join(__dirname, "..", "data", "imports");
const OUT_FILE = path.join(__dirname, "..", "src", "data", "bottle-images.js");

function loadArray(json) {
  if (Array.isArray(json)) return json;
  if (json && Array.isArray(json.bottles)) return json.bottles;
  if (json && Array.isArray(json.records)) return json.records;
  const firstArray = json && typeof json === "object"
    ? Object.values(json).find(Array.isArray)
    : null;
  return firstArray || [];
}

function imageFromRecord(record) {
  const refs = Array.isArray(record.sourceRefs) ? record.sourceRefs : [];
  for (const ref of refs) {
    if (ref && typeof ref.imageUrl === "string" && ref.imageUrl) return ref.imageUrl;
  }
  if (typeof record.imageUrl === "string" && record.imageUrl) return record.imageUrl;
  return "";
}

function codesFromRecord(record) {
  const codes = [];
  if (record.upc) codes.push(String(record.upc));
  for (const code of record.barcodes || []) {
    if (code) codes.push(String(code));
  }
  return codes;
}

function main() {
  const files = fs.readdirSync(IMPORTS_DIR).filter((name) => name.endsWith(".json"));
  const byCode = {};
  let sourcesWithImages = 0;

  for (const file of files) {
    let json;
    try {
      json = JSON.parse(fs.readFileSync(path.join(IMPORTS_DIR, file), "utf8"));
    } catch (error) {
      continue;
    }
    const records = loadArray(json);
    let hadImage = false;
    for (const record of records) {
      const image = imageFromRecord(record);
      if (!image) continue;
      hadImage = true;
      for (const code of codesFromRecord(record)) {
        if (!byCode[code]) byCode[code] = image;
      }
    }
    if (hadImage) sourcesWithImages += 1;
  }

  const payload = {
    schemaVersion: 1,
    generatedBy: "tools/build-bottle-images.js",
    codeCount: Object.keys(byCode).length,
    byCode
  };

  const body =
    "(function attachBottleImages(global) {\n" +
    "  global.BarrelBottleImages = " +
    JSON.stringify(payload, null, 0) +
    ";\n" +
    "})(typeof window !== \"undefined\" ? window : globalThis);\n";

  fs.writeFileSync(OUT_FILE, body);
  console.log(
    "Wrote " + path.relative(path.join(__dirname, ".."), OUT_FILE) +
    " — " + Object.keys(byCode).length + " image codes from " +
    sourcesWithImages + " source file(s)."
  );
}

main();
