# Changelog

## 0.1.3 — 2026-09-22

Source-inspection audit and planning docs prompted by an external research
brief comparing AGP to prior art (Universal Remote Console, W3C Web of
Things, WAI-Adapt, MCP, A2UI, XR accessibility research). See
`docs/prior-art-and-positioning.md`, `docs/capability-matrix.md`,
`docs/adr-0001-wot-reuse.md`, and the milestone plan added to
`ROADMAP.md`.

- **Fixed**: `SpecsActionSession.request()` now validates and immutably
  binds an action's parameters at proposal time. `execute()` no longer
  accepts new parameters to run with — it runs the bound proposal, and
  rejects (rather than silently accepting) an attempt to supply different
  parameters than what was confirmed and authorized. This closes a real
  confirmation/execution mismatch: previously, `request()`/`confirm()`
  only ever referenced an action id, so a user could confirm one action
  and a different set of parameters could run at `execute()` time. See
  `tests/specs-adapter-test.mjs` for the tests proving this.
- **Fixed**: the authorization step in both the browser demo
  (`examples/smart-device/app.js`) and the Lens
  (`examples/specs/lens-project/`) now visibly and audibly discloses
  "(Simulated)" — in the prompt text, the caption, and the spoken
  announcement, not only the button label — because this reference
  project's authorization executor is a local stand-in, not a real
  device/account authorization flow.
- **Changed**: `examples/specs/AgpSpecsController.ts`,
  `AgpSpecsSessionController.ts`, and `examples/smart-device/app.js` were
  updated for the new `request(objectId, actionId, parameters)` /
  no-argument `execute()` shape.
- **Audited, not yet fixed** (tracked in `ROADMAP.md` with acceptance
  criteria): the WoT adapter conflates schema defaults with observed
  state and doesn't exclude write-only properties from state; parameter
  schema translation silently coerces unsupported types to `"string"` and
  marks everything `required: true`; generated identifiers have no
  collision detection; authorization requirement is derived only from
  top-level `security`, not per-form overrides; source-declared
  `x-agp-risk`/`x-agp-confirmation` have no trust boundary from a
  server-enforced policy (the same trust-model gap MCP's own tool
  annotations spec documents for its hints).

## 0.1.2 — 2026-09-21

- Added a real Lens Studio (SPECS 27) project source tree at `examples/specs/lens-project/`, targeting Lens Studio 5.22+, Spectacles UI Kit, and the Spectacles Interaction Kit: loads an AGP object and Access Profile, renders world-locked controls, supports hand input and exact-phrase voice commands (via the Spectacles ASR Module), and supports captions/speech (via the Text To Speech Module), large text, high contrast, reduced motion, and one-step interaction — all driven by the existing, unmodified SPECS adapter and SDK.
- Connected the simulated WoT thermostat (`examples/smart-device/`) as the Lens's first device, reusing the same Thing Description.
- Kept confirmation and authorization as two separate, explicit gate steps in the Lens, and never treats voice, hand input, or possession of the glasses as authorization (see `AgpConfirmationAuthorizationGate.ts` and `SECURITY.md`).
- Added `scripts/sync-lens-assets.mjs` and `tests/lens-assets-sync-test.mjs` so the Lens always runs the exact same, already-tested `sdk/javascript/agp.js` / `adapters/specs/index.js` / `adapters/wot/index.js` rather than a hand-copied duplicate.
- Added `tests/lens-access-profile-test.mjs` validating the Lens's default Access Profile against `schema/access-profile.schema.json`'s shape.
- Documented the Lens Studio editor wiring (scene hierarchy, Inspector fields, known gaps) in `examples/specs/lens-project/SETUP.md`.

## 0.1.1 — 2026-09-21

- Added a W3C Web of Things Thing Description adapter.
- Added a simulated smart thermostat demo.
- Added a SPECS presentation adapter, gated action session, and Lens Studio controller contract.
- Added WoT and SPECS tests and expanded safety guidance for XR input and device actions.

## 0.1.0 — 2026-09-21

- Initial AGP object and Access Profile schemas
- Dependency-free JavaScript reference SDK
- Risk and confirmation model
- Adaptive website demonstration
- Simulated drone demonstration
- Initial HTML/ARIA adapter
- Architecture diagram and interoperability roadmap
- Apache-2.0 license, contribution guidance, security notes, and issue templates
