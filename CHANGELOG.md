# Changelog

## 0.1.24: 2026-09-23

README rewrite: the actual center of gravity of this repo, not just a device protocol.

- The opening pitch only described "software, devices, robots, and
  environments," with no mention of the four AI-driven media adapters
  built this session (camera, webpage screenshot, PDF, WCAG scan) or the
  reuse claim that's the actual evidence behind them. Added a paragraph
  to "Why this exists" stating that claim directly: the same
  `ExecutionService` and `negotiateCapabilities()`, built once for a
  thermostat, run unmodified across six media types, two backed by
  already-deployed production services, not demos built for this repo.
- New "Beyond devices: camera, web, and document adapters" section,
  giving `adapters/vision-assistant/`, `adapters/web-vision/`,
  `adapters/web-scan/`, and `adapters/pdf-remediation/` the same
  narrative depth the ARIA/WoT/SPECS section already had, instead of
  leaving them as one-line bullets in the repository list.
- "Run it" updated: `npm ci` (the repo now has two deliberate dependency
  exceptions, `@node-wot/core` and `@anthropic-ai/sdk`), `npm run
  check:conformance`, `examples/vision-assistant/`'s service script, and
  an honest list of the four `service:dev*` scripts that have no
  dedicated browser demo yet (curl-only).
- "Status" updated to list all six proven media types instead of the
  original four.
- Fixed an internal inconsistency this rewrite would otherwise have
  introduced: the new "Why this exists" paragraph first said "five"
  media types while the pre-existing Repository bullets (written
  earlier this session) already established "sixth" for
  `adapters/web-scan/`. Reconciled to six, consistent with
  `ROADMAP.md`/`NEXT.md`'s existing numbering (web via ARIA counts as
  the first).
- No code changed; all 16 test suites still pass.

## 0.1.23: 2026-09-22

Scenario runner: the last item from the original five-item audit priority list.

- New `service/scenario-runner.mjs`: `runScenarios()` runs reproducible
  fault injection (authorization denial, stale state at execute,
  duplicate-request replay, malformed schema, dispatch timeout) against
  any real `ExecutionService`, producing a machine-readable pass/fail
  report (`docs/audit-2026-09-22.md` item 5). Four of five scenarios
  need no mock executor at all, since they're `ExecutionService`-level
  policy, not executor behavior; the timeout scenario is opt-in via a
  `buildHangingService` factory and honestly reported `"skipped"`, not
  silently omitted, when one isn't supplied.
- New `service/check-conformance.mjs` (`npm run check:conformance`): the
  actual deliverable the audit item asked for, not just a test. Runs the
  scenario runner against the real thermostat fixture and prints the
  real report: 5/5 pass, 0 skipped, against the real `ExecutionService`.
- New `tests/scenario-runner-test.mjs`: exercises all five scenarios,
  including that a deliberately broken `ExecutionService` (one where a
  denied proposal is still executable) is correctly reported `"fail"`,
  not silently passed. The runner's own correctness is checked, not just
  its happy path.
- Not done: not wired into CI; only exercised against the in-process
  `ExecutionService` API, never driven over HTTP end to end. As the
  audit item itself states and this doc repeats: a "pass" means this
  codebase's own fault handling behaved as documented, nothing about
  whether an underlying device or backend is actually accessible.
- Docs updated: `docs/audit-2026-09-22.md`, `README.md`, `ROADMAP.md`'s
  0.2 milestone (closing its pre-existing "Conformance test runner"
  item), `NEXT.md`.

## 0.1.22: 2026-09-22

A sixth media type, and a second real-production-backed one.

- New `adapters/web-scan/`: models a website and Auto-Flow's
  already-deployed WCAG scanner (scan.auto-flow.co, Playwright +
  axe-core) as an AGP object. Unlike every other AI leg in this repo,
  it's honestly labeled as a deterministic, rule-based audit
  (`source.type: "structured_api"`), not an AI judgment call, even
  though the real service's response also carries an AI-generated
  review alongside the rule results. One action, `check_accessibility`:
  no invented remediation step where the real backend has none.
- New `service/web-scan-executor.mjs`: the simplest integration of any
  leg so far, a plain JSON `{url}` body, no file encoding, since the
  scanner fetches and renders the page itself.
