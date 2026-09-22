# AGP execution service

The server-side authority `ROADMAP.md` (M2) and `docs/audit-2026-09-22.md`
(#1, "Authoritative execution service") both call for. This is a real,
tested, runnable start on it — not a finished, deployable service. Read
"What's not done yet" below before treating this as more than that.

## Why this is a separate thing from `SpecsActionSession`

`adapters/specs/index.js`'s `SpecsActionSession` is a **client-side** UX
gate: it makes confirmation and authorization into explicit, structured
steps a Lens or browser UI walks through, and closes the specific
confirmation/parameter-binding gap documented in its own header comment.
But it is still just a client asserting things to itself — nothing stops
a modified or malicious client from skipping straight to `execute()`.

`ExecutionService` (`execution-service.js`) is a **server-side** authority
that never trusts a caller's claim about anything. Every mutating call
re-derives its own answer from state it owns:

- **The allowlist is the `AccessGraph` passed into its constructor.**
  There is no separate allowlist data structure to keep in sync — if a
  device or action isn't in that graph, `AccessGraph.resolveAction()`
  throws. A real deployment populates this graph only with devices/actions
  someone has actually reviewed (see `adapters/wot/index.js`'s
  `categoryPolicy` for how a mislabeled source category gets corrected
  before it ever reaches this graph).
- **Caller identity** is checked against a non-empty `allowedCallers` Set
  on every single mutating call, not just once "at login."
- **State versioning**: `propose()` requires the state version the caller
  most recently observed (from `describe()`); a stale version is rejected,
  not silently accepted. `execute()` re-checks it again immediately before
  dispatch, since state can change between proposing and executing.
- **Duplicate-dispatch protection**: `execute()` takes a caller-generated
  `requestId`; replaying the same one within `requestRetentionMs` returns
  the original outcome without invoking the executor again.
- **Authorization is a pluggable, server-owned step**
  (`authorizationProvider`), not something the client can assert its way
  past.

## Running it locally

```bash
npm run service:dev
```

Boots a real HTTP server (Node's built-in `http`, no framework — see
"Dependency-free" below) on port 8787 with the same simulated thermostat
`examples/smart-device/` and `examples/specs/lens-project/` use, so
there's one canonical "first connected device" fixture. Set `PORT` /
`AGP_DEV_TOKEN` to change the port or the (single, hardcoded, dev-only)
caller token.

```bash
curl -H "Authorization: Bearer dev-token" http://localhost:8787/devices/hall-thermostat
```

## HTTP surface

All bodies/responses are JSON. `Authorization: Bearer <callerToken>` is
required on every request.

| Method | Path | Body | Calls |
|---|---|---|---|
| GET | `/devices/:objectId` | — | `describe()` |
| POST | `/devices/:objectId/actions/:actionId/propose` | `{ parameters, stateVersion }` | `propose()` |
| POST | `/proposals/:proposalId/confirm` | `{ accepted }` | `confirm()` |
| POST | `/proposals/:proposalId/authorize` | `{ evidence }` | `authorize()` |
| POST | `/proposals/:proposalId/execute` | `{ requestId }` | `execute()` |
| POST | `/proposals/:proposalId/cancel` | — | `cancel()` |

A thrown error's `.code` maps to an HTTP status (`UNAUTHENTICATED` → 401,
`FORBIDDEN` → 403, `UNKNOWN_DEVICE`/`UNKNOWN_PROPOSAL` → 404,
`STALE_STATE`/`NOT_READY` → 409, `PROPOSAL_EXPIRED` → 410, anything else
→ 400). See `http-server.js`.

## What's not done yet

Said plainly, matching every other "simulated"/"unverified" label already
used across this repo:

- **Authorization is still simulated.** The default
  `authorizationProvider` (`simulatedAuthorizationProvider`) trusts
  `evidence.granted` from the caller — there is no real authorization
  backend for it to call. What's real is that authorization is now a
  server-owned, pluggable decision point a deployment swaps in *one*
  place; what's not real is the decision itself. See
  `docs/audit-2026-09-22.md`.
- **In-memory only.** Proposals, the caller allowlist, state versions, and
  the request-id dedup log are all lost on restart. This service does not
  claim replay safety across a restart — only within one running
  process's `requestRetentionMs` window.
- **No real caller authentication.** `allowedCallers` is a plain token
  Set, not OAuth/mTLS/session-based auth. It exists so "an unauthenticated
  caller never dispatches" is a real, enforced, testable property (see
  `tests/execution-service-test.mjs`) — but the token issuance and
  rotation story around it does not exist yet.
- **No real device connected.** The executor in `run-local.mjs` is
  simulated, same as `examples/smart-device/app.js`. Connecting one real
  lamp through `node-wot` (per `docs/adr-0001-wot-reuse.md`) is the next
  step ROADMAP.md's M3 milestone calls for, not something this does.
- **No browser/Lens client rewired to use this over the network yet.**
  `examples/smart-device/` still calls `SpecsActionSession`'s executor
  callback directly, in-process. Making it (or a new example) actually
  talk to this service over HTTP — with distinct, accessible
  denial/staleness/timeout/disconnection states, per ROADMAP.md's M2
  acceptance criteria — is real, separate follow-up work.
- **No accessible task inspector, capability negotiation, or scenario
  runner.** Those are `docs/audit-2026-09-22.md`'s next priorities after
  this one, not built here.

## Dependency-free

`execution-service.js` and `http-server.js` use only Node's own `http`
module and standard library — no Express, no framework, matching the rest
of this repo's dependency-free SDK/adapters.
