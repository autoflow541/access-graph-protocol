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

## Still open

WoT schema coverage, cross-discovery stable IDs, Lens Studio/hardware
verification, real screen-reader verification of every browser example,
per-action capability channels, real capability detection (vs. the
current manual-toggle simulation), one real physical device (M3), and a
scenario runner. See
`docs/audit-2026-09-22.md` for acceptance criteria and feature
priorities. ("UI versus executor confirmation consistency" from the
original audit finding was fixed: see CHANGELOG.md's 0.1.11 entry.)
