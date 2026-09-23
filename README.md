# Access Graph Protocol (AGP)

[![test](https://github.com/autoflow541/access-graph-protocol/actions/workflows/test.yml/badge.svg)](https://github.com/autoflow541/access-graph-protocol/actions/workflows/test.yml)
[![npm version](https://img.shields.io/badge/version-0.1.24-blue)](CHANGELOG.md)
[![license: Apache 2.0](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)
[![status: experimental](https://img.shields.io/badge/status-experimental-orange)](ROADMAP.md)

**Experimental draft: version 0.1**

Access Graph Protocol is an open interoperability experiment for exposing the **meaning, state, actions, relationships, and safety characteristics** of software, devices, robots, and environments in a common machine-readable form.

The goal is simple: a product exposes what it *is* and what a person *can do with it*; assistive technology or an AI access engine decides how that interaction should be presented to the individual.

AGP does **not** replace ARIA, operating-system accessibility APIs, Matter, W3C Web of Things, authentication, or safety controls. It is intended to bridge them.

![AGP architecture](docs/architecture.svg)

## Why this exists

Accessibility is fragmented across browsers, operating systems, assistive technology, smart devices, and physical systems. Each platform has useful semantics, but there is no single accessibility-oriented interaction model that spans a web button, an application control, a kiosk, a thermostat, and a robot action.

AGP explores whether those systems can be normalized into one small semantic graph that an assistive client can consume.

There is a second, related claim this repo also tests: that an AI-driven accessibility layer does not have to be locked to one medium. The same execution model and safety spine (proposal → confirmation → authorization → dispatch, risk-floored categories, capability negotiation) now runs, unmodified, across six unrelated media types: a website (via ARIA), a WoT smart device, a live camera feed ("what am I looking at?", not tied to one glasses vendor), a webpage read from a screenshot alone (no ARIA cooperation required this time), a PDF document, and a website's own WCAG scan, the last two backed by Auto-Flow's own already-deployed production services rather than demos built for this repo. The reuse is the actual evidence, not the adapter count: `ExecutionService` and `negotiateCapabilities()` (`sdk/javascript/agp.js`) were built once, for a thermostat, and never changed to add the other five. See `adapters/vision-assistant/`, `adapters/web-vision/`, `adapters/web-scan/`, and `adapters/pdf-remediation/` below.

## Core model

An AGP object has a stable identity, semantic role, human-readable label, state, and actions. Safety-sensitive actions can require confirmation and authorization.

```json
{
  "agp": "0.1",
  "id": "front-door",
  "role": "door",
  "label": "Main entrance",
  "state": { "locked": true },
  "actions": [
    {
      "id": "unlock",
      "label": "Unlock door",
      "risk": "medium",
      "confirmation": true
    }
  ]
}
```

A separate **Access Profile** describes functional interaction preferences without requiring a diagnosis:

```json
{
  "agp_profile": "0.1",
  "input": { "preferred": ["voice", "keyboard"] },
  "output": { "preferred": ["speech", "large_text"] },
  "language": { "complexity": "plain", "response_length": "short" }
}
```

## Repository

- `specification/AGP-0.1.md`: current protocol draft
- `schema/`: JSON Schemas for AGP objects and Access Profiles
- `sdk/javascript/`: dependency-free JavaScript reference SDK
- `adapters/aria/`: first ARIA/HTML-to-AGP adapter
- `adapters/wot/`: W3C Web of Things Thing Description adapter
- `adapters/specs/`: SPECS presentation and action-safety bridge
- `adapters/vision-assistant/`: an AI-described-environment capability ("what am I looking at?", "read this to me") as an AGP object, not tied to one camera vendor's hardware
- `adapters/pdf-remediation/`: a fourth media type, and the first backed by an already-deployed production service (Auto-Flow's pdf.auto-flow.co) rather than something built for this repo: check/analyze/remediate a PDF through AGP's execution model
- `adapters/web-vision/`: a fifth media type, describing or locating elements on a webpage from a screenshot alone, regardless of whether the page has any ARIA/accessibility markup of its own; dispatched by the exact same `service/vision-executor.mjs` as the camera adapter, unmodified
- `adapters/web-scan/`: a sixth media type, and a second real-production-backed one (Auto-Flow's scan.auto-flow.co, Playwright + axe-core): a deterministic WCAG audit rather than an AI judgment call, honestly labeled as such (`source.type: "structured_api"`)
- `service/scenario-runner.mjs`: reproducible fault injection (authorization denial, stale state, duplicate request, malformed schema, dispatch timeout) against any `ExecutionService`, with a machine-readable pass/fail report; `service/check-conformance.mjs` (`npm run check:conformance`) runs it against the real thermostat fixture
- `examples/website/`: adaptive web demo
- `examples/drone/`: simulated physical-system demo using the same model
- `examples/smart-device/`: WoT thermostat and SPECS-view simulator
- `examples/specs/`: Lens Studio porting contract, controller, and a real Lens Studio (SPECS/Spectacles) project source tree in `examples/specs/lens-project/`
- `examples/execution-client/`: a real browser client for `service/` over the network (not an in-process simulation, unlike the three examples above)
- `examples/vision-assistant/`: real camera capture and real speech output, running through the same unmodified execution service and client-side capability negotiation as the smart-thermostat demo
- `service/`: server-side execution authority (started, not finished): device/caller allowlisting, proposal lifecycle, state-version and duplicate-dispatch protection, over a dependency-free HTTP layer, plus one deliberate dependency exception (`@node-wot/core`) for dispatching to a real WoT Thing: see `service/README.md`
- `tests/`: SDK, adapter, and execution-service tests
- `docs/prior-art-and-positioning.md`: how AGP relates to Universal Remote Console, W3C WoT, AccessKit, WAI-Adapt, MCP, Apple App Intents, A2UI, and XR accessibility research
- `docs/capability-matrix.md`: what's actually implemented today, per adapter and client, verified against source
- `docs/adr-0001-wot-reuse.md`: the architecture decision on reusing WoT (and Matter, Home Assistant) rather than competing with them
- `docs/audit-2026-09-22.md`: engineering audit and prioritized feature/pilot plan
- `ROADMAP.md`: prototype-to-standardization roadmap, including a milestone plan with acceptance criteria

## Run it

Requires a recent Node.js version for tests (`npm ci` first: the SDK/adapters stay dependency-free, but `service/` now has two deliberate exceptions, `@node-wot/core` and `@anthropic-ai/sdk`, both explained in `service/README.md`). The browser demos themselves load no package dependencies.

```bash
npm ci
npm test
npm run check:conformance   # the scenario runner's machine-readable pass/fail report
python -m http.server 8080
```

Then open:

- `http://localhost:8080/examples/website/`
- `http://localhost:8080/examples/drone/`
- `http://localhost:8080/examples/smart-device/`

`examples/execution-client/` and `examples/vision-assistant/` are real
network clients, not in-process simulations: each needs its own
execution service running first, then the same static server:

```bash
npm run service:dev            # examples/execution-client/, port 8787, WoT thermostat, simulated
npm run service:dev:vision     # examples/vision-assistant/, port 8791
python -m http.server 8080     # in another terminal
```

Then open `http://localhost:8080/examples/execution-client/` (or
`examples/vision-assistant/`). See `service/README.md`.

The other four `service:dev*` scripts (`service:dev:wot`, real node-wot
backend; `service:dev:pdf`, real PDF remediation backend;
`service:dev:web-scan`, real WCAG scan backend; `service:dev:web-vision`,
webpage screenshots) have no dedicated browser demo yet: exercise them
with `curl` against their HTTP API, the same one every other execution
service exposes (see `service/README.md`'s HTTP surface table).

## ARIA adapter

The first adapter converts existing HTML and ARIA semantics into AGP objects.

```js
import { scanAria } from "./adapters/aria/index.js";

const objects = scanAria(document);
```

It currently recognizes common interactive controls including buttons, links, text inputs, checkboxes, radio buttons, selects, textareas, and elements with explicit ARIA roles. It intentionally avoids exposing password values.

## WoT and SPECS interoperability

The WoT adapter maps Thing Description properties, actions, events, and security declarations into AGP without taking over transport or credentials. Unknown writes and device actions fail safe: they default to medium risk and explicit confirmation, and for `physical_safety`/`security`/`financial`/`destructive` categories a source-declared risk or confirmation value can only raise the effective requirement, never lower it below a policy floor: see `SECURITY.md` and `docs/capability-matrix.md`.

The SPECS adapter converts the same AGP object and Access Profile into a world-panel view model and a gated action session suitable for a Lens. It supports hand/voice selection, captions, speech, large text, high contrast, reduced motion, and one-step flows at the semantic layer, and binds an action's parameters into an immutable, deep-frozen proposal at request time: confirming an action confirms the exact parameters that will run, not just the action id. `examples/specs/lens-project/` builds on this with real Lens Studio TypeScript source for Lens Studio 5.22+ / SPECS 27, Spectacles UI Kit, and the Spectacles Interaction Kit; it still needs on-device testing: see `examples/specs/lens-project/SETUP.md`.

## Beyond devices: camera, web, and document adapters

Four adapters apply the same object/action/risk model to media that have nothing to do with device control. All four keep AGP's core distinction between *informational* actions (no risk, no confirmation, so a person can ask constantly without a dialog interrupting every question) and actions that change something (risk-appropriate confirmation, matching the read_/write_ split `adapters/wot/index.js` already established):

- **`adapters/vision-assistant/`**: `describe_scene` ("what am I looking at?") and `read_text`, sent through a pluggable describer, simulated by default and real (an actual Anthropic API call) when `ANTHROPIC_API_KEY` is set. Not tied to one camera vendor; works with any source that can produce a still frame.
- **`adapters/web-vision/`**: the same pattern applied to a webpage screenshot instead of a camera. `describe_page` and `find_element` (which takes a `query`, e.g. "find the submit button") are dispatched by the *exact same executor* (`service/vision-executor.mjs`) built for the camera adapter, generalized once to read `metadata.describerMode` off any action rather than hardcoding two action ids. Deliberately does not read the page's DOM or ARIA tree: `adapters/aria/index.js` already covers pages that cooperate; this covers ones that never will.
- **`adapters/web-scan/`**: `check_accessibility`, calling Auto-Flow's already-deployed WCAG scanner (Playwright + axe-core) over real HTTP. Honestly labeled `source.type: "structured_api"`, not `"ai_inference"`, since axe-core is a deterministic rule engine, not a judgment call, even though the real service's response also carries an AI-generated review alongside the rule results.
- **`adapters/pdf-remediation/`**: `check_accessibility` and `analyze` are informational; `remediate` is `risk: "low"` with confirmation required, since it's an AI making judgment calls (heading levels, alt text, reading order, table structure) that produce a new document. All three call Auto-Flow's already-deployed PDF remediation service over real HTTP.

`service/scenario-runner.mjs` provides reproducible fault injection (authorization denial, stale state, duplicate request, malformed schema, dispatch timeout) against any of these, or against `service/execution-service.js` directly, with a machine-readable pass/fail report; `npm run check:conformance` runs it against the reference thermostat fixture and is wired into CI.

## Design principles

1. **Meaning before presentation.** Describe capability, not a particular UI.
2. **Functional preferences before diagnoses.** Share only what is needed for the interaction.
3. **Structured data before inference.** Native semantics outrank AI guesses.
4. **Safety is not an accessibility preference.** Accessibility must never bypass authorization or physical safety controls.
5. **Interoperate, do not replace.** Existing accessibility and device standards remain authoritative in their domains.

## Status

AGP 0.1 is an independent experimental prototype, not an approved standard and not affiliated with W3C, WHATWG, the Connectivity Standards Alliance, or any other standards body.

The current proof applies one Access Profile, one execution model, and (where applicable) one capability-negotiation function, unmodified, across: a website, a WoT smart device (both simulated and, via `service/wot-executor.mjs`, a real `node-wot` backend), a simulated drone, a SPECS-oriented XR presentation with real Lens Studio source, a live camera feed, a webpage read from a screenshot alone, a PDF document, and a website's own WCAG scan, the last two backed by real, already-deployed production services rather than demos built for this repo. Native on-device testing, OS accessibility adapters, and one real physical device connected end to end remain future work.

## License

Apache License 2.0. See `LICENSE`.

## Current engineering audit

See [the implementation audit](docs/audit-2026-09-22.md) for verified fixes, open limitations, prioritized features and pilot acceptance criteria. [NEXT.md](NEXT.md) scopes the execution-service milestone.
