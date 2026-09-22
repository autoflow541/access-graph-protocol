# AGP Roadmap

AGP is currently an experimental interoperability prototype. The roadmap prioritizes evidence that one semantic model can work across fundamentally different technologies.

## 0.1 — Working model

- [x] Core Access Graph object
- [x] Access Profile
- [x] Risk and confirmation model
- [x] JavaScript reference SDK
- [x] Website demo
- [x] Drone simulator demo
- [x] HTML/ARIA adapter
- [x] JSON Schemas

## 0.2 — Interoperability proof

- [ ] Windows UI Automation adapter
- [ ] Android accessibility adapter
- [x] W3C Web of Things adapter
- [x] SPECS semantic view and safety bridge
- [x] Simulated WoT smart-device/SPECS interaction demo
- [ ] Lens Studio (SPECS 27) project — source complete in `examples/specs/lens-project/` (real TypeScript against SIK/Spectacles UI Kit/ASR/TTS, world-locked controls, hand + exact-voice input, a bounded-numeric-parameter slider control, captions/speech/large-text/high-contrast/reduced-motion/one-step, confirmation and authorization kept as separate gates); not yet device-tested (see "0.4 — Real-world pilots")
- [ ] Matter capability mapping experiment — data-model and trust-boundary decision already made in `docs/adr-0001-wot-reuse.md` (item 6) and researched in `docs/prior-art-and-positioning.md`; not yet implemented as an adapter
- [ ] MCP tool projection for AGP actions
- [ ] Event subscription model
- [ ] Capability discovery document at `/.well-known/agp`
- [ ] Conformance test runner

## 0.3 — Safety, privacy, and trust

- [ ] Normative authorization model
- [ ] Data minimization rules for Access Profiles
- [ ] Local/ephemeral profile exchange
- [ ] Trust provenance and confidence vocabulary
- [ ] Restricted action classes for physical motion, security, financial, and destructive operations
- [ ] Threat model and security review

## 0.4 — Real-world pilots

- [ ] Public-service kiosk pilot
- [ ] Smart-home/device pilot
- [ ] Drone or robotics pilot
- [ ] Screen-reader/assistive-technology prototype client
- [ ] On-device Spectacles usability test of `examples/specs/lens-project/` (source complete, hardware-untested, including its `AgpParameterSlider` numeric-parameter control) — plus a multi-field/dial control for parameter shapes the slider doesn't cover (object, array, enum-only)
- [ ] Usability study with disabled participants and accessibility practitioners

## 1.0 candidate

A 1.0 proposal should not be declared until AGP demonstrates useful interoperability across at least three independent technology domains and has external implementer feedback.

Potential standardization paths to evaluate after the prototype is validated include W3C Community Group incubation and collaboration with existing accessibility, web-of-things, assistive-technology, and device-interoperability communities.

## Milestone plan and acceptance criteria

Ordered by dependency, not calendar time — this repo does not commit to
dates it doesn't control. Each milestone's acceptance criteria are meant
to be checked, not asserted: if a criterion can't be verified (no
hardware, no participants yet), the milestone is not done, it's blocked,
and the roadmap should say so rather than checking it off anyway.

**M1 — Fix the audit findings that touch trust and correctness**
(`docs/capability-matrix.md`, Findings A–G)
- [x] A: Lens authorization prompt visibly labeled as simulated.
- [x] B: Confirmation bound to immutable, validated parameters; a changed
      parameter after confirmation requires a new proposal and cannot
      reuse an existing confirmation. Acceptance: a test that confirms
      one parameter value, then calls execute with a different value, and
      asserts it is rejected — not just that the "right" path works.
- [x] C: WoT state projection separates observed values from schema
      defaults and excludes write-only properties. Acceptance: a test
      Thing Description with a `default` on a property that has never
      been read reports that property as unknown/absent, not as the
      default value; a `writeOnly` property never appears in `state`.
      Verified: `tests/wot-adapter-test.mjs`.
- [x] D: WoT parameter schema translation preserves supported structures
      (objects/arrays, not just string/number/integer/boolean) and each
      parameter's real `required`-ness, and clearly rejects or flags
      schemas it can't represent instead of silently coercing them.
      Acceptance: a test with an unsupported schema type asserts the
      adapter either preserves enough structure to round-trip it or
      throws/flags it — never silently emits `type: "string"`.
      Verified: `tests/wot-adapter-test.mjs`; `schema/access-graph.schema.json`
      updated to allow the newly-honest `object`/`array`/`unsupported`
      parameter types.
