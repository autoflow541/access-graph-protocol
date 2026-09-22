import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SYNCED_FILES, transform } from "../scripts/sync-lens-assets.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const destDir = join(root, "examples/specs/lens-project/Assets/Scripts/AgpCore");

for (const { from, to, rewrite } of SYNCED_FILES) {
  const source = readFileSync(join(root, from), "utf8");
  const expected = transform(source, rewrite);
  const actual = readFileSync(join(destDir, to), "utf8");
  if (actual !== expected) {
    throw new Error(
      `examples/specs/lens-project/Assets/Scripts/AgpCore/${to} is out of date with ${from}. Run: npm run sync:lens`
    );
  }
}

console.log("Lens asset sync test passed");
