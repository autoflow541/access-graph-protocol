# ADR-0001: AGP is an accessibility projection of the underlying protocol (WoT, Matter, Home Assistant), not a competing device protocol

## Status

Accepted, effective this release. Revisit once `adapters/wot/` addresses
Findings C–F (`docs/capability-matrix.md`) and once a real execution
service exists (`ROADMAP.md`).

## Context

W3C Web of Things (Thing Description 1.1, a W3C Recommendation) already
describes device properties, actions, events, JSON-Schema-shaped data,
security metadata, and interaction endpoints. AGP's `schema/access-graph.schema.json`
describes a similar-looking object: id, role, label, state, actions,
risk, confirmation. Two device-description formats covering overlapping
ground is a real cost: every device vendor or integrator has to decide
which one to implement: so this needs an explicit decision, not silent
drift.

`adapters/wot/index.js` already exists and is one direction of that
decision in practice: it reads a TD and produces an AGP object. The
question this ADR answers is *what AGP's schema is for*, given that WoT
already exists.

## Decision

**AGP's Access Graph schema is an accessibility/interaction projection of
an underlying device or software description (WoT TD, ARIA, or a future
adapter's native format): not a replacement for any of them.**

Concretely:

1. `adapters/wot/index.js` remains the only place that reads a Thing
   Description. It stays read-only with respect to execution: it must
   never call a Thing's `forms` (dispatch), and must never accept or
   forward credentials. This constraint already holds
   (`SECURITY.md`, `adapters/wot/README.md`) and this ADR does not change
   it.
2. Fields that WoT already expresses authoritatively: security scheme,
   data schema/type, read/write-only, forms/protocol bindings: are
   **read from the TD, not reinvented in AGP's schema.** Where the current
   adapter reinvents one of these badly (Findings C, D, F in
   `docs/capability-matrix.md`), the fix is to read more of what WoT
   already has, not to add a parallel AGP-native representation of the
   same fact.
3. Fields WoT has no concept of: risk classification for the purpose of
   an accessibility/safety gate, confirmation requirement, Access Profile
   matching, presentation hints (`toSpecsView`'s `presentation` object):
   these are AGP's actual value-add and stay AGP-native.
4. A **real** execution service (`ROADMAP.md`, "Execution service" in the
   five-responsibility architecture) should be able to use
   [Eclipse Thingweb `node-wot`](https://github.com/eclipse-thingweb/node-wot)
   or an equivalent WoT execution runtime directly for the dispatch step
   of a WoT-sourced action, rather than AGP reimplementing WoT protocol
   bindings.

   **Done (2026-09-22), with an honest scope limit:** `service/wot-executor.mjs`
   dispatches an `ExecutionService` action through a real
   `@node-wot/core` `ConsumedThing` (`readProperty`/`writeProperty`/`invokeAction`),
   driven entirely by the `metadata.affordance`/`metadata.wot_name` the WoT
   adapter already attaches, so it is not thermostat-specific and needs no
   per-device code. `service/virtual-thermostat.mjs` exposes a real WoT
   Thing over real HTTP (`@node-wot/binding-http`'s `HttpServer`), and
   `service/run-local-wot.mjs` fetches its actual Thing Description
   (`WoT.requestThingDescription`, not a literal object) and runs it
   through the unmodified `adapters/wot/index.js`. Verified live and in
   `tests/wot-executor-test.mjs`: a property write dispatched through
   `ExecutionService` is independently confirmed by reading the Thing's
   own HTTP endpoint directly, bypassing `ExecutionService` entirely;
   `AccessGraph`'s local state mirror is resynced from the real Thing
   after every dispatch, not left stale; a value AGP's own schema
   validation rejects never reaches the Thing at all.

   What this is *not*: a physical device. `virtual-thermostat.mjs` is
   still simulated hardware, exactly like `run-local.mjs`'s thermostat
   was: the difference is that the two processes now only ever talk over a
   real WoT protocol stack (an actual Thing Description fetched over
   HTTP, actual Scripting API calls), not a shared JS object one script
   could just mutate. "One real lamp" (`ROADMAP.md` M3) still needs
   actual hardware or a real device bridge behind a WoT/Matter/Home
   Assistant TD, which this is not. `node-wot`'s own dependency tree
   currently carries a handful of moderate/high transitive advisories in
   its HTTP server's router and query-string parsing
   (`decode-uri-component`, `find-my-way`) with no non-breaking fix
   available yet; acceptable for a local, loopback-bound, `nosec`
   development Thing, not for an internet-facing one; see `SECURITY.md`.
5. Home Assistant's WebSocket API is a plausible *second* execution
   backend (real lamp/device bridge) for the room-control reference
   workflow in `ROADMAP.md`, evaluated after `node-wot`, not instead of
   it: Home Assistant is a device-bridge product with its own entity
   model, not a description-format alternative to WoT, so it does not
   change this ADR's decision. Its `call_service` message
   (`{domain, service, service_data, target}`) has **no risk
   classification or destructive-action warning of any kind**: Home
   Assistant treats `light.turn_on` and a lock's `unlock` service
   identically at the protocol level. A future Home Assistant execution
   backend therefore cannot read risk/confirmation/category from Home
   Assistant the way `adapters/wot/index.js` reads `x-agp-risk` from a
   TD: there is nothing there to read. It would need its own small,
   reviewed mapping from `domain`/`service` to AGP category (subject to
   the same category-mislabeling caution as Finding G,
   `docs/capability-matrix.md`: this mapping must be adapter-side and
   reviewed, not inferred from the service name at runtime).
6. Matter's data model (Node → Endpoint → Cluster → {attributes, commands,
   events}, using Zigbee Cluster Library-derived clusters) maps onto AGP's
   object/state/actions/events shape at least as cleanly as WoT's does,
   and Matter's fabric-scoped ACL (cumulative View < Operate < Manage <
   Administer privileges, required per command) is a real, enforced
   authorization model this ADR's reasoning applies to identically:
   `authorization.required` should be read from a cluster/command's
   required ACL privilege, not reinvented. Matter's ACL, like WoT's
   security schemes and Home Assistant's service calls, has **no
   risk/confirmation concept**: it answers "is this controller allowed to
   invoke this command on this fabric," never "should a person be shown a
   confirmation step before this specific invocation." A future Matter
   adapter is unbuilt (`ROADMAP.md`, "Matter capability mapping
   experiment") but would follow this ADR's decision exactly as the WoT
   adapter does: read cluster/attribute/command/ACL from Matter, supply
   risk/confirmation/category from AGP's own (reviewed) classification.

## Consequences

- `schema/access-graph.schema.json` should shrink, not grow, in the
  overlap with what a well-formed WoT TD already expresses. Any future
  schema field addition needs a one-line justification: "WoT does not
  have this, and here's why AGP needs it" (this already holds for `risk`
  and `confirmation`; it should hold for every future field too).
- The WoT adapter's job gets *harder*, not easier, per this decision: it
  now needs to actually read per-form security and combinations (Finding
  F) rather than the current top-level-only shortcut, because "read
  what's already there" only pays off if it's read completely.
- AGP does not need its own transport, discovery, or credential model for
  WoT-sourced devices. It needs an adapter and, eventually, an execution
  service that can call into an existing WoT runtime.
- This decision does not resolve how a *non-WoT* device or piece of
  software (a raw REST API, a proprietary SDK) should be described: that
  is a case-by-case adapter decision, made the same way `adapters/aria/`
  was: read the native format, project only the accessibility-relevant
  parts into AGP.
- WoT's security schemes, Matter's fabric ACL, and Home Assistant's
  service-call model all confirm the same gap independently: none of the
  three real, shipping systems AGP has looked at has any concept of
  risk-tiered, accessibility-aware confirmation before an action runs.
  That is evidence AGP's actual value-add (the risk/confirmation/
  Access-Profile layer, not the device description) is filling a real,
  consistently-missing gap across this ecosystem rather than duplicating
  work any of them already does: see the positioning statement in
  `docs/prior-art-and-positioning.md`.

## Alternatives considered

- **AGP as a standalone device protocol, independent of WoT.** Rejected:
  duplicates a W3C Recommendation's work, and every future device vendor
  integration would need to implement AGP's transport/security/schema
  concepts from scratch instead of reusing an existing WoT
  implementation. No engineering benefit identified for the additional
  cost.
- **AGP schema mirrors WoT TD field-for-field.** Rejected: this would
  make the WoT adapter closer to a pass-through and would still leave
  AGP's actual value-add (risk/confirmation/Access-Profile-matching/
  presentation) needing to live somewhere: better to keep AGP's schema
  minimal and clearly scoped to that value-add than to duplicate TD's
  full structure and then extend it.
