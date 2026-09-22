# Changelog

## 0.1.11 — 2026-09-22

Fixes a real UI/gate confirmation-policy mismatch flagged (but not yet
fixed) in `docs/audit-2026-09-22.md`: `AccessGraph.resolveAction()` (the
actual gate `SpecsActionSession.request()` calls) and `renderControls()`
(what `toSpecsView`'s per-action `cue` and the SPECS panel's button
labels are built from) used to be two independently-maintained
confirmation computations, and they had drifted — `renderControls` never
checked whether an action's `category` was in the Access Profile's
`interaction.confirmation_for` list, only risk. Verified live: an action
whose only confirmation trigger was its category showed
`resolveAction(...).requiresConfirmation === true` but
`renderControls(...).actions[0].confirmation === false` before the fix.
The actual safety gate was never bypassed (resolveAction was already
correct), but a user had no advance warning a confirmation step was
coming.

- **Fixed**: `sdk/javascript/agp.js` extracts one `requiresConfirmationFor(action, profile)`
  function used by both `AccessGraph.resolveAction()` and
  `renderControls()`, so the actual gate and the presentation layer
  cannot drift apart again. `tests/smoke-test.mjs` extended with a
  regression test using a category-only (not risk-triggered) confirmation
  case, which the existing fixtures didn't exercise since they all also
  had high risk or an explicit `confirmation: true`.

## 0.1.10 — 2026-09-22

Applied from a patch built independently against 0.1.9 (`df8b8ba`) by
another session, after its own review, audit, and testing. Reviewed
line-by-line and independently re-verified (`npm test`, all 7 suites)
before merging — see `docs/audit-2026-09-22.md` for the full audit.

- Enforce nested numeric bounds/enums and reject undeclared parameters.
- Show target and parameter values in confirmation; support explicit top-level sensitive-field redaction.
- Add opt-in proposal expiry with a testable clock and structured expiration code.
- Add end-to-end adapter/session regression coverage, engineering audit, and prioritized pilot plan.
- Refresh generated Lens adapter source; Lens compilation and hardware testing remain unverified.
- Also included: `parametersMatch()` used to only sort top-level
  parameter keys before comparing, so a resubmission with
  semantically-identical but differently-ordered *nested* object keys
  would have been wrongly rejected as not matching the confirmed
  proposal — noticed during review while tracing the new nested-object
  test cases; now compares a fully canonicalized (recursively key-sorted)
  form.

## 0.1.9 — 2026-09-22

Extends the same audit rigor applied to the WoT adapter (0.1.4/0.1.5) to
`adapters/aria/index.js`, which had never received it. Found and fixed two
real issues by reading the code and verifying against both hand-written
DOM mocks and the failure scenarios they were built to reproduce.

- **Fixed**: `adapters/aria/index.js`'s `stableId()` had the exact same
  identifier-collision class as WoT's finding E, completely unfixed —
  two elements whose `id`/`name` differ only by case or punctuation (e.g.
  `id="Save-Button"` and `id="SAVE-BUTTON"`) silently produced the same
  AGP id, and a native `id` could independently collide with another
  element's index-based fallback id. Verified directly: a simulated scan
  of two such elements now produces `web-save-button` /
  `web-save-button-2` instead of one silently overwriting the other in
  `AccessGraph`.
- **Refactored**: `createIdAllocator` (originally written for the WoT
  adapter) is now exported from `sdk/javascript/agp.js` and shared by both
  `adapters/wot/index.js` and `adapters/aria/index.js`, instead of being
  copy-pasted a second time — which is exactly the kind of duplication
  that let this bug class go unfixed in one adapter after being fixed in
  another. `scanAria()` creates one allocator per scan and threads it
  through `stableId()`; a standalone `ariaElementToAgp()` call (not
  through `scanAria`) has no allocator, since collision detection needs
  visibility across a scan's multiple elements — this is documented
  behavior, not a remaining gap.