- New `service/run-local-web-scan.mjs`
  (`npm run service:dev:web-scan`), `dispatchTimeoutMs` raised to 60s
  (a real scan render takes longer than a device property write, same
  finding as the PDF leg).
- New `tests/web-scan-test.mjs`: object shape, zero-friction lifecycle,
  request/response plumbing, with `fetch` stubbed rather than calling
  the real service on every `npm test`.
- Verified live against **production**, not a simulation: the full
  propose → execute lifecycle over real HTTP, scanning
  `www.auto-flow.co` itself: score 89, 1 real issue, 48 real passes,
  ~19s observed.
- Docs updated: `README.md`, `ROADMAP.md`'s 0.2 milestone, `NEXT.md`,
  `SECURITY.md`.

## 0.1.21: 2026-09-22

A fifth media type, and the strongest reuse proof yet: zero new executor code.

- New `adapters/web-vision/`: describes or locates elements on a webpage
  from a screenshot alone, deliberately without reading the page's DOM
  or ARIA tree. `adapters/aria/index.js` already covers pages that
  cooperate; this covers ones that never will, the same way
  `adapters/vision-assistant/` covers a camera regardless of what it's
  pointed at. `find_element` takes a `query` parameter ("find the submit
  button"), a first for this pattern.
- `service/vision-executor.mjs` generalized: it now reads
  `metadata.describerMode` off any action instead of hardcoding
  vision-assistant's two action ids (matching the discipline
  `wot-executor.mjs` already used for `metadata.affordance`/`wot_name`),
  and passes an optional `query` through to the describer. This adapter
  needed *zero new executor code*, only a new object shape; the same
  file dispatches both media types unmodified beyond that
  generalization.
- `service/describers/simulated-describer.mjs` and
  `anthropic-describer.mjs` updated with `describe_page`/`find_element`
  modes and prompts.
- New `service/run-local-web-vision.mjs`
  (`npm run service:dev:web-vision`).
- New `tests/web-vision-test.mjs`: object shape, the shared executor
  actually dispatching both media types, `query` passthrough, and that
  `negotiateCapabilities()` correctly treats "camera" and
  "screen_capture" as distinct requirements rather than conflating them,
  with zero changes to that function.
- Verified live: a real, valid PNG file (Auto-Flow's own logo, not a
  placeholder string) sent through the full propose/execute HTTP
  lifecycle, `query` text correctly reaching the describer. Not
  verified: real screenshot capture from a live browser tab; no demo
  page built for this leg yet.
- Docs updated: `README.md`, `ROADMAP.md`'s 0.2 milestone, `NEXT.md`,
  `SECURITY.md`.

## 0.1.20: 2026-09-22

A fourth media type, the first backed by an already-deployed production service.

- New `adapters/pdf-remediation/`: models a PDF document and Auto-Flow's
  already-deployed AI-driven remediation service (pdf.auto-flow.co) as
  an AGP object. `check_accessibility` and `analyze` project the real
  `/validate` and `/autotag` endpoints as informational, no-confirmation
  actions; `remediate` projects the real `/remediate` endpoint,
  `risk: "low"` with confirmation required, since it is an AI making
  judgment calls (heading levels, alt text, reading order, table
  structure) that produce a new document, not purely informational.
- New `service/pdf-executor.mjs`: dispatches through real HTTP multipart
  requests using only Node's built-in `fetch`/`FormData`/`Blob`, no new
  HTTP dependency.
- New `additionalProperties: true`: a narrow, explicit opt-in on AGP's
  object-parameter schema (`adapters/specs/index.js`'s `validateValue`,
  `schema/access-graph.schema.json`) for genuinely open-ended object
  data. The PDF manifest is a large, variable, AI-generated structure
  tree; without this, `remediate`'s manifest parameter would have had to
  either fully re-declare that shape or reject every key in it. The
  closed-by-default behavior for every other object parameter (reject
  undeclared keys) is unchanged and still tested
  (`tests/proposal-validation-test.mjs`); `adapters/wot/index.js` also
  now reads this standard JSON Schema keyword through from a real Thing
  Description rather than silently dropping it.
