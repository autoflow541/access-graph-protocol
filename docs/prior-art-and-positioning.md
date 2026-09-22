# Prior art and positioning

AGP is not the first attempt at presentation-independent device/interface
interaction. This document places it against the closest prior and
adjacent work, and states what AGP should stop claiming, reuse, or
differentiate on. It supersedes any earlier README language that implied
AGP is a novel idea rather than a specific, narrower engineering bet.

## Universal Remote Console (ISO/IEC 24752)

URC described machine-readable device functionality and state, independent
of how a user perceives or operates it, and explicitly included
alternative interfaces and intelligent agents — the same core idea AGP is
built on. The 2014 framework and socket-description editions are
withdrawn.

**What this means for AGP:** do not claim to have invented
presentation-independent device interaction — URC preceded it by roughly
two decades. AGP does not have public evidence for *why* URC's approach
did not reach broad deployment (cost of authoring "resource sheets" per
device, chicken-and-egg adoption between device vendors and AT vendors,
timing relative to the smartphone/web-app shift, or something else) and
should not guess. This is a real open research question, not a solved
one: **before scaling AGP past the reference workflow in this repo, find
and talk to someone who worked on a URC deployment or standardization
effort.** Their account of deployment cost, integration friction, and
adoption blockers is more informative than anything this repo can infer
from the withdrawn spec text alone.

## W3C Web of Things (Thing Description)

WoT Thing Descriptions (TD) describe properties, actions, events, data
schemas, security metadata, and interaction endpoints for a device. **TD
1.1 is a W3C Recommendation; TD 2.0 work is ongoing.** `adapters/wot/`
targets TD 1.1 structurally (properties/actions/events, `security` +
`securityDefinitions`, JSON Schema-shaped property/input schemas) but does
not pin a version constant anywhere in code, and does not document which
TD 1.1 features it does *not* read (per-form security overrides, security
requirement combinations, `uriVariables`, links, multiple protocol
bindings). That gap is tracked in ROADMAP.md and should be closed before
any WoT-adjacent standards conversation — an adapter that silently reads
only a subset of a Recommendation is a support-subset problem, not a
version problem, and needs to say so explicitly rather than imply full TD
1.1 coverage.

**What this means for AGP:** WoT already solves device description,
execution binding, and security metadata for constrained devices. AGP's
WoT adapter should stay a thin *accessibility projection* of a TD — adding
risk/confirmation/presentation semantics on top of what WoT already
expresses — not a competing device-description format. See
`docs/adr-0001-wot-reuse.md` for the concrete decision this implies for
`schema/access-graph.schema.json`.

## WAI-Adapt

WAI-Adapt is W3C work on semantic information that enables content
personalization according to user needs and preferences (symbol support,
content simplification, etc.). AGP's Access Profile
(`schema/access-profile.schema.json`) overlaps in intent — functional
preferences without a diagnosis — but uses its own vocabulary
(`input.preferred`, `output.preferred`, `language.complexity`, …) rather
than WAI-Adapt terms.

**What this means for AGP:** the current vocabulary was designed without
cross-referencing WAI-Adapt's published terms. Before extending the Access
Profile schema further, map each existing field to a WAI-Adapt equivalent
where one exists and record where AGP genuinely needs a term WAI-Adapt
doesn't have (this repo's current guess: physical/XR-specific preferences
like `reduced_motion` and `one_step_at_a_time` may be genuinely additive;
most of `language.*` likely is not). An isolated vocabulary is a real cost
— every AT vendor integration has to learn AGP's specific terms instead of
terms they may already support — so any term that duplicates WAI-Adapt
without a documented reason should be replaced with WAI-Adapt's term.

## Model Context Protocol (MCP) — tool annotations as a trust-model precedent

MCP tool annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`,
`openWorldHint`) are explicitly **untrusted unless the server is trusted**
(MCP tool-annotations post, 2026-03-16): a third-party server claiming
`readOnlyHint: true` while actually deleting files is the stated failure
mode, and the fix is deterministic sandboxing/policy, not hint
truthfulness.

This is structurally the same problem as AGP finding G
(`docs/capability-matrix.md`): `adapters/wot/index.js` reads
`x-agp-risk` / `x-agp-confirmation` directly from a Thing Description —
i.e. from the device/source — with no separation from a policy the AGP
side actually enforces. A device (or a compromised/buggy one) can
currently self-declare `x-agp-risk: "none"` on a dangerous action. MCP's
resolution (annotations inform UI, never gate safety-critical decisions on
their own) is the model AGP should copy: source-declared risk/confirmation
hints should never be able to *lower* what a server-side policy requires,
only ever raise it or leave it unchanged.

**What this means for AGP:** an MCP projection of AGP actions (letting an
AI agent discover and propose them) is plausible future work, but it must
call through the *same* validated execution service as every other
client — an AI-supplied or device-supplied risk label is not permission,
exactly as MCP's own trust model states for its own annotations.

## A2UI

A2UI is a declarative UI protocol for agent-driven interfaces: an agent
emits a JSON description of UI components, and the client renders it
using its own native components — explicitly to get accessibility "for
free" by inheriting the client platform's native accessibility support,
rather than by A2UI defining accessibility semantics itself.

**What this means for AGP:** A2UI and AGP solve different layers. A2UI
describes *arbitrary UI layout* generically; AGP describes *a specific
device/action's meaning, risk, and required safety gates* and leaves
layout to the client (`adapters/specs/index.js` `toSpecsView` returns a
title/state/actions/presentation view model, not a UI tree). A renderer
could plausibly consume an AGP view model and re-express it as A2UI
components for a generic client — that is a reasonable future adapter —
but AGP should not grow its own general-purpose UI description language.
If a future requirement turns out to be "describe arbitrary UI layout,"
that is A2UI's job, not a reason to extend AGP's schema.

## XR accessibility (XAUR, and practitioner research)

W3C's XR Accessibility User Requirements (XAUR) and published practitioner
research both establish that general accessibility guidance does not
transfer directly to immersive systems: reach, fatigue, orientation,
focus/attention, spatial placement, recovery from a missed
gesture/misheard phrase, and alternatives to gestures/speech are
XR-specific concerns that large text, captions, and voice input do not
address on their own.

**What this means for AGP:** `examples/specs/lens-project/` currently
implements large text, high contrast, reduced motion, captions, speech,
and one-step interaction (see `docs/capability-matrix.md`). None of that
has been validated against XAUR's actual requirement list, and none of it
has been tested for reach (can a wheelchair user or someone with limited
arm mobility trigger a world-locked panel placed at a fixed offset?),
fatigue (does holding a pinch gesture or standing to interact matter?), or
recovery (what happens when a pinch is missed, or ASR mis-hears
"cancel" as "confirm"? — the exact-match voice model reduces but does not
eliminate this). This is real, tracked work, not a checkbox already
satisfied — see the acceptance criteria for the SPECS device-testing
milestone in `ROADMAP.md`.

## Positioning statement

> Expose a supported task once, and provide multiple accessible ways to
> complete it.

AGP does not make arbitrary existing software or objects accessible
automatically, and does not claim to be the first system to separate
device meaning from presentation. Its scope is narrower and, we believe,
still useful: a validated action lifecycle (proposal → confirmation →
authorization → dispatch → outcome, see `docs/adr-0001-wot-reuse.md` and
the parameter-binding fix in `adapters/specs/index.js`) combined with
portable, user-controlled Access Profiles and accessible interaction
patterns across genuinely different client technologies (a browser and
Spectacles glasses, so far). The JSON graph by itself is not the product;
the validated execution model plus the accessible presentation adapters
around it is.
