# Supported-capability matrix

What AGP 0.1 actually does today, verified against source (not aspirational).
"Adapter" rows are read from `adapters/*/index.js`; "Client" rows are read
from `examples/*/`. Update this file whenever an adapter or client's real
behavior changes — it is a source-of-truth check, not a marketing page.

## Adapters

| Capability | ARIA (`adapters/aria/`) | WoT (`adapters/wot/`) | SPECS (`adapters/specs/`) |
|---|---|---|---|
| Reads native semantics without owning execution | Yes — scans DOM/ARIA, never dispatches events | Yes — reads a Thing Description, never calls a Thing's forms | N/A — presentation/session layer over the other two |
| Produces an AGP object with role/state/actions | Yes | Yes, plus a graph decomposition (`thingDescriptionToGraph`) into property sub-objects | Consumes an existing AGP object; produces a view model |
| Risk/confirmation defaults | Not derived from source; caller sets it | Read from `x-agp-risk` / `x-agp-confirmation` extensions on the TD **with no trust boundary from AGP's own policy** — see Finding G below | Reads whatever the object already carries |
| Authorization requirement | Not modeled | Derived from `td.security` **only at the Thing (top) level** — per-form overrides and security-requirement combinations are not read — see Finding F | Gated in `SpecsActionSession`, but confirmation was not bound to specific parameters until the fix in this release — see Finding B |
| State vs. defaults vs. write-only | N/A (DOM state is always "current") | **Not separated** — `property.default` is used as a state value when no live value is supplied, and `writeOnly` properties are not excluded from state — see Finding C | Passes through whatever the WoT adapter produced |
| Parameter schema fidelity | N/A | Unsupported JSON Schema types silently become `"string"`; every parameter is marked `required: true` regardless of the source schema — see Finding D | N/A |
| Identifier collisions | Not addressed (single scan per page) | `stableId()` case/punctuation-folds names with **no collision detection**; a second object registered under a colliding id silently overwrites the first in `AccessGraph` — see Finding E | N/A |
| Tested | `tests/aria-adapter-test.mjs` | `tests/wot-adapter-test.mjs` | `tests/specs-adapter-test.mjs`, `tests/lens-*-test.mjs` |

## Clients

| Capability | `examples/website/` | `examples/drone/` | `examples/smart-device/` (browser) | `examples/specs/lens-project/` (Spectacles) |
|---|---|---|---|---|
| Renders AGP object + Access Profile | Yes | Yes | Yes | Yes — `AgpDeviceSource.ts` |
| World-locked / spatial placement | N/A | N/A | N/A | Source-complete; **not yet tested on hardware** |
| Hand input | N/A | N/A | Mouse/keyboard only | SIK `Interactable` — source-complete, **not yet tested on hardware** |
| Voice input | No | No | No | Exact-phrase only via Spectacles `AsrModule` (no fuzzy matching) — source-complete, **not tested on hardware, and ASR is Spectacles-only: it does not run in desktop Lens Studio preview** |
| Captions / speech output | No | No | No | `AgpCaptionsAndSpeechOutput.ts` via `TextToSpeechModule` — source-complete, **not tested on hardware** |
| Large text / high contrast / reduced motion | No | No | No | `AgpSpecsPanelView.ts` applies presentation flags already computed by `toSpecsView` — source-complete, **not tested on hardware** |
| One-step interaction | No | No | Yes (single gate panel) | Yes — `layout: "focused"` shows one action at a time |
| Confirmation / authorization as separate steps | N/A | N/A | Yes | Yes, plus (this release) confirmation bound to immutable parameters |
| Parameterized actions (e.g. set a numeric value) | N/A | N/A | Yes (`write_targettemperature` with a slider) | **Not yet built** — panel filters out any action with `parameters` rather than half-implementing input for it |
| Camera / visual device identification | No | No | No | **Not implemented, and not planned for the first workflow** — do not add camera-based device discovery before explicit pairing/verified discovery exists; seeing a device is not permission to operate it |

## Findings from the source-inspection audit (this release)

| # | Finding | Status |
|---|---|---|
| A | Lens authorization is simulated (`authorize(true)` → `authorizationFinished` → `provideAuthorization`); not visibly labeled as simulated in the UI | **Fixed this release** — `AgpConfirmationAuthorizationGate` now prefixes the authorization prompt with "(Simulated)" and the label reads "Simulate authorization on paired device" |
| B | `SpecsActionSession.request()` did not bind parameters; `execute(parameters)` could supply different parameters than what was confirmed | **Fixed this release** — see `docs/adr-0001-wot-reuse.md` is unrelated; see the "Confirmation binds to parameters" section of `CHANGELOG.md` and `tests/specs-adapter-test.mjs` |
| C | WoT state projection conflates schema defaults with observed values, and does not exclude write-only properties | **Not fixed. Tracked in `ROADMAP.md` with acceptance criteria.** |
| D | WoT parameter schema translation silently drops unsupported types to `"string"` and marks everything `required: true` | **Not fixed. Tracked in `ROADMAP.md`.** |
| E | `stableId()` has no collision detection; colliding ids silently overwrite each other in `AccessGraph` | **Not fixed. Tracked in `ROADMAP.md`.** |
| F | Authorization requirement is derived only from top-level `td.security`, ignoring per-form overrides and security-requirement combinations | **Not fixed. Tracked in `ROADMAP.md`.** |
| G | Source-declared `x-agp-risk` / `x-agp-confirmation` have no trust boundary from AGP's own policy — a device can self-declare a dangerous action as low-risk | **Not fixed. Tracked in `ROADMAP.md` — same trust-model gap MCP's tool-annotations spec documents for its own hints; see `docs/prior-art-and-positioning.md`.** |

C–G were deliberately left unfixed in this release. The instruction that
produced this audit was explicit: implement one focused change (B, plus
the labeling fix for A) and add tests, rather than touching the
already-tested WoT adapter's state/schema/identifier/security logic in the
same pass. Fixing C–G is real, necessary follow-up work, not lower-priority
busywork — `ROADMAP.md` sequences it ahead of any new adapter.
