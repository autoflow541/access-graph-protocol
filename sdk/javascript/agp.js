export const AGP_VERSION = "0.1";

export const RISK_ORDER = ["none", "low", "medium", "high", "critical"];

// Category-based safety floors. A self-declared `risk`/`confirmation` on an
// action can only ever RAISE above these floors, never lower below them --
// regardless of which adapter (or no adapter) produced the action. This is
// the same trust model MCP's own tool-annotations spec documents for
// itself (annotations inform UI, never gate a safety-critical decision on
// their own: see docs/prior-art-and-positioning.md's MCP section).
//
// This used to live only inside adapters/wot/index.js, applied solely to
// actions built from a Thing Description: an ARIA-sourced action, or one
// registered natively via AccessGraph.register() with no adapter at all,
// had NO floor protection, however dangerous its declared category. These
// are now the single shared source of truth: effectiveRisk(),
// requiresConfirmationFor(), and requiresAuthorizationFor() below apply
// them to every action read from an AccessGraph, independent of source.
// (adapters/wot/index.js keeps its own risk/confirmation copy too,
// applied earlier, while building a not-yet-registered action from raw
// Thing Description fields -- a different timing point, not a second
// decision: flooring twice is idempotent, since the floor only ever
// raises.)
//
// CATEGORY_CONFIRMATION_FLOOR floors two separate gates, not one:
// confirmation ("does a person need to say yes to this") and
// authorization ("is this caller allowed to do this at all"). The same
// four categories floor both, since neither gate alone is a substitute
// for the other on a dangerous action.
//
// `category` itself is still source-declared and can be mislabeled (a WoT
// TD's `x-agp-category`, an ARIA role mapping, a native caller's own
// claim). This floor does not detect that; it only guarantees that
// whatever category an action ends up with, the matching floor is
// enforced the same way everywhere. Closing the category-trust gap itself
// needs a reviewed policy at the adapter boundary (see
// adapters/wot/index.js's `categoryPolicy`).
export const CATEGORY_RISK_FLOOR = {
  physical_safety: "high",
  security: "high",
  financial: "high",
  destructive: "high"
};
export const CATEGORY_CONFIRMATION_FLOOR = new Set(["physical_safety", "security", "financial", "destructive"]);

// The one place "what risk does this action effectively have" is decided,
// mirroring requiresConfirmationFor's own "one place" comment below: every
// reader (renderControls, requiresConfirmationFor, any future consumer)
// must go through this rather than read `action.risk` directly, or a
// category floor applied in one place and not another is exactly the kind
// of silent drift this file has already had to fix once (see
// requiresConfirmationFor's history note).
export function effectiveRisk(action) {
  const declared = action.risk ?? "none";
  const floor = CATEGORY_RISK_FLOOR[action.category];
  if (!floor) return declared;
  return RISK_ORDER.indexOf(declared) >= RISK_ORDER.indexOf(floor) ? declared : floor;
}

export class AccessGraph {
  constructor(objects = []) {
    this.objects = new Map();
    objects.forEach((object) => this.register(object));
  }

  register(object) {
    assertBasicObject(object);
    if (this.objects.has(object.id)) {
      throw new Error(`AGP object id already registered: ${object.id}. Use updateState() to change an existing object, or route generated ids through createIdAllocator() to avoid collisions.`);
    }
    const normalized = structuredCloneSafe(object);
    normalized.agp ??= AGP_VERSION;
    normalized.state ??= {};
    normalized.actions ??= [];
    normalized.source ??= { type: "native_agp", confidence: 1 };
    assertValidActions(normalized);
    this.objects.set(normalized.id, normalized);
    return normalized;
  }

  get(id) {
    const object = this.objects.get(id);
    return object ? structuredCloneSafe(object) : null;
  }

  list() {
    return [...this.objects.values()].map(structuredCloneSafe);
  }

  updateState(id, patch) {
    const object = this.require(id);
    object.state = { ...object.state, ...patch };
    return structuredCloneSafe(object.state);
  }

