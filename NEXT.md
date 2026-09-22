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
- A caller is authenticated and the allowlist is enforced server-side —
  the `AccessGraph` passed to the constructor *is* the reviewed allowlist.
- Confirmation/authorization/execution are all bound to a server-issued
  proposal ID, the target/action, validated parameters, an expiry, and
  the state version observed at proposal time — re-checked again at
  dispatch time, not just at proposal time.
- Permissions are rechecked at dispatch (not just at proposal time);
  request IDs are recorded; replay retention is `requestRetentionMs`,
  and restart behavior is explicit: in-memory only, nothing survives a
  restart — see `service/README.md`.
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
actually succeeded seconds later in the background — the next action
attempt correctly hit `STALE_STATE` and auto-recovered. That's the real
race this design exists to handle, observed actually happening. No actual
screen reader was used to verify the page.

Not done — this is the actual next work, not "still open" in the vague
sense:

- **Authorization is still simulated.** The default
  `authorizationProvider` trusts whatever the caller claims. A real
  provider (paired-device approval, OAuth introspection, ...) is a clean
  swap-in point now, but nobody has built one.
- **No real device connected.** M3's `node-wot` integration
  (`docs/adr-0001-wot-reuse.md`) is still ahead of this.
- **No accessible task inspector, capability negotiation, or scenario
  runner** — `docs/audit-2026-09-22.md`'s next priorities after this one.

## Still open

WoT schema coverage, cross-discovery stable IDs, Lens Studio/hardware
verification, accessible task inspector, capability negotiation, and
scenario runner. See `docs/audit-2026-09-22.md` for acceptance criteria
and feature priorities. ("UI versus executor confirmation consistency"
from the original audit finding was fixed — see CHANGELOG.md's 0.1.11
entry.)
