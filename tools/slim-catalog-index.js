#!/usr/bin/env node
// Re-slim the shipped catalog index in place. Use when the index on disk was
// built before the slimming step existed (raw imports are not needed): it
// drops redundant aliases and per-record source previews, then rewrites the
// JSON and the direct-file JS fallback so both stay identical.
//
//   node tools/slim-catalog-index.js [--index src/data/imported-catalog-index.json] [--index-js-out src/data/imported-catalog-index.js]

const fs = require("node:fs");
const path = require("node:path");
const { slimIndexBottle, writeJsonFile, writeIndexScript } = require("./build-imported-catalog.js");

function parseArgs(argv) {
  const args = { index: "src/data/imported-catalog-index.json", indexJsOut: "src/data/imported-catalog-index.js" };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === "--index") args.index = argv[++i];
    if (argv[i] === "--index-js-out") args.indexJsOut = argv[++i];
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);
  const indexPath = path.resolve(args.index);
  const before = fs.statSync(indexPath).size;
  const payload = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  payload.bottles = (payload.bottles || []).map(slimIndexBottle);
  writeJsonFile(payload, indexPath, { compact: true });
  writeIndexScript(payload, path.resolve(args.indexJsOut));
  const after = fs.statSync(indexPath).size;
  process.stdout.write("Slimmed " + payload.bottles.length + " bottles: " + (before / 1e6).toFixed(2) + " MB -> " + (after / 1e6).toFixed(2) + " MB\n");
}

if (require.main === module) main();