  require(id) {
    const object = this.objects.get(id);
    if (!object) throw new Error(`Unknown AGP object: ${id}`);
    return object;
  }

  resolveAction(objectId, actionId, profile = {}) {
    const object = this.require(objectId);
    const action = object.actions.find((candidate) => candidate.id === actionId);
    if (!action) throw new Error(`Unknown action ${actionId} for ${objectId}`);

    return {
      object: structuredCloneSafe(object),
      action: structuredCloneSafe(action),
      requiresConfirmation: requiresConfirmationFor(action, profile),
      authorizationRequired: requiresAuthorizationFor(action)
    };
  }
}

// The one place "does this action require confirmation" is decided, used
// by both the actual gate (AccessGraph.resolveAction, which
// SpecsActionSession.request() calls) and the presentation layer
// (renderControls, which toSpecsView's per-action `cue` and the SPECS
// panel's button labels are built from). These used to be two separate,
// independently-maintained computations, and they had already drifted:
// renderControls checked risk but never checked whether the action's
// category was in the Access Profile's confirmation_for list, so a
// category-triggered confirmation gate could be silently invisible in the
// UI while still correctly enforced by resolveAction: the safety gate
// itself was never bypassed, but a user (or a screen reader reading the
// cue) had no warning a confirmation step was coming.
function requiresConfirmationFor(action, profile) {
  const risk = effectiveRisk(action);
  const profileConfirm = profile?.interaction?.confirmation_for ?? [];
  const riskIndex = RISK_ORDER.indexOf(risk);
  // An unrecognized risk value (indexOf === -1) must not read as "below
  // high": register() now rejects this at write time (assertValidActions),
  // but this is the fail-conservative backstop for any action object that
  // reaches this function some other way. Treat it the same as the
  // highest known risk rather than the lowest.
  const riskRequiresConfirmation = riskIndex === -1 || riskIndex >= RISK_ORDER.indexOf("high");
  const categoryRequiresConfirmation = Boolean(action.category && profileConfirm.includes(action.category));
  // Independent of risk level and user preference: physical_safety,
  // security, financial, and destructive actions always require
  // confirmation, the same way their risk can never be floored below
  // "high" (CATEGORY_CONFIRMATION_FLOOR above). A source declaring
  // `confirmation: false` on one of these cannot turn this off.
  const categoryFloorRequiresConfirmation = Boolean(action.category && CATEGORY_CONFIRMATION_FLOOR.has(action.category));
  return Boolean(action.confirmation || riskRequiresConfirmation || categoryRequiresConfirmation || categoryFloorRequiresConfirmation);
}

// Mirrors requiresConfirmationFor's floor, for the same reason and the
// same categories: `action.authorization.required` was, before this,
// read as the ONLY signal for whether authorization is needed --
// entirely self-declared, with no floor at all (unlike risk and
// confirmation, which already had one). A "financial" or "destructive"
// action could declare `authorization: { required: false }` and nothing
// in this file would raise it: confirmation alone ("yes, I meant to do
// that") is not the same safety property as authorization ("this caller
// is allowed to do that"), and a dangerous category needs both, not
// whichever one its source happened to declare. The declared value can
// still only ever be raised by this floor, never lowered: an action that
// already declares `authorization: { required: true }` is unaffected.
function requiresAuthorizationFor(action) {
  const declared = Boolean(action.authorization?.required);
  const categoryFloor = Boolean(action.category && CATEGORY_CONFIRMATION_FLOOR.has(action.category));
  return declared || categoryFloor;
}

export function summarizeObject(object, profile = {}) {
  const short = profile?.language?.response_length === "short";
  const plain = profile?.language?.complexity === "plain";
  const state = Object.entries(object.state ?? {})
    .map(([key, value]) => `${humanize(key)} ${humanizeValue(value)}`)
    .join(short ? ". " : ", ");
  const actions = (object.actions ?? []).map((action) => action.label ?? humanize(action.id));

  let text = `${object.label}.`;
  if (state) text += ` ${state}.`;
  if (actions.length) text += short ? ` Actions: ${actions.join(", ")}.` : ` Available actions are ${actions.join(", ")}.`;
  if (plain) text = text.replaceAll("Available actions are", "You can");
  return text;
}