- Verified live against **production**, not a local simulation: the full
  propose → confirm → execute lifecycle, over real HTTP, against
  pdf.auto-flow.co. A genuinely valid, PDF/UA-compliant remediated PDF
  came back (confirmed with the `file` command, not just a status code),
  with real `claude-sonnet-5` AI cost reported
  (`conformance.aiCost.costUsd`). Two real findings surfaced doing this,
  not staged: `ExecutionService` advances the state version on every
  successful dispatch, including purely informational ones, so a client
  must re-check state between *any* two proposals; and AI-augmented
  remediation needs a much longer `dispatchTimeoutMs` than a device
  property write (the default 10s failed against the real service, 60s
  did not, ~13s observed).
- New `tests/pdf-remediation-test.mjs`: object shape, confirmation
  gating, and the executor's request/response plumbing, with `fetch`
  stubbed rather than calling the real, billed production service on
  every `npm test`. The real-backend verification above was manual, not
  repeatable CI coverage.
- Docs updated: `README.md`, `ROADMAP.md`'s 0.2 milestone, `NEXT.md`,
  `SECURITY.md` (sending a document to a remediation backend is exactly
  why `remediate` requires confirmation, alongside it being an AI
  judgment call).

## 0.1.19: 2026-09-22

AI-described-environment capability, a non-IoT media type.

- New `adapters/vision-assistant/`: models "ask a camera what it sees"
  as an AGP object (`describe_scene`, `read_text`), not tied to one
  camera vendor. Both actions are `risk: "none"`, no confirmation, no
  authorization, by design: the real-world use case (a blind or
  low-vision person asking constantly throughout the day) breaks if
  every question needs a confirmation dialog.
- New `service/vision-executor.mjs`: a generic executor dispatching
  through a pluggable describer, same pattern as `wot-executor.mjs`.
  New `service/describers/simulated-describer.mjs` (default, clearly
  labeled placeholder) and `service/describers/anthropic-describer.mjs`
  (real, billed Anthropic API calls via the official SDK, active only
  with `ANTHROPIC_API_KEY` set; the key stays server-side in
  `service/run-local-vision.mjs`, never sent to the browser client).
- New `tests/vision-assistant-test.mjs`: object shape, executor
  dispatch, the simulated describer's honesty about not having looked
  at anything, and, critically, that `negotiateCapabilities()` (built
  for the WoT thermostat demo) works correctly against this new
  `camera` input requirement with zero changes to that function.
- New `examples/vision-assistant/`: real `getUserMedia` camera capture,
  real `SpeechSynthesis` output, talking to the same execution-service
  HTTP API every other example uses. Verified live: the service
  connects, and a denied camera permission correctly disables both
  action buttons and surfaces `negotiateCapabilities()`'s explanation
  rather than failing silently. Not verified: the camera-available
  happy path, since this environment has no real camera access.
- New `@anthropic-ai/sdk` dependency, used only by the optional real
  describer.
- New privacy consideration documented in `SECURITY.md`: a captured
  frame can contain bystanders who never consented to being described,
  which AGP's existing risk/confirmation model (built for action
  consequences, not data capture) does not yet address. Stated as an
  open gap, not a solved one.
- Docs updated: `README.md`, `ROADMAP.md`'s 0.2 milestone, `NEXT.md`,
  `SECURITY.md`.

## 0.1.18: 2026-09-22

Real node-wot execution: ADR-0001 point 4, `docs/adr-0001-wot-reuse.md`.

- New `service/wot-executor.mjs`: a generic `ExecutionService` executor
  that dispatches through a real `@node-wot/core` `ConsumedThing`
  (`readProperty`/`writeProperty`/`invokeAction`), driven entirely by the
  `metadata.affordance`/`metadata.wot_name` the WoT adapter already
  attaches to every action. Not thermostat-specific: works for any
  WoT-sourced AGP object without per-device code.
- New `service/virtual-thermostat.mjs`: a real Web of Things device,
  exposed over real HTTP via `@node-wot/binding-http`'s `HttpServer`
  (bound to `127.0.0.1` only, `nosec`, local development use). Same
  `x-agp-*` vocabulary as `run-local.mjs`'s literal Thing Description, so
  `adapters/wot/index.js` needed zero changes.
