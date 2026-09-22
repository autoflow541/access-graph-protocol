#!/usr/bin/env node
// Copies the tested AGP core/adapter modules into the Lens Studio project so the
// Lens runs the exact same, already-tested code instead of a hand-transcribed copy.
// Run after editing sdk/javascript/agp.js, adapters/specs/index.js, or adapters/wot/index.js.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const destDir = join(root, "examples/specs/lens-project/Assets/Scripts/AgpCore");

// The Lens Studio copies sit flat in one folder, so the "../../sdk/..." style
// relative import used at the repo root has to become a same-folder import.
// This is the ONLY change made to the source text — everything else must
// stay byte-identical, which is what tests/lens-assets-sync-test.mjs enforces.
export const SYNCED_FILES = [
  { from: "sdk/javascript/agp.js", to: "agp.js", rewrite: [] },
  {
    from: "adapters/specs/index.js",
    to: "AgpSpecsAdapter.js",
    rewrite: [['from "../../sdk/javascript/agp.js"', 'from "./agp.js"']]
  },
  {
    from: "adapters/wot/index.js",
    to: "AgpWotAdapter.js",
    rewrite: [['from "../../sdk/javascript/agp.js"', 'from "./agp.js"']]
  }
];

export function transform(source, rewrite) {
  return rewrite.reduce((text, [from, to]) => {
    if (!text.includes(from)) throw new Error(`Expected import to rewrite was not found: ${from}`);
    return text.replace(from, to);
  }, source);
}

function run() {
  mkdirSync(destDir, { recursive: true });
  for (const { from, to, rewrite } of SYNCED_FILES) {
    const source = readFileSync(join(root, from), "utf8");
    writeFileSync(join(destDir, to), transform(source, rewrite));
    console.log(`synced ${from} -> examples/specs/lens-project/Assets/Scripts/AgpCore/${to}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) run();
