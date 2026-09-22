# Supported-capability matrix

What AGP 0.1 actually does today, verified against source (not aspirational).
"Adapter" rows are read from `adapters/*/index.js`; "Client" rows are read
from `examples/*/`. Update this file whenever an adapter or client's real
behavior changes — it is a source-of-truth check, not a marketing page.

The 0.1.4 fixes below (C–G) were themselves independently re-verified
against 0.1.4 and found to contain four regressions — a claim of "fixed"
in one release is not treated as proof past that release. 0.1.5 fixed
those four (object/array parameter validation, proposal tamper-resistance,
a three-way id collision, and a multi-form authorization gap); 0.1.9
applied the same identifier-collision fix to the ARIA adapter, which had
never received it, and fixed an inconsistent form-submission default; see
`CHANGELOG.md` for specifics. The table below reflects the current
(0.1.9) state.

## Adapters

| Capability | ARIA (`adapters/aria/`) | WoT (`adapters/wot/`) | SPECS (`adapters/specs/`) |
|---|---|---|---|
| Reads native semantics without owning execution | Yes — scans DOM/ARIA, never dispatches events | Yes — reads a Thing Description, never calls a Thing's forms | N/A — presentation/session layer over the other two |
| Produces an AGP object with role/state/actions | Yes | Yes, plus a graph decomposition (`thingDescriptionToGraph`) into property sub-objects | Consumes an existing AGP object; produces a view model |
| Risk/confirmation defaults | Fixed, adapter-assigned per role (e.g. link `risk: "low"`, toggle/media/set-value `risk: "none"`); form submission defaults to `risk: "medium", confirmation: true, category: "form_submission"` (was `confirmation: false` with no category — inconsistent with the fail-safe default used elsewhere, fixed in 0.1.9). No DOM signal for finer-grained risk, so this is coarse by necessity | Read from `x-agp-risk` / `x-agp-confirmation` extensions on the TD, but for `physical_safety` / `security` / `financial` / `destructive` categories a source-declared value can only raise risk/confirmation, never lower it below the category's policy floor (Finding G, fixed) — the category itself is still source-declared, which is a documented, narrower remaining gap | Reads whatever the object already carries |
| Authorization requirement | Not modeled | Derived per-affordance: a form-level `security` override (WoT TD §5.3.4) takes precedence over the Thing-level default for that specific property/action (Finding F, fixed) | Gated in `SpecsActionSession`, with confirmation bound to immutable parameters (Finding B, fixed) |
| State vs. defaults vs. write-only | N/A (DOM state is always "current") | Separated: only a supplied live value or a WoT `const` counts as known state; a `default` with no observation is correctly absent (not invented), and `writeOnly` properties are always excluded from state (Finding C, fixed) | Passes through whatever the WoT adapter produced |
| Parameter schema fidelity | N/A | Object/array structure and each parameter's real `required`-ness are preserved; a schema this adapter can't represent is flagged `unsupported: true` with the original schema kept under `sourceSchema`, never silently coerced to `"string"` (Finding D, fixed) | N/A |
| Identifier collisions | `scanAria()` uses one shared `createIdAllocator()` (`sdk/javascript/agp.js`) per scan, disambiguating across all three id-generation paths (native `id`, `name`, index fallback) — a native `id` can collide with another element's fallback id, not only with another native `id` (fixed 0.1.9; the standalone `ariaElementToAgp()` entry point has no allocator of its own, since collision detection needs visibility across a scan's multiple elements) | Each entry-point call uses the same shared allocator to disambiguate a colliding `stableId()` output (e.g. `write_x`, `write_x-2`); the original source name is preserved on the action's `metadata.wot_name` (Finding E, fixed) | N/A |
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
| Parameterized actions (e.g. set a numeric value) | N/A | N/A | Yes (`write_targettemperature` with a range input) | `AgpParameterSlider.ts` on `SpectaclesUIKit.Slider` — source-complete, **not tested on hardware**. Narrow scope: only a single bounded numeric `value` parameter (`write_targettemperature`'s shape); any other parameter shape is still shown as read-only state, not a control |
| Camera / visual device identification | No | No | No | **Not implemented, and not planned for the first workflow** — do not add camera-based device discovery before explicit pairing/verified discovery exists; seeing a device is not permission to operate it |

## Execution service (`service/`)

A different axis from the adapter/client tables above: `service/` is a
server-side trust boundary, not a presentation layer, so it gets its own
row set rather than being forced into the Clients table's columns.

| Capability | Status |
|---|---|
| Server-owned device/action allowlist | Yes — the `AccessGraph` passed to `ExecutionService`'s constructor *is* the allowlist; no separate list to keep in sync |
| Caller authentication, rechecked per call | Yes — `_authenticate()` runs on every mutating call, not once at "login". Verified: an unauthenticated caller never reaches dispatch (asserted via executor call count) |
| State-version staleness protection | Yes — checked at `propose()` and again at `execute()`, since state can change in between |
| Duplicate-dispatch protection | Yes — caller-generated `requestId`; verified by deliberately breaking the dedup check and confirming the test failed, not just written and assumed |
| Confirmation / authorization as distinct server-side steps | Yes, mirroring `adapters/specs/index.js`'s client-side model but as a genuinely separate trust boundary (see `service/README.md`) |
| Real authorization backend | **No** — `simulatedAuthorizationProvider` trusts the caller's claim. The pluggable `authorizationProvider` interface is real; the default implementation is not |
| Real device connected | **No** — `run-local.mjs`'s executor is simulated, same thermostat fixture as `examples/smart-device/` |
| HTTP transport | Yes — `service/http-server.js`, Node's built-in `http`, no framework. Tested over real sockets, not just in-process |
| A client that talks to it over the network | Yes — `examples/execution-client/`, manually verified live (see its row in `ROADMAP.md`'s M2 milestone for exactly what was and wasn't clicked through) |
| Restart persistence | **No** — explicitly not claimed; everything is in-memory |
| Tested | `tests/execution-service-test.mjs` (in-process), `tests/execution-http-server-test.mjs` (real sockets) |

## Findings from the source-inspection audit (this release)

| # | Finding | Status |
|---|---|---|
| A | Lens authorization is simulated (`authorize(true)` → `authorizationFinished` → `provideAuthorization`); not visibly labeled as simulated in the UI | **Fixed** — the authorization prompt, caption, and spoken announcement are all prefixed "(Simulated)" in both `AgpSpecsSessionController.broadcastPrompt` (Lens) and `examples/smart-device/app.js`'s `showGate`, not only the button label |
| B | `SpecsActionSession.request()` did not bind parameters; `execute(parameters)` could supply different parameters than what was confirmed | **Fixed** — `request()` validates and immutably binds parameters; `execute()` runs the bound proposal and rejects a mismatched substitution. `tests/specs-adapter-test.mjs` |
| C | WoT state projection conflates schema defaults with observed values, and does not exclude write-only properties | **Fixed** — `adapters/wot/index.js` `readValue`/`isStateReadable`. `tests/wot-adapter-test.mjs` ("Finding C") |
| D | WoT parameter schema translation silently drops unsupported types to `"string"` and marks everything `required: true` | **Fixed** — `adapters/wot/index.js` `schemaParameter`/`inputParameters`; `schema/access-graph.schema.json`'s parameter `type` enum extended to include `object`/`array`/`unsupported`. `tests/wot-adapter-test.mjs` ("Finding D") |
| E | `stableId()` has no collision detection; colliding ids silently overwrite each other in `AccessGraph` | **Fixed** — `adapters/wot/index.js` `createIdAllocator`, used per entry-point call; original source name preserved on `metadata.wot_name`. `tests/wot-adapter-test.mjs` ("Finding E") |
| F | Authorization requirement is derived only from top-level `td.security`, ignoring per-form overrides and security-requirement combinations | **Fixed** — `adapters/wot/index.js` `requiresAuthorization`/`formSecuritySchemes` now reads per-affordance form overrides. `tests/wot-adapter-test.mjs` ("Finding F") |
| G | Source-declared `x-agp-risk` / `x-agp-confirmation` have no trust boundary from AGP's own policy — a device can self-declare a dangerous action as low-risk | **Fixed for the risk/confirmation value** — a source can raise but never lower risk/confirmation for `physical_safety`/`security`/`financial`/`destructive` categories (`CATEGORY_RISK_FLOOR`/`CATEGORY_CONFIRMATION_FLOOR`). **Category mislabeling mitigated, not eliminated** — `options.categoryPolicy` lets a caller who has reviewed a device supply its real category, overriding a mismatched `x-agp-category` claim and subjecting it to the same floor. Every action now carries `metadata.category_trust: "reviewed" \| "declared"`, so an unreviewed (and therefore still-gameable) category claim is visible rather than indistinguishable from a reviewed one. Without a supplied policy, a device can still mislabel itself — no client-side adapter can independently verify a category claim; that residual case is now at least *visible*, not silent. `tests/wot-adapter-test.mjs` ("Finding G", "Finding G, category gap") |

All seven findings from the source-inspection audit are addressed as of
this release. G's category-mislabeling case is mitigated (a reviewed
override mechanism exists and unreviewed claims are now marked) rather
than fully eliminated — full elimination needs category ground truth from
somewhere other than the device itself, which is inherently outside a
client-side adapter's reach. Each fix has a corresponding regression
test — see `tests/wot-adapter-test.mjs` and `tests/specs-adapter-test.mjs`.
