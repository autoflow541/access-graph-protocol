# Changelog

## 0.1.16 — 2026-09-22

Client capability negotiation — `docs/audit-2026-09-22.md` priority 4.

- New `negotiateCapabilities(object, clientCapabilities)`
  (`sdk/javascript/agp.js`): compares an object's declared
  `inputs`/`outputs` against what the current client session reports it
  can provide. Returns `canControl`/`canPerceive`, which channels are
  supported vs missing, and a plain-language `conflicts[]` explanation
  per gap — naming a working alternative when one exists ("can still be
  controlled here via touch") and saying so plainly when none does ("No
  alternative input is available in this session"), never inventing one.
  Takes no `profile` argument at all, so a capability gap can never be
  read as a diagnosis about the person rather than a fact about the
  session — checked by an arity assertion in the test, not just a
  comment. It only ever informs: nothing it returns disables or hides an
  action, so "the user can always override" holds by construction.
- New `tests/capability-negotiation-test.mjs`: full match, partial match
  with a named alternative, full mismatch with no invented alternative
  (mirrored for both inputs and outputs), the no-required-channels case,
  and the omitted-`clientCapabilities` default (nothing assumed
  available).
- `examples/execution-client/` gained a "Client capability negotiation"
  panel: four checkboxes (touch/voice input, visual/audio output) the
  person can toggle to simulate a session missing that channel, computed
  client-side — the one thing on that page not fetched from the service,
  since only the client can know its own session's channels.
  `service/run-local.mjs`'s demo thermostat now declares realistic
  `x-agp-inputs: ["touch","voice"]` / `x-agp-outputs: ["visual","audio"]`
  so there's something real to negotiate against. Verified live:
  unchecking "Voice input" produces "Hall thermostat also accepts voice,
  which this session doesn't report as available. It can still be
  controlled here via network, touch."; unchecking "Visual output"
  produces the mirrored output-side explanation; every action button,
  including "Emergency shutdown," stays enabled throughout (confirmed via
  the accessibility tree, not just visually).
- Not done: object-level only, no per-action channels; the checkboxes are
  a manual simulation, not real capability detection from an actual
  device or browser. Docs updated to say so plainly:
  `docs/audit-2026-09-22.md`, `NEXT.md`, `ROADMAP.md`'s M2 milestone.

## 0.1.15 — 2026-09-22

Accessible task inspector — `docs/audit-2026-09-22.md` priority 3.

- New `ExecutionService.inspect()` (`service/execution-service.js`) and
  `GET /devices/:id/inspect` (`service/http-server.js`): everything
  `describe()` returns, plus a per-action explanation — the
  server-resolved `requiresConfirmation`/`authorizationRequired` (via
  `AccessGraph.resolveAction`, which folds in the Access Profile, not
  just each action's own declared flags), `categoryTrust` ("reviewed" vs
  "declared" — the WoT adapter's category-trust provenance), and a
  structural `blocked`/`blockedReason` for the one block condition
  determinable without side effects: an unsupported parameter schema
  node. Exists so a client can explain *why* without creating and
  discarding a proposal just to find out.
- New tests (`tests/execution-service-test.mjs`,
  `tests/execution-http-server-test.mjs`) assert, in-process and over
  real HTTP: a category-only confirmation trigger is correctly reported
  even when an action's own `confirmation` flag is `false`; a
  structurally unsupported parameter is correctly flagged as blocked
  with a path-specific reason; unauthenticated/unknown-device calls are
  rejected the same way every other `inspect()`-adjacent call is.
- `examples/execution-client/` gained an "Accessible task inspector"
  section: every declared action (not just the ones rendered as buttons)
  as a native `<details>`/`<summary>` disclosure, no custom JS for the
  disclosure interaction, showing risk, category, classification
  provenance, confirmation/authorization requirements with a
  plain-language reason, parameters, and whether the action can be
  proposed at all. Verified live against the real service: mouse
  activation opens each entry with correct, server-computed content
  (cross-checked against a direct curl of `/inspect`); `Tab` reaches
  every entry. **Not verified**: synthetic `Enter`/`Space` activation
  through the browser-automation tool used for this check — reproduced
  identically on the page's pre-existing `<details>` block that shipped
  before this change, so this reads as a limitation of that tool's key
  dispatch against native UA default actions, not a defect in the
  markup, but it remains an open item rather than a confirmed one. No
  real screen reader has been used against this or any other browser
  example in this repo.
- Docs updated to match exactly what was and wasn't verified:
  `docs/audit-2026-09-22.md`, `NEXT.md`, `ROADMAP.md`'s M2 milestone,
  `service/README.md`.

## 0.1.14 — 2026-09-22

Documentation-only release: closes the specific gaps 0.1.13 left open —
every `examples/execution-client/` path that was only automated-tested is
now manually verified live. No code changed except a temporary,
fully-reverted local edit used to force a real dispatch timeout for
testing (`git diff` confirmed clean before committing).

- Manually clicked through, over real HTTP: authorization denial ("Deny"
  → "Authorization was denied.", no state change); cancel-before-dispatch
  ("Cancel" at the confirmation step → "Cancelled.", no dispatch); and
  dispatch timeout, by temporarily making `run-local.mjs`'s executor sleep
  5s against a 2s `dispatchTimeoutMs`.
- The timeout check produced a genuinely useful unplanned result rather
  than a scripted one: the client correctly reported "unknown, don't
  assume it failed" at the 2s mark, and the dispatch then actually
  *succeeded* in the background a few seconds later (state advanced to
  `mode: eco`, state version 2) — the client's *next* action attempt
  correctly detected this as `STALE_STATE` and auto-refreshed before
  proposing again. This is the exact real-world race
  `ExecutionService`'s state-version design exists to handle, observed
  actually happening end-to-end, not merely asserted in a unit test.
- Also read the page's accessibility tree directly (`read_page`) as a
  partial, evidence-based check: real `status`-role live regions, a
  correctly-labeled range input, and semantic buttons with descriptive
  text. This is not a substitute for an actual screen reader and is
  documented as such — `docs/capability-matrix.md`, `service/README.md`,
  `NEXT.md`, and `ROADMAP.md`'s M2 milestone are all updated to say
  precisely what was and wasn't verified, without rounding up.

## 0.1.13 — 2026-09-22

Closes the execution service's biggest remaining gap from 0.1.12: nothing
talked to it over the network yet. Now something does, and it was
verified live, not just unit-tested.

- **Added** `examples/execution-client/`: a real browser client for
  `service/` over actual HTTP — `examples/smart-device/` (the in-process
  simulation) is deliberately left unchanged rather than rewired, so both
  a pure client-side demo and a real-network one exist side by side.
- **Added** CORS support to `service/http-server.js`
  (`createExecutionHttpServer(service, { corsOrigin })`, defaulting to
  `"*"` for local development) so a browser on a different port can call
  it. Documented as a dev default, not a production posture — CORS only
  controls which origins may read a response; it does not weaken the
  authentication check, which still runs on every request regardless of
  origin. Covered by a new preflight/response-header test in
  `tests/execution-http-server-test.mjs`.
- **Manually verified live**, not just via the automated suite: opened
  the client against a running service, dragged the temperature slider,
  and walked propose → confirm → authorize → execute over real HTTP —
  `targetTemperature` actually moved 21 → 25 and the state version
  advanced 1 → 2, with zero console errors. Then stopped the service
  mid-session and confirmed the client showed a distinct "cannot reach
  the execution service" state rather than crashing or silently
  displaying stale data as current.
- Fixed a typo (`actionid` instead of `actionId`) in `service/run-local.mjs`
  caught by actually running it rather than assuming it was correct.
- **Not done**: authorization-denial, dispatch-timeout, and
  cancel-before-dispatch are implemented and covered by the automated
  suite but weren't individually clicked through live in a browser this
  pass; no actual screen reader was used to verify the page. `docs/capability-matrix.md`,
  `service/README.md`, `NEXT.md`, and `ROADMAP.md`'s M2 milestone all
  state this precisely rather than rounding up to "done."

## 0.1.12 — 2026-09-22

Starts the execution service — `ROADMAP.md` M2 and
`docs/audit-2026-09-22.md`'s #1 priority — as a real, tested, runnable
server-side authority, not a design sketch. Explicitly not finished: see
`service/README.md`, "What's not done yet," before treating this as more
than a start.

- **Added** `service/execution-service.js`: a server-side authority that
  never trusts a caller's claim about confirmation, authorization, or
  state — it re-derives its own answer from state it owns. This is a
  genuinely separate trust boundary from `SpecsActionSession`
  (client-side UX gate), not the same class running on a server. The
  `AccessGraph` passed to its constructor *is* the reviewed device/action
  allowlist (an unlisted device/action throws via
  `AccessGraph.resolveAction()`, so there's no separate allowlist to keep
  in sync). Reuses `adapters/specs/index.js`'s `validateParameters`
  (newly exported) rather than a third reimplementation.
- Implements the full proposal lifecycle: server-issued proposal ID,
  caller authentication re-checked on every mutating call (not just once),
  state-version staleness rejected both at `propose()` and again at
  `execute()` (state can change in between), proposal expiry, and
  duplicate-dispatch protection via a caller-generated `requestId` —
  replaying one within `requestRetentionMs` returns the original outcome
  without invoking the executor again. Outcomes: `succeeded` / `failed` /
  `unknown` (dispatch exceeded `dispatchTimeoutMs` — the executor may
  still complete, this service does not guess) / `denied` / `cancelled`.
- Authorization is a pluggable `authorizationProvider` — a real
  architectural improvement (one clean swap-in point instead of scattered
  client-side trust) but **not** a real authorization backend: the default
  `simulatedAuthorizationProvider` still just trusts what the caller
  claims. Documented, not glossed over, in three places
  (`service/README.md`, the class's own header comment, and
  `docs/audit-2026-09-22.md`).
- **Added** `service/http-server.js`: a thin, dependency-free HTTP layer
  (Node's built-in `http`, no framework) translating requests 1:1 into
  `ExecutionService` calls and error `.code`s into HTTP statuses.
  `service/run-local.mjs` boots it with the same simulated thermostat
  `examples/smart-device/` uses (`npm run service:dev`).
- **Tested**: `tests/execution-service-test.mjs` (in-process: auth,
  ownership, staleness at both propose and execute, nested parameter
  validation, duplicate-dispatch dedup verified via executor call count,
  denial, cancellation, expiry, dispatch timeout, executor failure not
  advancing state) and `tests/execution-http-server-test.mjs` (the same
  key properties over a real listening socket with real `fetch` calls,
  not just in-process). The duplicate-dispatch protection was verified by
  deliberately breaking it and confirming the test actually fails, not
  just written and assumed correct.
- Manually verified end-to-end against a live running instance via curl:
  stale-state rejection, then a full propose → confirm → authorize →
  execute cycle that actually changed `targetTemperature` from 21 to 24
  and advanced the state version from 1 to 2.
- **Not done** (see `service/README.md` and `NEXT.md`): no client talks to
  this over the network yet — `examples/smart-device/` still calls
  `SpecsActionSession`'s executor callback directly, in-process. No real
  device is connected. `ROADMAP.md` M2 is partially, not fully, checked
  off.

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