- **Fixed**: form submission defaulted to `risk: "medium"` paired with an
  explicit `confirmation: false` and no `category` — opting OUT of
  confirmation for an action the adapter has no way to know is actually
  safe (a form can be a search box or a payment), inconsistent with the
  fail-safe default this session established elsewhere (an unclassified
  WoT write defaults to medium risk *with* confirmation required;
  `specification/AGP-0.1.md`). Now defaults to `confirmation: true` with
  `category: "form_submission"`, so an Access Profile can also target it.
- `tests/aria-adapter-test.mjs` extended with regression tests for both
  fixes. `docs/capability-matrix.md` updated.

## 0.1.8 — 2026-09-22

Closes the previously-flagged Lens Studio gap: a parameterized action
(e.g. the thermostat's `write_targettemperature`) was shown as read-only
state with no way to actually set it in the Lens, unlike the browser demo.

- **Added** `examples/specs/lens-project/Assets/Scripts/AgpParameterSlider.ts`,
  a numeric-parameter slider built on `SpectaclesUIKit.Slider` (verified
  against Snap's published scripting API — not the deprecated
  `SpectaclesInteractionKit.Slider`). `Slider.currentValue` is normalized
  to [0, 1] with no native min/max, so this class does the linear mapping
  to and from the parameter's actual `minimum`/`maximum` itself, and only
  proposes an action (`selectAction`) once dragging finishes
  (`Slider.onFinished`), not on every drag tick — mirroring the browser
  demo's range input, which requests on `"change"`, not `"input"`.
- `AgpSpecsPanelView.ts` now renders a slider for any action whose sole
  parameter is a single bounded numeric `value` (verified against real
  `adapters/wot/index.js` output: `write_targettemperature` → slider,
  `write_settings`-style object parameters → still read-only, no crash).
  Deliberately narrow scope: a multi-property object, an array, or an
  enum-only parameter is still shown as read-only state, not a
  half-built control.
- `examples/specs/lens-project/SETUP.md` documents the new prefab and
  import path, and the known gaps section now describes the slider's
  actual scope (single bounded numeric parameter only; no voice-driven
  equivalent yet) instead of "not built."
- `docs/capability-matrix.md` and `ROADMAP.md` updated accordingly.

Like the rest of `examples/specs/lens-project/`, this is source verified
against Snap's documented API and against real adapter output — not
verified running in Lens Studio or on Spectacles hardware.

## 0.1.7 — 2026-09-22

Documentation-only release: researches the two device/execution-layer
systems `ROADMAP.md` already named as "to evaluate" (Matter, Home
Assistant) but had never actually looked into, and extends
`docs/adr-0001-wot-reuse.md` and `docs/prior-art-and-positioning.md` with
the findings. No code changed; `npm test` is unaffected.

- **Matter**: its Node → Endpoint → Cluster → {attributes, commands,
  events} data model and fabric-scoped ACL (cumulative View/Operate/
  Manage/Administer privileges per command) map onto AGP's shape and
  authorization concept the same way WoT's TD does — and, like WoT, has
  no risk or confirmation concept at all. ADR-0001 extended (item 6) so a
  future Matter adapter starts from this decision instead of re-deriving
  it.
- **Home Assistant**: its WebSocket `call_service` API
  (`{domain, service, service_data, target}`) has no risk classification
  or destructive-action warning of any kind — confirmed by reading the
  actual API docs, not assumed. A future Home Assistant execution backend
  needs its own reviewed `domain`/`service` → category mapping; ADR-0001
  (item 5) and the `ROADMAP.md` M2 milestone updated accordingly.
- Strengthens `docs/prior-art-and-positioning.md`'s positioning statement:
  three independent, real, shipping systems (WoT, Matter, Home Assistant)
  all have authorization but no accessibility-oriented risk/confirmation
  layer — evidence that gap is real and consistently unaddressed, not
  something this project imagined or is duplicating.
- `ROADMAP.md`'s Matter and Home Assistant lines now point at the
  decisions already made instead of reading as unresearched placeholders.

## 0.1.6 — 2026-09-22

Documentation-only release: extends the prior-art research and feeds its
findings back into the protocol specification, and corrects README/ROADMAP
text that had gone stale across 0.1.2–0.1.5's changes. No code changed;
`npm test` is unaffected.

- Added two prior-art comparisons to `docs/prior-art-and-positioning.md`:
  - **AccessKit** — a real, actively developed cross-platform accessibility
    abstraction (Rust; Windows/macOS/Linux/Android adapters, iOS in
    progress). It has no risk/confirmation model at all, which is correct
    for what it solves ("invoke this button" is exactly as safe as a mouse
    click) — a clean differentiator for where AGP's scope actually starts.
  - **Apple App Intents** — its `requestConfirmation` API has documented
    cases of silently not showing a confirmation dialog when an intent is
    invoked via Siri or from a widget. This is a concrete, real-world
    precedent for why AGP keeps confirmation/authorization as explicit
    session states every input path must pass through, not a dialog call
    a particular modality can bypass.
- Fed both lessons (and the finding-B parameter-binding and finding-G
  policy-floor fixes from 0.1.4/0.1.5) back into `specification/AGP-0.1.md`
  as normative requirements, so a future non-JavaScript AGP implementation
  doesn't have to independently rediscover them.
- Corrected `ROADMAP.md`'s finding-G note, which still described the
  category-trust gap as fully open after the `categoryPolicy` mitigation
  in 0.1.4 had already partially closed it.
- Updated `README.md`'s WoT/SPECS section to mention the risk/confirmation
  policy floor and parameter-binding proposal model, and its repository
  index to list the two new prior-art sections.
- `CONTRIBUTING.md` now points proposers at `docs/prior-art-and-positioning.md`
  before adding a new vocabulary term.

## 0.1.5 — 2026-09-22

Fixes four regressions in 0.1.4's fixes, independently reproduced and
reported against commit `7441eda` (not just read from commit messages).
Each is now covered by a regression test that was verified failing
against the pre-fix code before the fix, and verified passing after —
and by direct inspection of the actual output, not just a green exit code.

- **Fixed**: `adapters/specs/index.js` `typeMatches()` had no branch for
  the `object`/`array` parameter types `adapters/wot/index.js` can now
  produce (0.1.4, finding D) — it fell through to a `typeof value ===
  "string"` check for anything else, so a genuinely valid object
  parameter was rejected and a bare string supplied in its place was
  wrongly accepted. `typeMatches` now recursively validates object
  (`properties`) and array (`items`) structure, and an `unsupported`
  parameter schema is rejected outright by `validateParameters` rather
  than reaching type matching at all — this session cannot verify a
  value against a structure the adapter itself flagged as unrepresentable.
- **Fixed**: a "confirmed" proposal could still be mutated after
  confirmation — `pending` was a plain, unfrozen, publicly-writable
  property, and `confirm()`/`provideAuthorization()` mutated it in place.
  `SpecsActionSession` now keeps its proposal in a constructor-closure
  variable with no external reference, exposes `pending` only through a
  getter-only accessor (assignment throws), and deep-freezes every
  proposal object before storing it, so a write to a nested field throws
  too. State transitions build a new frozen object instead of mutating
  the previous one. (Uses closures rather than ES2022 `#private` class
  fields because this file is synced verbatim into the Lens Studio
  project, whose JS engine's support for `#private` is unverified.)
  `sdk/javascript/agp.js`'s existing `structuredCloneSafe` is now exported
  and used to deep-clone parameter values during validation, so the bound
  proposal never shares object/array references with the caller's
  original argument either.
- **Fixed**: `adapters/wot/index.js`'s `createIdAllocator()` disambiguated
  a colliding id by incrementing a per-base-name counter without checking
  whether the resulting suffixed id was itself already taken by an
  unrelated, naturally-suffixed name — three distinct names could produce
  `a`, `a-2`, `a-2` instead of `a`, `a-2`, `a-3`. It now checks the
  candidate against every id already handed out and keeps incrementing
  until it finds one that's actually free.
- **Fixed**: `requiresAuthorization()` only inspected forms that
  explicitly declared their own `security`, and ignored forms with none —
  so one form declaring an open (`nosec`) override could mask a sibling
  form that had no override and so inherited a Thing-level default that
  DID require authentication, incorrectly returning
  `authorization.required: false` for the affordance as a whole. It now
  resolves each form's own effective security independently (its own
  override, or the Thing-level default when it has none) and requires
  authorization if any of them would.

`docs/capability-matrix.md` and `tests/wot-adapter-test.mjs` /
`tests/specs-adapter-test.mjs` updated accordingly.

## 0.1.4 — 2026-09-22

Fixes the five remaining audit findings (C–G) from 0.1.3's source
inspection, closing every open item except one documented, narrower gap.
`adapters/wot/index.js` is substantially rewritten; `sdk/javascript/agp.js`
gains one purely-additive export (`RISK_ORDER`) so the adapter and SDK
share one risk-ordering source of truth.

- **Fixed (C)**: WoT state projection no longer uses a schema `default` as
  a stand-in for an observed value — only a supplied live value or a WoT
  `const` (definitionally always known) counts as state. A property with
  only a `default` is correctly absent from `state` rather than invented.
  `writeOnly` properties are now always excluded from state, in both
  `thingDescriptionToAgp` and the `thingDescriptionToGraph` decomposition.
- **Fixed (D)**: parameter schema translation (`schemaParameter`,
  `inputParameters`) now preserves `object`/`array` structure and each
  property's real `required`-ness (read from the input schema's own
  `required` array, not hardcoded `true`). A schema shape this adapter
  can't represent is flagged `type: "unsupported", unsupported: true` with
  the original schema kept under `sourceSchema`, never silently coerced to
  `"string"`. `schema/access-graph.schema.json`'s parameter `type` enum
  extended accordingly (additive; existing string/number/integer/boolean
  parameters remain valid).
