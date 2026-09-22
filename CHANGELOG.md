# Changelog

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