- [x] E: Identifier generation is collision-safe. Acceptance: a test
      registers two source objects whose names differ only by case or
      punctuation and asserts both are present in the resulting graph
      under distinct ids, with the original source name preserved
      somewhere on the object. Verified: `tests/wot-adapter-test.mjs`.
- [x] F: Authorization requirement reads per-form security and security
      requirement combinations, not only top-level `td.security`.
      Acceptance: a test TD with a form-level security override produces
      a different `authorizationRequired` result than the Thing-level
      default would imply. Verified: `tests/wot-adapter-test.mjs`.
- [x] G: Source-declared `x-agp-risk` / `x-agp-confirmation` can only
      raise the effective risk/confirmation requirement relative to a
      separately-defined policy default, never lower it. Acceptance: a
      test TD that declares a `physical_safety`-category action as
      `x-agp-risk: "none"` still resolves to at least the policy's floor
      for that category. Verified: `tests/wot-adapter-test.mjs`.
      Follow-up closed: `options.categoryPolicy` lets a caller who has
      reviewed a device correct a mislabeled `x-agp-category`, and every
      action now carries `metadata.category_trust: "reviewed" |
      "declared"` so an unreviewed claim is visible rather than silently
      indistinguishable from a reviewed one. Residual gap, not closable
      client-side: without a supplied policy, a device can still mislabel
      its own category — see `docs/capability-matrix.md`, Finding G.

**M2 — Execution service and browser reference workflow**
- [ ] One execution integration chosen and implemented (`node-wot` for
      WoT-sourced actions, evaluated per `docs/adr-0001-wot-reuse.md`).
      Home Assistant's WebSocket API evaluated as a second, later backend
      for real-device bridging — not built in this milestone. Home
      Assistant's `call_service` API has no risk classification of its
      own (`docs/adr-0001-wot-reuse.md`, item 5), so whichever backend is
      built second needs its own reviewed `domain`/`service` → category
      mapping, not an assumption that risk can be read from Home
      Assistant the way it's (imperfectly) read from a WoT TD.
- [x] The action lifecycle (proposal → validation → confirmation →
      server-side authorization → dispatch → succeeded/failed/unknown/
      cancelled) exists server-side, in `service/execution-service.js`,
      with a server-issued proposal id, a caller-generated request id,
      target/action ids, validated parameters (reusing
      `adapters/specs/index.js`'s `validateParameters`, not a third
      reimplementation), a state version, and duplicate-request handling.
      A thin, dependency-free HTTP layer (`service/http-server.js`, Node's
      built-in `http`, no framework) sits over it. Acceptance verified:
      a request replayed with the same request id does not dispatch twice
      (asserted via executor call count, both in-process and over a real
      HTTP round trip); a request whose bound state version is stale is
      rejected with `STALE_STATE`, both at `propose()` and again at
      `execute()` since state can change in between; an unauthenticated
      caller never reaches dispatch. See `service/README.md` for what
      this does and does not close (authorization is still simulated by
      default — now a pluggable, server-owned decision point, not a
      solved one) and `tests/execution-service-test.mjs` /
      `tests/execution-http-server-test.mjs`.
- [ ] Browser reference client: `examples/execution-client/` is a new
      example (not `examples/smart-device/` rewired — that stays as the
      pure in-process/client-side demo) that talks to `service/` over
      real HTTP. Every gate/outcome state was manually clicked through
      live over real HTTP, not just covered by the automated suite:
      reading temperature/device status; propose-and-execute a bounded
      target-temperature change (`targetTemperature` actually moved,
      state version advanced); authorization denial; disconnection
      (stopping the service mid-session showed a distinct state rather
      than stale data); cancel-before-dispatch; and dispatch timeout —
      which turned up a genuinely useful unplanned result: a dispatch
      forced to run past `dispatchTimeoutMs` correctly reported
      "unknown, don't assume it failed," then actually succeeded seconds
      later in the background, and the next action attempt correctly hit
      `STALE_STATE` and auto-recovered — the real race this design exists
      to handle, observed actually happening. The one remaining gap: no
      actual screen reader was used to verify the page (native
      buttons/range inputs and `aria-live` regions are used throughout,
      keyboard-operable by construction, but "screen-reader-operable" is
      not yet a checked claim — that's the only reason this item stays
      unchecked). "Switch one real lamp on/off" was moved out of this
      criterion — that's M3's job (a real device), not this one (a real
      service in front of a still-simulated device).