export function renderControls(object, profile = {}) {
  const large = profile?.output?.preferred?.includes("large_text");
  const oneStep = profile?.interaction?.one_step_at_a_time;
  return {
    title: object.label,
    state: { ...object.state },
    actions: (object.actions ?? []).map((action) => ({
      id: action.id,
      label: action.label ?? humanize(action.id),
      risk: effectiveRisk(action),
      confirmation: requiresConfirmationFor(action, profile)
    })),
    presentation: {
      largeControls: Boolean(large),
      oneStepAtATime: Boolean(oneStep),
      speechPreferred: Boolean(profile?.output?.preferred?.includes("speech"))
    }
  };
}

// Compares what an object needs to be controlled and perceived
// (object.inputs / object.outputs) against what the CURRENT CLIENT reports
// it can provide -- never against the Access Profile, and never against
// any assumption about the person. A client that doesn't report "voice" as
// available might just be a browser tab with no microphone wired up, not a
// person who cannot speak; treating the two the same would turn a
// technical capability gap into a diagnosis about the user, which AGP must
// never do (docs/audit-2026-09-22.md item 4, "never infer a diagnosis from
// a preference"). This function only ever informs -- it has no notion of
// blocking, so the caller can always let the person proceed regardless of
// a reported gap (the override this exists to preserve).
export function negotiateCapabilities(object, clientCapabilities = {}) {
  return negotiate(object.label, object.inputs ?? [], object.outputs ?? [], clientCapabilities);
}

// Action-level capability negotiation: negotiateCapabilities() above is
// object-level only, so a lock with a safety-critical `unlock` action
// that genuinely needs `touch` specifically has no way to say so without
// also claiming its OTHER actions (reading battery level, say) need
// touch too, even though those work fine over voice alone. Flagged as a
// known gap in NEXT.md ("object-level only, no per-action channels")
// since capability negotiation first shipped.
//
// An action's own `inputs`/`outputs` (schema/access-graph.schema.json),
// if it declares them, take over ENTIRELY for that action -- not merged
// with the object's. A declared-but-empty action-level list is a
// meaningful claim ("this specific action needs no input channel at
// all"), not "inherit the object's," so the fallback to the object's
// channels only happens when the field is genuinely absent (`??`, not
// `||`). Most actions don't declare their own and fall back to the
// object's channels unchanged: this is additive, not a breaking change
// to any existing object.
export function negotiateActionCapabilities(object, actionId, clientCapabilities = {}) {
  const action = (object.actions ?? []).find((candidate) => candidate.id === actionId);
  if (!action) throw new Error(`Unknown action ${actionId} on ${object.id}`);
  const label = `${object.label} – ${action.label ?? humanize(action.id)}`;
  const requiredInputs = action.inputs ?? object.inputs ?? [];
  const requiredOutputs = action.outputs ?? object.outputs ?? [];
  return negotiate(label, requiredInputs, requiredOutputs, clientCapabilities);
}

