import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const path = join(root, "examples/specs/lens-project/Assets/Data/default-access-profile.json");
const profile = JSON.parse(readFileSync(path, "utf8"));

// Structural checks mirroring schema/access-profile.schema.json, kept
// dependency-free like the rest of this repo's tests (no JSON Schema
// validator library).
if (profile.agp_profile !== "0.1") throw new Error("default-access-profile.json must set agp_profile to 0.1");

const allowedTop = new Set(["agp_profile", "input", "output", "language", "interaction"]);
for (const key of Object.keys(profile)) {
  if (!allowedTop.has(key)) throw new Error(`default-access-profile.json has an unexpected top-level field: ${key}`);
}

for (const channel of [profile.input, profile.output]) {
  if (channel?.preferred && !Array.isArray(channel.preferred)) throw new Error("preferred must be an array");
  if (channel?.avoid && !Array.isArray(channel.avoid)) throw new Error("avoid must be an array");
}

if (profile.language?.complexity && !["plain", "standard", "detailed"].includes(profile.language.complexity)) {
  throw new Error("language.complexity is out of range");
}
if (profile.language?.response_length && !["short", "standard", "long"].includes(profile.language.response_length)) {
  throw new Error("language.response_length is out of range");
}
if (profile.interaction?.confirmation_for && !Array.isArray(profile.interaction.confirmation_for)) {
  throw new Error("interaction.confirmation_for must be an array");
}

console.log("Lens default Access Profile test passed");