- **Fixed (E)**: every adapter entry point (`thingDescriptionToAgp`,
  `thingDescriptionToGraph`) now uses a per-call id allocator
  (`createIdAllocator`) that disambiguates a colliding `stableId()` output
  (e.g. two property names that only differ by case/punctuation produce
  `write_x` and `write_x-2`, not a silent overwrite in `AccessGraph`). The
  original source name is preserved on `metadata.wot_name`.
- **Fixed (F)**: authorization requirement (`requiresAuthorization`) now
  reads a form-level `security` override (WoT TD §5.3.4) per property/
  action, falling back to the Thing-level default only when no form
  override is declared — previously only the Thing-level `td.security`
  was read.
- **Fixed (G), with a documented remaining gap**: `x-agp-risk` /
  `x-agp-confirmation` for `physical_safety` / `security` / `financial` /
  `destructive` categories can now only raise the effective risk/
  confirmation requirement, never lower it below a policy floor
  (`CATEGORY_RISK_FLOOR`, `CATEGORY_CONFIRMATION_FLOOR`) — the same
  trust-model gap MCP's own tool-annotations spec documents for its hints.
  **Not closed**: the category itself (`x-agp-category`) is still
  source-declared, so a device could still mislabel a dangerous action to
  dodge the floor; closing that needs category classification from a
  reviewed/allowlisted source, not a client-side adapter — tracked in
  `ROADMAP.md`.
- Every fix above has a corresponding test in `tests/wot-adapter-test.mjs`,
  verified both by the test suite and by direct inspection of the
  generated AGP objects. `docs/capability-matrix.md` and `ROADMAP.md`
  updated to reflect all seven audit findings (A–G) as addressed.

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