- [ ] Accessible task inspector (`docs/audit-2026-09-22.md` item 3):
      `ExecutionService.inspect()` / `GET /devices/:id/inspect` and its
      rendering in `examples/execution-client/` exist and are tested
      in-process and over real HTTP (`tests/execution-service-test.mjs`,
      `tests/execution-http-server-test.mjs`), including that a
      category-only confirmation trigger is correctly surfaced even when
      an action's own `confirmation` flag is `false`. Live-verified:
      mouse activation of every per-action `<details>` disclosure opens
      it with correct, server-resolved content; `Tab` reaches every
      entry. Unchecked for two reasons, both stated plainly rather than
      glossed over: synthetic `Enter`/`Space` key activation could not be
      confirmed through the browser-automation tool used for this check
      (it also failed on the page's pre-existing, already-shipped
      `<details>` block, so this reads as a tool limitation against
      native UA default actions, not a markup defect — but it is still
      an unconfirmed claim, not a verified one); and, same as the
      browser reference client above, no real screen reader has been
      used against this page.

**M3 — Real device connected, SPECS client compiled and integrated**
- [ ] One real lamp switched on/off end-to-end through the execution
      service (heating, locks, robot motion, and drone flight stay
      simulated until the execution model from M2 has been reviewed).
- [ ] `examples/specs/lens-project/` actually compiles in Lens Studio
      5.22+ against the real, currently-installed SIK and Spectacles UI
      Kit package versions (not just reviewed as source) and connects to
      the M2 execution service instead of the in-Lens simulated
      thermostat. Acceptance: `docs/capability-matrix.md`'s SPECS client
      row changes from "source-complete, not tested on hardware" to a
      dated note of what was actually verified and on which package
      versions.
- [ ] Parameter entry and error recovery tested in the browser and (once
      compiled) in Lens Studio preview: denied permission, a
      network/device disconnect, and an ambiguous or unrecognized voice
      command each produce a distinct, understandable outcome rather than
      a silent failure or a guessed action.

**M4 — On-device Spectacles test and formative accessibility study**
- [ ] Hand tracking and exact-phrase ASR tested on physical Spectacles
      hardware, including denied microphone/network permission and a
      speech recognition error, not only the happy path. ASR does not run
      in desktop preview — this criterion is not satisfiable without
      hardware access, and should stay unchecked (not assumed) until it
      is.
- [ ] A small paid formative study (roughly 5–8 participants whose access
      needs match the room-control tasks) compares the existing
      interface and the AGP-driven one on the same tasks, measuring
      independent completion, errors/unintended actions, assistance
      required, effort/fatigue, understanding of state and outcomes, and
      recovery after errors — combined with an expert accessibility
      evaluation using the assistive technologies participants actually
      use. Acceptance: a written report of what was measured and found,
      including negative results, not a marketing summary.
- [ ] Findings from the study are triaged into fixes before any pilot
      conversation, not deferred past it.

**M5 — External pilot and independent implementation**
- [ ] A scoped, paid pilot with defined acceptance criteria agreed before
      the work starts (not after).
- [ ] An outside developer (not the original author) builds a small
      integration from the published documentation alone, without
      side-channel help. Acceptance: they either succeed, in which case
      the documentation is validated, or their blockers are logged as
      documentation/API defects to fix — this is a test of the docs, not
      of the developer.
- [ ] An honest implementation report is published, including what did
      not work.

**M6 — Standardization conversation**
- [ ] Prior art, unmet requirements, supported mappings, compatibility
      rules, testable assertions, and independent implementation results
      are written up (this document plus `docs/prior-art-and-positioning.md`
      and `docs/capability-matrix.md` are the start of that, not the
      finished version).
- [ ] Conversations started with W3C Web of Things, W3C accessibility/
      personalization communities, XR accessibility researchers, and at
      least one independent AT developer or implementer, before pursuing
      formal incubation.

### Stop or narrow conditions

Re-evaluate the whole effort, rather than pushing forward on schedule, if
any of these hold at a milestone checkpoint:

- Formative or pilot users show no meaningful benefit over the existing
  interface on the same tasks.
- Integrating AGP into a real client takes as much custom work as just
  building a separate accessible UI for that client would have.
- Interviewed buyers can't name a specific deployment they'd pay for.
- An independent developer cannot implement a client or adapter from the
  published documentation alone.

If WoT plus existing UI/accessibility technology turns out to solve the
problem adequately on its own, the right outcome is narrowing AGP to a
profile, toolkit, or extension of that existing work (consistent with
`docs/adr-0001-wot-reuse.md`) rather than insisting on a standalone
protocol for its own sake.