function negotiate(label, requiredInputs, requiredOutputs, clientCapabilities) {
  const clientInputs = new Set(clientCapabilities.inputs ?? []);
  const clientOutputs = new Set(clientCapabilities.outputs ?? []);

  const supportedInputs = requiredInputs.filter((channel) => clientInputs.has(channel));
  const missingInputs = requiredInputs.filter((channel) => !clientInputs.has(channel));
  const supportedOutputs = requiredOutputs.filter((channel) => clientOutputs.has(channel));
  const missingOutputs = requiredOutputs.filter((channel) => !clientOutputs.has(channel));

  const canControl = requiredInputs.length === 0 || supportedInputs.length > 0;
  const canPerceive = requiredOutputs.length === 0 || supportedOutputs.length > 0;

  const conflicts = [];
  if (missingInputs.length > 0) {
    conflicts.push({
      channel: "input",
      missing: missingInputs,
      explanation: canControl
        ? `${label} also accepts ${joinChannels(missingInputs)}, which this session doesn't report as available. It can still be controlled here via ${joinChannels(supportedInputs)}.`
        : `${label} can only be controlled via ${joinChannels(requiredInputs)}, and this session doesn't report any of those as available. No alternative input is available in this session.`
    });
  }
  if (missingOutputs.length > 0) {
    conflicts.push({
      channel: "output",
      missing: missingOutputs,
      explanation: canPerceive
        ? `${label} also reports state via ${joinChannels(missingOutputs)}, which this session doesn't report as available to perceive. State can still be read here via ${joinChannels(supportedOutputs)}.`
        : `${label} only reports state via ${joinChannels(requiredOutputs)}, and this session doesn't report any of those as available to perceive. No alternative output is available in this session.`
    });
  }

  return { canControl, canPerceive, supportedInputs, missingInputs, supportedOutputs, missingOutputs, conflicts };
}

function joinChannels(values) {
  return values.join(", ");
}

export function humanize(value) {
  return String(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function humanizeValue(value) {
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (Array.isArray(value)) return value.join(", ");
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function assertBasicObject(object) {
  if (!object || typeof object !== "object") throw new Error("AGP object must be an object");
  for (const key of ["id", "role", "label"]) {
    if (!object[key]) throw new Error(`AGP object is missing required field: ${key}`);
  }
  if (object.agp && object.agp !== AGP_VERSION) throw new Error(`Unsupported AGP version: ${object.agp}`);
}

// Rejects at registration time, not at the first confirmation check: an
// action with a risk value outside RISK_ORDER (a typo, or a value from a
// future/unreleased AGP version) must not silently reach
// requiresConfirmationFor(), where an unrecognized value's indexOf()
// would be -1 and previously read as "less risky than every known
// level," the opposite of what an unknown risk should mean. Also rejects
// duplicate action ids within one object, since resolveAction() finds by
// id and a duplicate would make the second action permanently
// unreachable.
function assertValidActions(object) {
  const seenActionIds = new Set();
  for (const action of object.actions) {
    if (action.risk !== undefined && !RISK_ORDER.includes(action.risk)) {
      throw new Error(`AGP action "${action.id}" on "${object.id}" has an unrecognized risk value: ${action.risk}. Expected one of: ${RISK_ORDER.join(", ")}.`);
    }
    if (seenActionIds.has(action.id)) {
      throw new Error(`AGP object "${object.id}" has a duplicate action id: ${action.id}`);
    }
    seenActionIds.add(action.id);
  }
}

// Case/punctuation folding in an adapter's own id-generation (WoT's
// stableId, ARIA's slug, ...) can map two distinct source names to the
// same candidate id. Silently letting that happen means the second
// registration overwrites the first in AccessGraph. An adapter entry
// point creates one allocator per scan/description and routes every
// generated id through it so collisions are disambiguated within that
// call, without adapters re-implementing this independently (and
// re-introducing the same bug in one adapter after fixing it in another
//: which is exactly how this became a shared utility instead of two
// separate copies).
//
// Disambiguation checks the candidate against every id already handed
// out, not just other collisions of the same base name: a naive
// per-base counter can produce "a", "a-2", "a-2" instead of "a", "a-2",
// "a-3" when a third, unrelated name naturally produces "a-2" on its own.
export function createIdAllocator() {
  const used = new Set();
  return function allocate(candidateId) {
    let id = candidateId;
    let suffix = 2;
    while (used.has(id)) {
      id = `${candidateId}-${suffix}`;
      suffix += 1;
    }
    used.add(id);
    return id;
  };
}

export function structuredCloneSafe(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
