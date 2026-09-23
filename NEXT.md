# Next milestone

Start with `docs/audit-2026-09-22.md` and `service/README.md`. Run `npm test`.

## Execution service: started, not finished

`service/execution-service.js` + `service/http-server.js` now exist,
tested (`tests/execution-service-test.mjs`,
`tests/execution-http-server-test.mjs`) both in-process and over real
HTTP. Done:

- Device invocation stays simulated (`service/run-local.mjs` reuses the
  same thermostat fixture `examples/smart-device/` and
  `examples/specs/lens-project/` use).
- A caller is authenticated and the allowlist is enforced server-side:
  the `AccessGraph` passed to the constructor *is* the reviewed allowlist.
- Confirmation/authorization/execution are all bound to a server-issued
  proposal ID, the target/action, validated parameters, an expiry, and
  the state version observed at proposal time: re-checked again at
  dispatch time, not just at proposal time.
- Permissions are rechecked at dispatch (not just at proposal time);
  request IDs are recorded; replay retention is `requestRetentionMs`,
  and restart behavior is explicit: in-memory only, nothing survives a
  restart: see `service/README.md`.
- Outcomes are succeeded / failed / unknown (dispatch timeout) /
  cancelled / denied, each with a distinct, tested code path.

A real browser client now exists too: `examples/execution-client/` talks
to `service/` over actual HTTP (CORS added to `http-server.js` for this).
Every gate/outcome path was clicked through live over real HTTP, not just
covered by the automated suite: success, authorization denial,
disconnection, cancel-before-dispatch, and dispatch timeout. The timeout
check turned up a genuinely useful unplanned result: the server-side
dispatch was made to run past `dispatchTimeoutMs`, the client correctly
reported "unknown, don't assume it failed," and the dispatch then
actually succeeded seconds later in the background: the next action
attempt correctly hit `STALE_STATE` and auto-recovered. That's the real
race this design exists to handle, observed actually happening. No actual
screen reader was used to verify the page.

Not done: this is the actual next work, not "still open" in the vague
sense:

- **Authorization is still simulated.** The default
  `authorizationProvider` trusts whatever the caller claims. A real
  provider (paired-device approval, OAuth introspection, ...) is a clean
  swap-in point now, but nobody has built one.
- **No physical device connected.** The `node-wot` integration itself is
  now done (see "Real WoT execution," below); "one real lamp" (`ROADMAP.md`
  M3) still needs actual hardware or a real device bridge, which this
  isn't.
- **No scenario runner**:
  `docs/audit-2026-09-22.md`'s next priority after capability negotiation.

## Accessible task inspector: started, not finished

`ExecutionService.inspect()` (`service/execution-service.js`) and
`GET /devices/:id/inspect` (`service/http-server.js`) exist and are
tested in-process and over real HTTP. It returns, per action: the
server-resolved confirmation/authorization verdict (not just the
action's own declared flags: folds in the Access Profile via
`AccessGraph.resolveAction`), category-trust provenance ("reviewed" vs
"declared"), and a structural blocked reason where one exists (currently
only: an unsupported parameter schema). Rendered in
`examples/execution-client/` as a native `<details>`/`<summary>` per
action, no custom JS for the disclosure itself.

Verified live: mouse activation opens each entry with correct,
server-computed content (cross-checked against a direct curl of the
endpoint). `Tab` moves focus through every entry. **Not verified**:
synthetic `Enter`/`Space` activation through the browser-automation tool
used for this check: it also failed identically on the page's
pre-existing `<details>` block that shipped before this change, so this
reads as a limitation of that tool's key dispatch against native UA
default actions, not a markup defect, but it is still an open item, not
a confirmed one. No real screen reader has been used against this or any
other browser example in this repo. See `docs/audit-2026-09-22.md` item
3 and `ROADMAP.md`'s M2 milestone.

## Client capability negotiation: started, not finished

`negotiateCapabilities()` (`sdk/javascript/agp.js`) compares an object's
declared `inputs`/`outputs` against what the current client session
reports, explains any gap in plain language, names a working alternative
when one exists, and never blocks: it takes no `profile` argument, so a
capability gap can never be read as a diagnosis about the person. Tested
(`tests/capability-negotiation-test.mjs`) and rendered live in
`examples/execution-client/` as togglable checkboxes against a demo
thermostat now declaring real `touch`/`voice`/`visual`/`audio` channels.
Not done: object-level only (no per-action channels), and the checkboxes
are a manual simulation: nothing here reads a real device's or browser's
actual capabilities. See `docs/audit-2026-09-22.md` item 4.

## Real WoT execution: started, not finished

