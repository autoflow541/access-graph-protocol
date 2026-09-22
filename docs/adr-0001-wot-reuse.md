# ADR-0001: AGP is an accessibility projection of WoT, not a competing device protocol

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
ground is a real cost — every device vendor or integrator has to decide
which one to implement — so this needs an explicit decision, not silent
drift.

`adapters/wot/index.js` already exists and is one direction of that
decision in practice: it reads a TD and produces an AGP object. The
question this ADR answers is *what AGP's schema is for*, given that WoT
already exists.

## Decision

**AGP's Access Graph schema is an accessibility/interaction projection of
an underlying device or software description (WoT TD, ARIA, or a future
adapter's native format) — not a replacement for any of them.**

Concretely:

1. `adapters/wot/index.js` remains the only place that reads a Thing
   Description. It stays read-only with respect to execution: it must
   never call a Thing's `forms` (dispatch), and must never accept or
   forward credentials. This constraint already holds
   (`SECURITY.md`, `adapters/wot/README.md`) and this ADR does not change
   it.
2. Fields that WoT already expresses authoritatively — security scheme,
   data schema/type, read/write-only, forms/protocol bindings — are
   **read from the TD, not reinvented in AGP's schema.** Where the current
   adapter reinvents one of these badly (Findings C, D, F in
   `docs/capability-matrix.md`), the fix is to read more of what WoT
   already has, not to add a parallel AGP-native representation of the
   same fact.
3. Fields WoT has no concept of — risk classification for the purpose of
   an accessibility/safety gate, confirmation requirement, Access Profile
   matching, presentation hints (`toSpecsView`'s `presentation` object) —
   are AGP's actual value-add and stay AGP-native.
4. A **real** execution service (`ROADMAP.md`, "Execution service" in the
   five-responsibility architecture) should be able to use
   [Eclipse Thingweb `node-wot`](https://github.com/eclipse-thingweb/node-wot)
   or an equivalent WoT execution runtime directly for the dispatch step
   of a WoT-sourced action, rather than AGP reimplementing WoT protocol
   bindings. This repo does not have an execution service yet — see
   Milestone "Execution service, one integration" in `ROADMAP.md` — so
   this point is a constraint on that future work, not something already
   built.
5. Home Assistant's WebSocket API is a plausible *second* execution
   backend (real lamp/device bridge) for the room-control reference
   workflow in `ROADMAP.md`, evaluated after `node-wot`, not instead of
   it — Home Assistant is a device-bridge product with its own entity
   model, not a description-format alternative to WoT, so it does not
   change this ADR's decision.

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
  software (a raw REST API, a proprietary SDK) should be described — that
  is a case-by-case adapter decision, made the same way `adapters/aria/`
  was: read the native format, project only the accessibility-relevant
  parts into AGP.

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
  presentation) needing to live somewhere — better to keep AGP's schema
  minimal and clearly scoped to that value-add than to duplicate TD's
  full structure and then extend it.
