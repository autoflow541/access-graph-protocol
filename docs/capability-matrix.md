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
| Risk/confirmation defaults | Not derived from source; caller sets it | Read from `x-agp-risk` / `x-agp-confirmation` extensions on the TD, but for `physical_safety` / `security` / `financial` / `destructive` categories a source-declared value can only raise risk/confirmation, never lower it below the category's policy floor (Finding G, fixed) — the category itself is still source-declared, which is a documented, narrower remaining gap | Reads whatever the object already carries |
| Authorization requirement | Not modeled | Derived per-affordance: a form-level `security` override (WoT TD §5.3.4) takes precedence over the Thing-level default for that specific property/action (Finding F, fixed) | Gated in `SpecsActionSession`, with confirmation bound to immutable parameters (Finding B, fixed) |
| State vs. defaults vs. write-only | N/A (DOM state is always "current") | Separated: only a supplied live value or a WoT `const` counts as known state; a `default` with no observation is correctly absent (not invented), and `writeOnly` properties are always excluded from state (Finding C, fixed) | Passes through whatever the WoT adapter produced |
| Parameter schema fidelity | N/A | Object/array structure and each parameter's real `required`-ness are preserved; a schema this adapter can't represent is flagged `unsupported: true` with the original schema kept under `sourceSchema`, never silently coerced to `"string"` (Finding D, fixed) | N/A |
| Identifier collisions | Not addressed (single scan per page) | Each entry-point call uses a per-call id allocator that disambiguates a colliding `stableId()` output (e.g. `write_x`, `write_x-2`); the original source name is preserved on the action's `metadata.wot_name` (Finding E, fixed) | N/A |
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
| A | Lens authorization is simulated (`authorize(true)` → `authorizationFinished` → `provideAuthorization`); not visibly labeled as simulated in the UI | **Fixed** — the authorization prompt, caption, and spoken announcement are all prefixed "(Simulated)" in both `AgpSpecsSessionController.broadcastPrompt` (Lens) and `examples/smart-device/app.js`'s `showGate`, not only the button label |
| B | `SpecsActionSession.request()` did not bind parameters; `execute(parameters)` could supply different parameters than what was confirmed | **Fixed** — `request()` validates and immutably binds parameters; `execute()` runs the bound proposal and rejects a mismatched substitution. `tests/specs-adapter-test.mjs` |
| C | WoT state projection conflates schema defaults with observed values, and does not exclude write-only properties | **Fixed** — `adapters/wot/index.js` `readValue`/`isStateReadable`. `tests/wot-adapter-test.mjs` ("Finding C") |
| D | WoT parameter schema translation silently drops unsupported types to `"string"` and marks everything `required: true` | **Fixed** — `adapters/wot/index.js` `schemaParameter`/`inputParameters`; `schema/access-graph.schema.json`'s parameter `type` enum extended to include `object`/`array`/`unsupported`. `tests/wot-adapter-test.mjs` ("Finding D") |
| E | `stableId()` has no collision detection; colliding ids silently overwrite each other in `AccessGraph` | **Fixed** — `adapters/wot/index.js` `createIdAllocator`, used per entry-point call; original source name preserved on `metadata.wot_name`. `tests/wot-adapter-test.mjs` ("Finding E") |
| F | Authorization requirement is derived only from top-level `td.security`, ignoring per-form overrides and security-requirement combinations | **Fixed** — `adapters/wot/index.js` `requiresAuthorization`/`formSecuritySchemes` now reads per-affordance form overrides. `tests/wot-adapter-test.mjs` ("Finding F") |
| G | Source-declared `x-agp-risk` / `x-agp-confirmation` have no trust boundary from AGP's own policy — a device can self-declare a dangerous action as low-risk | **Fixed for the risk/confirmation value itself** — `adapters/wot/index.js` `CATEGORY_RISK_FLOOR`/`CATEGORY_CONFIRMATION_FLOOR`/`riskFor`/`confirmationFor`: a source can raise but never lower risk/confirmation for `physical_safety`/`security`/`financial`/`destructive` categories. **Not fixed**: the category itself (`x-agp-category`) is still source-declared, so a device could still mislabel a dangerous action to dodge the floor — closing that needs category classification from a reviewed/allowlisted source, tracked in `ROADMAP.md`, not solved by a client-side adapter. `tests/wot-adapter-test.mjs` ("Finding G") |

All seven findings from the source-inspection audit are addressed as of
this release, with the one documented exception noted under G (category
trust). Each fix has a corresponding regression test — see
`tests/wot-adapter-test.mjs` and `tests/specs-adapter-test.mjs`.