`service/wot-executor.mjs` dispatches an `ExecutionService` action
through a real `@node-wot/core` `ConsumedThing`
(`readProperty`/`writeProperty`/`invokeAction`), driven by the
`metadata.affordance`/`metadata.wot_name` the WoT adapter already
attaches, so it works for any WoT-sourced object without per-device code.
`service/virtual-thermostat.mjs` exposes a real Thing over real HTTP
(`@node-wot/binding-http`); `service/run-local-wot.mjs` fetches its
actual Thing Description and runs the unmodified `adapters/wot/index.js`
against it. This is ADR-0001 point 4 (`docs/adr-0001-wot-reuse.md`),
done: AGP no longer needs to reimplement WoT protocol bindings for
dispatch.

Verified in `tests/wot-executor-test.mjs` and manually: a property write
dispatched through `ExecutionService` was independently confirmed by
reading the real Thing's own HTTP endpoint directly (bypassing
`ExecutionService` entirely); `AccessGraph`'s local state mirror is
resynced from the real Thing after every dispatch; a value AGP's own
schema validation rejects never reaches the Thing at all. Not done: this
is still simulated hardware (a Node process, not a physical device), and
`examples/execution-client/` was not separately re-verified live against
this backend, though it speaks the identical HTTP contract already
verified working. `node-wot`'s own dependency tree carries transitive
advisories with no non-breaking fix; see `SECURITY.md`.

## AI-described-environment capability: started, not finished

`adapters/vision-assistant/` models "ask a camera what it sees" as an
AGP object: `describe_scene` and `read_text`, both `risk: "none"`, no
confirmation, no authorization, by design, since the real-world use case
(a blind or low-vision person asking constantly throughout the day)
breaks if every question needs a confirmation dialog. Not tied to one
camera vendor: any source that can produce a still frame (glasses, phone,
webcam) fits the same object. `service/vision-executor.mjs` dispatches
through a pluggable describer: `service/describers/simulated-describer.mjs`
(default, clearly labeled) or `service/describers/anthropic-describer.mjs`
(real, billed Anthropic API calls, only active with `ANTHROPIC_API_KEY`
set).

This exists specifically to prove AGP's execution model and
`negotiateCapabilities()` were never IoT-specific: both were built for
the smart-thermostat demo and work here completely unmodified. Verified
in `tests/vision-assistant-test.mjs` and live: the full propose/execute
lifecycle over real HTTP; `negotiateCapabilities()` correctly explaining
a missing `camera` input with the exact same function, zero changes;
in `examples/vision-assistant/`, a denied camera permission correctly
disables both action buttons and surfaces that explanation rather than
failing silently or leaving stale-looking controls enabled.

Not verified: the camera-available happy path (successful capture, frame
sent, description received, spoken aloud) in this environment, which has
no real camera access, only the correctly-handled denied-permission path.
The real Anthropic describer exists as real code but was not exercised
live (no API key configured here). `ANTHROPIC_API_KEY` stays server-side
in `service/run-local-vision.mjs`, never sent to the browser client; see
`SECURITY.md` for the new privacy consideration this adapter introduces
(a captured frame can contain bystanders who never consented), which AGP's
existing risk model does not yet address.

## AI-driven document remediation capability: started, not finished

`adapters/pdf-remediation/` is the fourth media type, and the first
backed by an already-deployed production service (pdf.auto-flow.co)
instead of something built for this repo. `check_accessibility` and
`analyze` project the real `/validate` and `/autotag` endpoints as
informational actions; `remediate` projects the real `/remediate`
endpoint and requires confirmation, since it is an AI making judgment
calls that produce a new document.

Verified live against production, for real: the full propose → confirm →
execute lifecycle over real HTTP, a genuinely valid PDF/UA-compliant
remediated file (confirmed with `file`, not just a status code), real
`claude-sonnet-5` AI cost reported. Two real findings came out of this,
not staged for the demo:

- `ExecutionService` advances the state version on every successful
  dispatch, including purely informational ones, so a client must
  re-check state between *any* two proposals, not only after an action
  that changed something. Worth revisiting: should read-only dispatches
  advance state at all?
- AI-augmented remediation needs a much longer `dispatchTimeoutMs` than a
  device property write. The default 10s failed against the real
  service; 60s did not, at ~13s observed.

Also added: `additionalProperties: true`, a narrow opt-in on AGP's
object-parameter schema (`adapters/specs/index.js`, `schema/access-graph.schema.json`)
for genuinely open-ended object data, so the PDF manifest (a large,
variable, AI-generated structure) does not have to be fully re-declared
field-by-field to pass validation. The closed-by-default behavior for
every other object parameter is unchanged and tested
(`tests/proposal-validation-test.mjs`).