- New `service/run-local-wot.mjs`: fetches the virtual thermostat's real
  Thing Description (`WoT.requestThingDescription`, not a literal
  object), consumes it, and serves the identical execution-service HTTP
  API on port 8790. `run-local.mjs` is untouched: both the pure
  simulation and the real-protocol path exist side by side, same as
  `examples/smart-device/` vs `examples/execution-client/`.
- New `@node-wot/core`, `@node-wot/binding-http`, `@node-wot/td-tools`
  dependencies: the one deliberate exception to this repo's
  dependency-free posture, scoped to these three files only. `npm audit`
  reports moderate/high transitive advisories in `node-wot`'s own HTTP
  router/query-string parsing with no non-breaking fix available;
  documented plainly in `SECURITY.md` rather than hidden, and judged
  acceptable for a loopback-bound, `nosec` development Thing.
- New `tests/wot-executor-test.mjs`: boots a real node-wot Servient and a
  real node-wot client in-process (no mocks), then asserts, over real
  HTTP: a property write dispatched through `ExecutionService` is
  independently confirmed by reading the Thing's own endpoint directly
  (bypassing `ExecutionService`); an action invocation actually runs the
  Thing's real handler; `AccessGraph`'s state mirror is resynced from the
  real Thing after every dispatch; a value AGP's own schema validation
  rejects never reaches the Thing at all.
- Manually verified live end to end, independent of the automated suite:
  booted both processes, ran propose → confirm → authorize → execute
  over real HTTP against the real service, then confirmed the change by
  querying the virtual Thing's own HTTP endpoint directly, not by
  trusting `ExecutionService`'s report of success.