Not done: `tests/pdf-remediation-test.mjs` stubs the network rather than
calling the real, billed production service on every `npm test`; the
real-backend verification above was manual, not repeatable CI coverage.
No browser demo yet (unlike vision-assistant/execution-client).

## AI-described-webpage capability: started, not finished

`adapters/web-vision/` is a fifth media type: describes or locates
elements on a webpage from a screenshot alone, deliberately never
reading the page's DOM or ARIA tree. `adapters/aria/index.js` already
covers pages that cooperate; this covers ones that never will, using the
same approach vision-assistant uses for a camera, applied to a browser
tab instead. `find_element` needed a target to search for, so
`service/vision-executor.mjs` was extended to pass an optional `query`
through to the describer.

This is the strongest reuse proof yet: the executor built for
vision-assistant's camera actions dispatches this adapter's actions with
*zero new executor code*, because it was generalized to read
`metadata.describerMode` off any action instead of hardcoding two action
ids (matching how `wot-executor.mjs` already reads
`metadata.affordance`/`wot_name` instead of hardcoding a device). Only a
new object shape was needed.

Verified live: a real, valid PNG file (Auto-Flow's own logo, not a
placeholder string) sent through the full propose/execute lifecycle over
real HTTP, with the `query` text correctly reaching the describer.
`negotiateCapabilities()` correctly treats "camera" and "screen_capture"
as distinct requirements, not the same thing, with no changes to that
function. Not verified: real screenshot capture from a live browser tab.
No demo page exists yet for this leg (unlike vision-assistant's
`examples/vision-assistant/`).

## WCAG scan capability: started, not finished

`adapters/web-scan/` is a sixth media type, and a second real-production-
backed one (Auto-Flow's scan.auto-flow.co, Playwright + axe-core), after
`adapters/pdf-remediation/`. Unlike every other AI leg in this repo, it's
honestly labeled as a deterministic, rule-based audit
(`source.type: "structured_api"`), not an AI judgment call, even though
the real service's response also carries an AI-generated review
alongside the rule results. One action, `check_accessibility`: no
invented remediation step where the real backend has none.

Verified live against production, for real: the full propose → execute
lifecycle over real HTTP, scanning `www.auto-flow.co` itself (score 89,
1 real issue, 48 real passes, ~19s observed). The simplest integration
of any leg so far: a plain `{url}` JSON body, no file encoding needed,
since the scanner fetches and renders the page itself. Same
`dispatchTimeoutMs` finding as the PDF leg: a real scan takes longer
than a device property write, so the default 10s was raised to 60s.

Not done: `tests/web-scan-test.mjs` stubs the network rather than
calling the real service on every `npm test`; the real-backend
verification above was manual, not repeatable CI coverage. No browser
demo yet.

## Scenario runner: started, not finished

`service/scenario-runner.mjs`'s `runScenarios()` is the last item from
`docs/audit-2026-09-22.md`'s original five-item priority list: reproducible
fault injection (authorization denial, stale state at execute,
duplicate-request replay, malformed schema, dispatch timeout) against
any real `ExecutionService`, producing a machine-readable pass/fail
report. Four of five scenarios need no mock executor, since they're
`ExecutionService`-level policy, not executor behavior; the timeout
scenario is opt-in via a `buildHangingService` factory and honestly
reported `"skipped"`, not silently omitted, when one isn't supplied.

Its own correctness is tested, not just its happy path
(`tests/scenario-runner-test.mjs`): a deliberately broken service
(denial that doesn't actually block execute()) is correctly reported
`"fail"`, not silently passed. `service/check-conformance.mjs`
(`npm run check:conformance`) is the actual deliverable: runs it against
the real thermostat fixture and prints the real report, 5/5 pass, 0
skipped.

Not done: not wired into CI; only exercised against the in-process
`ExecutionService` API, never driven over HTTP end to end. As stated in
the audit item itself and repeated here so a report is never read as
more than this: a "pass" means this codebase's own fault handling
behaved as documented, nothing about whether an underlying device or
backend is actually accessible.

## Still open

WoT schema coverage, cross-discovery stable IDs, Lens Studio/hardware
verification, real screen-reader verification of every browser example,
per-action capability channels, real capability detection (vs. the
current manual-toggle simulation), one real physical device (M3), and
wiring the scenario runner into CI. See
`docs/audit-2026-09-22.md` for acceptance criteria and feature
priorities. ("UI versus executor confirmation consistency" from the
original audit finding was fixed: see CHANGELOG.md's 0.1.11 entry.)