- Not done: `virtual-thermostat.mjs` is still simulated hardware, not a
  physical device: "one real lamp" (`ROADMAP.md` M3) still needs actual
  hardware or a real device bridge. `examples/execution-client/` was not
  separately re-verified live against this backend (defaults to
  `run-local.mjs`'s port), though it speaks the identical HTTP contract
  already verified working here.
- Docs updated to match: `docs/adr-0001-wot-reuse.md`, `ROADMAP.md`'s M2
  (checked) and M3 (still unchecked, with the prerequisite noted),
  `NEXT.md`, `docs/audit-2026-09-22.md` item 6, `service/README.md`,
  `SECURITY.md`.

## 0.1.17: 2026-09-22

Style-only release: removed every em dash from the repo (prose, code
comments, docs, UI copy), per explicit feedback. Replaced with a colon,
comma, semicolon, or period depending on what the surrounding sentence
actually needed, not a blind find-and-replace: verified afterward that no
two colons landed adjacent to each other and that CHANGELOG.md's version
headings still read cleanly (`## X.Y.Z: DATE`). No behavior changed; all
10 test suites still pass, including `tests/lens-assets-sync-test.mjs`
after re-running `npm run sync:lens` so the Lens Studio copies match.

## 0.1.16: 2026-09-22

Client capability negotiation: `docs/audit-2026-09-22.md` priority 4.

- New `negotiateCapabilities(object, clientCapabilities)`
  (`sdk/javascript/agp.js`): compares an object's declared
  `inputs`/`outputs` against what the current client session reports it
  can provide. Returns `canControl`/`canPerceive`, which channels are
  supported vs missing, and a plain-language `conflicts[]` explanation
  per gap: naming a working alternative when one exists ("can still be
  controlled here via touch") and saying so plainly when none does ("No
  alternative input is available in this session"), never inventing one.
  Takes no `profile` argument at all, so a capability gap can never be
  read as a diagnosis about the person rather than a fact about the
  session: checked by an arity assertion in the test, not just a
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
  client-side: the one thing on that page not fetched from the service,
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

## 0.1.15: 2026-09-22

Accessible task inspector: `docs/audit-2026-09-22.md` priority 3.

- New `ExecutionService.inspect()` (`service/execution-service.js`) and
  `GET /devices/:id/inspect` (`service/http-server.js`): everything
  `describe()` returns, plus a per-action explanation: the
  server-resolved `requiresConfirmation`/`authorizationRequired` (via
  `AccessGraph.resolveAction`, which folds in the Access Profile, not
  just each action's own declared flags), `categoryTrust` ("reviewed" vs
  "declared": the WoT adapter's category-trust provenance), and a
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
  through the browser-automation tool used for this check: reproduced
  identically on the page's pre-existing `<details>` block that shipped
  before this change, so this reads as a limitation of that tool's key
  dispatch against native UA default actions, not a defect in the
  markup, but it remains an open item rather than a confirmed one. No
  real screen reader has been used against this or any other browser
  example in this repo.
- Docs updated to match exactly what was and wasn't verified:
  `docs/audit-2026-09-22.md`, `NEXT.md`, `ROADMAP.md`'s M2 milestone,
  `service/README.md`.

## 0.1.14: 2026-09-22

Documentation-only release: closes the specific gaps 0.1.13 left open:
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
  `mode: eco`, state version 2): the client's *next* action attempt
  correctly detected this as `STALE_STATE` and auto-refreshed before
  proposing again. This is the exact real-world race
  `ExecutionService`'s state-version design exists to handle, observed
  actually happening end-to-end, not merely asserted in a unit test.
- Also read the page's accessibility tree directly (`read_page`) as a
  partial, evidence-based check: real `status`-role live regions, a
  correctly-labeled range input, and semantic buttons with descriptive
  text. This is not a substitute for an actual screen reader and is
  documented as such: `docs/capability-matrix.md`, `service/README.md`,
  `NEXT.md`, and `ROADMAP.md`'s M2 milestone are all updated to say
  precisely what was and wasn't verified, without rounding up.

## 0.1.13: 2026-09-22

Closes the execution service's biggest remaining gap from 0.1.12: nothing
talked to it over the network yet. Now something does, and it was
verified live, not just unit-tested.

- **Added** `examples/execution-client/`: a real browser client for
  `service/` over actual HTTP: `examples/smart-device/` (the in-process
  simulation) is deliberately left unchanged rather than rewired, so both
  a pure client-side demo and a real-network one exist side by side.
- **Added** CORS support to `service/http-server.js`
  (`createExecutionHttpServer(service, { corsOrigin })`, defaulting to
  `"*"` for local development) so a browser on a different port can call
  it. Documented as a dev default, not a production posture: CORS only
  controls which origins may read a response; it does not weaken the
  authentication check, which still runs on every request regardless of
  origin. Covered by a new preflight/response-header test in
  `tests/execution-http-server-test.mjs`.
- **Manually verified live**, not just via the automated suite: opened
  the client against a running service, dragged the temperature slider,
  and walked propose → confirm → authorize → execute over real HTTP:
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

## 0.1.12: 2026-09-22

Starts the execution service: `ROADMAP.md` M2 and
`docs/audit-2026-09-22.md`'s #1 priority: as a real, tested, runnable
server-side authority, not a design sketch. Explicitly not finished: see
`service/README.md`, "What's not done yet," before treating this as more
than a start.

- **Added** `service/execution-service.js`: a server-side authority that
  never trusts a caller's claim about confirmation, authorization, or
  state: it re-derives its own answer from state it owns. This is a
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
  duplicate-dispatch protection via a caller-generated `requestId`:
  replaying one within `requestRetentionMs` returns the original outcome
  without invoking the executor again. Outcomes: `succeeded` / `failed` /
  `unknown` (dispatch exceeded `dispatchTimeoutMs`: the executor may
  still complete, this service does not guess) / `denied` / `cancelled`.
- Authorization is a pluggable `authorizationProvider`: a real
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
  this over the network yet: `examples/smart-device/` still calls
  `SpecsActionSession`'s executor callback directly, in-process. No real
  device is connected. `ROADMAP.md` M2 is partially, not fully, checked
  off.

## 0.1.11: 2026-09-22

Fixes a real UI/gate confirmation-policy mismatch flagged (but not yet
fixed) in `docs/audit-2026-09-22.md`: `AccessGraph.resolveAction()` (the
actual gate `SpecsActionSession.request()` calls) and `renderControls()`
(what `toSpecsView`'s per-action `cue` and the SPECS panel's button
labels are built from) used to be two independently-maintained
confirmation computations, and they had drifted: `renderControls` never
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

## 0.1.10: 2026-09-22

Applied from a patch built independently against 0.1.9 (`df8b8ba`) by
another session, after its own review, audit, and testing. Reviewed
line-by-line and independently re-verified (`npm test`, all 7 suites)
before merging: see `docs/audit-2026-09-22.md` for the full audit.

- Enforce nested numeric bounds/enums and reject undeclared parameters.
- Show target and parameter values in confirmation; support explicit top-level sensitive-field redaction.
- Add opt-in proposal expiry with a testable clock and structured expiration code.
- Add end-to-end adapter/session regression coverage, engineering audit, and prioritized pilot plan.
- Refresh generated Lens adapter source; Lens compilation and hardware testing remain unverified.
- Also included: `parametersMatch()` used to only sort top-level
  parameter keys before comparing, so a resubmission with
  semantically-identical but differently-ordered *nested* object keys
  would have been wrongly rejected as not matching the confirmed
  proposal: noticed during review while tracing the new nested-object
  test cases; now compares a fully canonicalized (recursively key-sorted)
  form.

## 0.1.9: 2026-09-22

Extends the same audit rigor applied to the WoT adapter (0.1.4/0.1.5) to
`adapters/aria/index.js`, which had never received it. Found and fixed two
real issues by reading the code and verifying against both hand-written
DOM mocks and the failure scenarios they were built to reproduce.

- **Fixed**: `adapters/aria/index.js`'s `stableId()` had the exact same
  identifier-collision class as WoT's finding E, completely unfixed:
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
  copy-pasted a second time: which is exactly the kind of duplication
  that let this bug class go unfixed in one adapter after being fixed in
  another. `scanAria()` creates one allocator per scan and threads it
  through `stableId()`; a standalone `ariaElementToAgp()` call (not
  through `scanAria`) has no allocator, since collision detection needs
  visibility across a scan's multiple elements: this is documented
  behavior, not a remaining gap.
- **Fixed**: form submission defaulted to `risk: "medium"` paired with an
  explicit `confirmation: false` and no `category`: opting OUT of
  confirmation for an action the adapter has no way to know is actually
  safe (a form can be a search box or a payment), inconsistent with the
  fail-safe default this session established elsewhere (an unclassified
  WoT write defaults to medium risk *with* confirmation required;
  `specification/AGP-0.1.md`). Now defaults to `confirmation: true` with
  `category: "form_submission"`, so an Access Profile can also target it.
- `tests/aria-adapter-test.mjs` extended with regression tests for both
  fixes. `docs/capability-matrix.md` updated.

## 0.1.8: 2026-09-22

Closes the previously-flagged Lens Studio gap: a parameterized action
(e.g. the thermostat's `write_targettemperature`) was shown as read-only
state with no way to actually set it in the Lens, unlike the browser demo.

- **Added** `examples/specs/lens-project/Assets/Scripts/AgpParameterSlider.ts`,
  a numeric-parameter slider built on `SpectaclesUIKit.Slider` (verified
  against Snap's published scripting API: not the deprecated
  `SpectaclesInteractionKit.Slider`). `Slider.currentValue` is normalized
  to [0, 1] with no native min/max, so this class does the linear mapping
  to and from the parameter's actual `minimum`/`maximum` itself, and only
  proposes an action (`selectAction`) once dragging finishes
  (`Slider.onFinished`), not on every drag tick: mirroring the browser
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
against Snap's documented API and against real adapter output: not
verified running in Lens Studio or on Spectacles hardware.

## 0.1.7: 2026-09-22

Documentation-only release: researches the two device/execution-layer
systems `ROADMAP.md` already named as "to evaluate" (Matter, Home
Assistant) but had never actually looked into, and extends
`docs/adr-0001-wot-reuse.md` and `docs/prior-art-and-positioning.md` with
the findings. No code changed; `npm test` is unaffected.

- **Matter**: its Node → Endpoint → Cluster → {attributes, commands,
  events} data model and fabric-scoped ACL (cumulative View/Operate/
  Manage/Administer privileges per command) map onto AGP's shape and
  authorization concept the same way WoT's TD does: and, like WoT, has
  no risk or confirmation concept at all. ADR-0001 extended (item 6) so a
  future Matter adapter starts from this decision instead of re-deriving
  it.
- **Home Assistant**: its WebSocket `call_service` API
  (`{domain, service, service_data, target}`) has no risk classification
  or destructive-action warning of any kind: confirmed by reading the
  actual API docs, not assumed. A future Home Assistant execution backend
  needs its own reviewed `domain`/`service` → category mapping; ADR-0001
  (item 5) and the `ROADMAP.md` M2 milestone updated accordingly.
- Strengthens `docs/prior-art-and-positioning.md`'s positioning statement:
  three independent, real, shipping systems (WoT, Matter, Home Assistant)
  all have authorization but no accessibility-oriented risk/confirmation
  layer: evidence that gap is real and consistently unaddressed, not
  something this project imagined or is duplicating.
- `ROADMAP.md`'s Matter and Home Assistant lines now point at the
  decisions already made instead of reading as unresearched placeholders.

## 0.1.6: 2026-09-22

Documentation-only release: extends the prior-art research and feeds its
findings back into the protocol specification, and corrects README/ROADMAP
text that had gone stale across 0.1.2–0.1.5's changes. No code changed;
`npm test` is unaffected.

- Added two prior-art comparisons to `docs/prior-art-and-positioning.md`:
  - **AccessKit**: a real, actively developed cross-platform accessibility
    abstraction (Rust; Windows/macOS/Linux/Android adapters, iOS in
    progress). It has no risk/confirmation model at all, which is correct
    for what it solves ("invoke this button" is exactly as safe as a mouse
    click): a clean differentiator for where AGP's scope actually starts.
  - **Apple App Intents**: its `requestConfirmation` API has documented
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

## 0.1.5: 2026-09-22

Fixes four regressions in 0.1.4's fixes, independently reproduced and
reported against commit `7441eda` (not just read from commit messages).
Each is now covered by a regression test that was verified failing
against the pre-fix code before the fix, and verified passing after,
and by direct inspection of the actual output, not just a green exit code.

- **Fixed**: `adapters/specs/index.js` `typeMatches()` had no branch for
  the `object`/`array` parameter types `adapters/wot/index.js` can now
  produce (0.1.4, finding D): it fell through to a `typeof value ===
  "string"` check for anything else, so a genuinely valid object
  parameter was rejected and a bare string supplied in its place was
  wrongly accepted. `typeMatches` now recursively validates object
  (`properties`) and array (`items`) structure, and an `unsupported`
  parameter schema is rejected outright by `validateParameters` rather
  than reaching type matching at all: this session cannot verify a
  value against a structure the adapter itself flagged as unrepresentable.
- **Fixed**: a "confirmed" proposal could still be mutated after
  confirmation: `pending` was a plain, unfrozen, publicly-writable
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
  unrelated, naturally-suffixed name: three distinct names could produce
  `a`, `a-2`, `a-2` instead of `a`, `a-2`, `a-3`. It now checks the
  candidate against every id already handed out and keeps incrementing
  until it finds one that's actually free.
- **Fixed**: `requiresAuthorization()` only inspected forms that
  explicitly declared their own `security`, and ignored forms with none:
  so one form declaring an open (`nosec`) override could mask a sibling
  form that had no override and so inherited a Thing-level default that
  DID require authentication, incorrectly returning
  `authorization.required: false` for the affordance as a whole. It now
  resolves each form's own effective security independently (its own
  override, or the Thing-level default when it has none) and requires
  authorization if any of them would.

`docs/capability-matrix.md` and `tests/wot-adapter-test.mjs` /
`tests/specs-adapter-test.mjs` updated accordingly.

## 0.1.4: 2026-09-22

Fixes the five remaining audit findings (C–G) from 0.1.3's source
inspection, closing every open item except one documented, narrower gap.
`adapters/wot/index.js` is substantially rewritten; `sdk/javascript/agp.js`
gains one purely-additive export (`RISK_ORDER`) so the adapter and SDK
share one risk-ordering source of truth.

- **Fixed (C)**: WoT state projection no longer uses a schema `default` as
  a stand-in for an observed value: only a supplied live value or a WoT
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
  override is declared: previously only the Thing-level `td.security`
  was read.
- **Fixed (G), with a documented remaining gap**: `x-agp-risk` /
  `x-agp-confirmation` for `physical_safety` / `security` / `financial` /
  `destructive` categories can now only raise the effective risk/
  confirmation requirement, never lower it below a policy floor
  (`CATEGORY_RISK_FLOOR`, `CATEGORY_CONFIRMATION_FLOOR`): the same
  trust-model gap MCP's own tool-annotations spec documents for its hints.
  **Not closed**: the category itself (`x-agp-category`) is still
  source-declared, so a device could still mislabel a dangerous action to
  dodge the floor; closing that needs category classification from a
  reviewed/allowlisted source, not a client-side adapter: tracked in
  `ROADMAP.md`.
- Every fix above has a corresponding test in `tests/wot-adapter-test.mjs`,
  verified both by the test suite and by direct inspection of the
  generated AGP objects. `docs/capability-matrix.md` and `ROADMAP.md`
  updated to reflect all seven audit findings (A–G) as addressed.

## 0.1.3: 2026-09-22

Source-inspection audit and planning docs prompted by an external research
brief comparing AGP to prior art (Universal Remote Console, W3C Web of
Things, WAI-Adapt, MCP, A2UI, XR accessibility research). See
`docs/prior-art-and-positioning.md`, `docs/capability-matrix.md`,
`docs/adr-0001-wot-reuse.md`, and the milestone plan added to
`ROADMAP.md`.

- **Fixed**: `SpecsActionSession.request()` now validates and immutably
  binds an action's parameters at proposal time. `execute()` no longer
  accepts new parameters to run with: it runs the bound proposal, and
  rejects (rather than silently accepting) an attempt to supply different
  parameters than what was confirmed and authorized. This closes a real
  confirmation/execution mismatch: previously, `request()`/`confirm()`
  only ever referenced an action id, so a user could confirm one action
  and a different set of parameters could run at `execute()` time. See
  `tests/specs-adapter-test.mjs` for the tests proving this.
- **Fixed**: the authorization step in both the browser demo
  (`examples/smart-device/app.js`) and the Lens
  (`examples/specs/lens-project/`) now visibly and audibly discloses
  "(Simulated)": in the prompt text, the caption, and the spoken
  announcement, not only the button label: because this reference
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

## 0.1.2: 2026-09-21

- Added a real Lens Studio (SPECS 27) project source tree at `examples/specs/lens-project/`, targeting Lens Studio 5.22+, Spectacles UI Kit, and the Spectacles Interaction Kit: loads an AGP object and Access Profile, renders world-locked controls, supports hand input and exact-phrase voice commands (via the Spectacles ASR Module), and supports captions/speech (via the Text To Speech Module), large text, high contrast, reduced motion, and one-step interaction: all driven by the existing, unmodified SPECS adapter and SDK.
- Connected the simulated WoT thermostat (`examples/smart-device/`) as the Lens's first device, reusing the same Thing Description.
- Kept confirmation and authorization as two separate, explicit gate steps in the Lens, and never treats voice, hand input, or possession of the glasses as authorization (see `AgpConfirmationAuthorizationGate.ts` and `SECURITY.md`).
- Added `scripts/sync-lens-assets.mjs` and `tests/lens-assets-sync-test.mjs` so the Lens always runs the exact same, already-tested `sdk/javascript/agp.js` / `adapters/specs/index.js` / `adapters/wot/index.js` rather than a hand-copied duplicate.
- Added `tests/lens-access-profile-test.mjs` validating the Lens's default Access Profile against `schema/access-profile.schema.json`'s shape.
- Documented the Lens Studio editor wiring (scene hierarchy, Inspector fields, known gaps) in `examples/specs/lens-project/SETUP.md`.

## 0.1.1: 2026-09-21

- Added a W3C Web of Things Thing Description adapter.
- Added a simulated smart thermostat demo.
- Added a SPECS presentation adapter, gated action session, and Lens Studio controller contract.
- Added WoT and SPECS tests and expanded safety guidance for XR input and device actions.

## 0.1.0: 2026-09-21

- Initial AGP object and Access Profile schemas
- Dependency-free JavaScript reference SDK
- Risk and confirmation model
- Adaptive website demonstration
- Simulated drone demonstration
- Initial HTML/ARIA adapter
- Architecture diagram and interoperability roadmap
- Apache-2.0 license, contribution guidance, security notes, and issue templates
