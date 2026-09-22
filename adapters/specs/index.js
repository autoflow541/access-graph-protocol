import { renderControls, structuredCloneSafe, summarizeObject } from "../../sdk/javascript/agp.js";

/**
 * Build a platform-neutral view model for a SPECS Lens.
 * Lens Studio owns rendering, hand tracking, voice input, and device APIs.
 */
export function toSpecsView(object, profile = {}) {
  const controls = renderControls(object, profile);
  const preferredOutput = profile?.output?.preferred || [];
  const avoidedOutput = profile?.output?.avoid || [];

  return {
    id: object.id,
    title: controls.title,
    summary: summarizeObject(object, profile),
    state: Object.entries(controls.state).map(([key, value]) => ({ key, label: humanize(key), value })),
    actions: controls.actions.map((action) => ({
      ...action,
      cue: action.confirmation ? "confirmation_required" : "available"
    })),
    presentation: {
      layout: controls.presentation.oneStepAtATime ? "focused" : "panel",
      scale: controls.presentation.largeControls ? "large" : "standard",
      speech: preferredOutput.includes("speech"),
      captions: preferredOutput.includes("captions") || avoidedOutput.includes("audio_only"),
      highContrast: preferredOutput.includes("high_contrast"),
      reduceMotion: preferredOutput.includes("reduced_motion") || avoidedOutput.includes("motion")
    },
    platform: {
      target: "SPECS",
      interactionKit: true,
      uiKit: true,
      placement: "world_locked"
    }
  };
}

/**
 * Safety gate between a SPECS UI event and an underlying AGP action executor.
 * The session never treats gaze, hand tracking, or voice recognition as auth.
 *
 * A request() call creates an immutable proposal: the action's parameters
 * are validated, deep-cloned, and bound at that point, not supplied later
 * at execute(). This closes a confirmation/execution mismatch — without
 * it, a user could confirm one action and have a different set of
 * parameters run, because confirm()/provideAuthorization() only ever
 * referenced the action id, not what it would actually do. execute() uses
 * the bound parameters and rejects an attempt to substitute different ones.
 *
 * The proposal is genuinely immutable, not just "immutable by convention".
 * `pending` is a read-only accessor (defined with only a getter, so an
 * assignment to it throws rather than silently replacing the proposal)
 * over a variable that lives in this constructor's closure, not on `this`
 * — there is no `session._pending` or similar property for outside code
 * to reach around the accessor and write to directly. Every proposal
 * object is deep-frozen before being stored, so even a mutation attempt
 * on a nested field of the object `session.pending` or request()'s return
 * value points at throws (ES modules are strict mode) instead of silently
 * succeeding. State transitions build a new frozen object rather than
 * mutating the previous one in place. (This uses closures instead of
 * ES2022 `#private` class fields because this file is copied verbatim
 * into the Lens Studio project in examples/specs/lens-project/, whose JS
 * engine's support for `#private` fields is unverified — see
 * scripts/sync-lens-assets.mjs.)
 */
export class SpecsActionSession {
  constructor(graph, profile = {}, executor = null) {
    this.graph = graph;
    this.profile = profile;
    this.executor = executor;

    let pendingProposal = null;
    Object.defineProperty(this, "pending", {
      enumerable: true,
      get: () => pendingProposal
    });

    this.request = (objectId, actionId, parameters = {}) => {
      const resolved = this.graph.resolveAction(objectId, actionId, this.profile);
      const validatedParameters = validateParameters(resolved.action, parameters);
      pendingProposal = deepFreeze({
        objectId,
        actionId,
        parameters: validatedParameters,
        confirmed: !resolved.requiresConfirmation,
        authorized: !resolved.authorizationRequired
      });
      return {
        status: nextStatus(pendingProposal),
        object: resolved.object,
        action: resolved.action,
        message: promptFor(resolved)
      };
    };

    this.confirm = (accepted) => {
      if (!pendingProposal) throw new Error("No pending SPECS action");
      if (!accepted) {
        pendingProposal = null;
        return { status: "cancelled", message: "Action cancelled." };
      }
      pendingProposal = deepFreeze({ ...pendingProposal, confirmed: true });
      return { status: nextStatus(pendingProposal), message: statusMessage(pendingProposal) };
    };

    this.provideAuthorization = (result) => {
      if (!pendingProposal) throw new Error("No pending SPECS action");
      if (result !== true) {
        pendingProposal = null;
        return { status: "denied", message: "Authorization denied." };
      }
      pendingProposal = deepFreeze({ ...pendingProposal, authorized: true });
      return { status: nextStatus(pendingProposal), message: statusMessage(pendingProposal) };
    };

    this.execute = async (parameters) => {
      if (!pendingProposal) throw new Error("No pending SPECS action");
      const status = nextStatus(pendingProposal);
      if (status !== "ready") throw new Error(`Action is not ready: ${status}`);
      if (typeof this.executor !== "function") throw new Error("No device action executor configured");

      const isOverride = parameters !== undefined && Object.keys(parameters).length > 0;
      if (isOverride && !parametersMatch(parameters, pendingProposal.parameters)) {
        throw new Error(
          `Execution parameters for ${pendingProposal.actionId} do not match the confirmed proposal. Cancel and submit a new request to change parameters.`
        );
      }

      const toExecute = pendingProposal;
      pendingProposal = null;
      const result = await this.executor(toExecute.objectId, toExecute.actionId, toExecute.parameters);
      return { status: "executed", result };
    };

    this.cancel = () => {
      pendingProposal = null;
      return { status: "cancelled", message: "Action cancelled." };
    };
  }
}

export function matchSpecsIntent(utterance, object) {
  const text = normalize(utterance);
  if (!text) return { status: "no_match", matches: [] };

  const matches = (object.actions || []).filter((action) => {
    const candidates = [action.id, action.label, ...(action.metadata?.voice_aliases || [])]
      .filter(Boolean)
      .map(normalize);
    return candidates.some((candidate) => candidate === text);
  });

  if (matches.length === 1) return { status: "matched", actionId: matches[0].id, matches: [matches[0].id] };
  if (matches.length > 1) return { status: "ambiguous", matches: matches.map((action) => action.id) };
  return { status: "no_match", matches: [] };
}

function nextStatus(pending) {
  if (!pending.confirmed) return "confirmation_required";
  if (!pending.authorized) return "authorization_required";
  return "ready";
}

function promptFor(resolved) {
  if (resolved.requiresConfirmation) return `Confirm ${resolved.action.label || humanize(resolved.action.id)}.`;
  if (resolved.authorizationRequired) return "Complete authorization on the underlying service.";
  return "Action ready.";
}

function statusMessage(pending) {
  const status = nextStatus(pending);
  if (status === "authorization_required") return "Complete authorization on the underlying service.";
  if (status === "confirmation_required") return "Confirmation required.";
  return "Action ready.";
}

function normalize(value) {
  return String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

// Validates supplied parameters against the action's declared parameter
// schema (as produced by adapters/wot/index.js's schemaParameter) and
// returns only the recognized, valid values, deep-cloned so the bound
// proposal never shares object/array references with the caller's
// original argument — this is what gets bound to the proposal, so an
// unvalidated, unrecognized, or externally-mutable value can never reach
// an executor.
function validateParameters(action, parameters) {
  const schema = action.parameters;
  if (!schema) return {};

  const supplied = parameters || {};
  const validated = {};
  for (const [name, paramSchema] of Object.entries(schema)) {
    const value = supplied[name];
    if (value === undefined) {
      if (paramSchema.required) throw new Error(`Missing required parameter "${name}" for action ${action.id}`);
      continue;
    }
    if (paramSchema.type === "unsupported") {
      // adapters/wot/index.js flags a schema it could not represent
      // structurally instead of silently coercing it (audit finding D).
      // This session cannot verify a value against an unknown structure,
      // so it fails closed here rather than binding an unverified value
      // into a proposal that confirmation/authorization would then vouch
      // for.
      throw new Error(`Parameter "${name}" for action ${action.id} has a schema this session cannot validate and cannot be bound`);
    }
    if (!typeMatches(paramSchema, value)) {
      throw new Error(`Parameter "${name}" for action ${action.id} must be of type ${paramSchema.type}`);
    }
    if (typeof value === "number") {
      if (paramSchema.minimum !== undefined && value < paramSchema.minimum) {
        throw new Error(`Parameter "${name}" for action ${action.id} is below minimum ${paramSchema.minimum}`);
      }
      if (paramSchema.maximum !== undefined && value > paramSchema.maximum) {
        throw new Error(`Parameter "${name}" for action ${action.id} is above maximum ${paramSchema.maximum}`);
      }
    }
    if (Array.isArray(paramSchema.enum) && !paramSchema.enum.includes(value)) {
      throw new Error(`Parameter "${name}" for action ${action.id} must be one of: ${paramSchema.enum.join(", ")}`);
    }
    validated[name] = structuredCloneSafe(value);
  }
  return validated;
}

// Recursively checks `value` against an AGP parameter schema
// ($defs/parameter in schema/access-graph.schema.json), including the
// object/array structure adapters/wot/index.js can now produce (audit
// finding D) — the previous version only recognized
// integer/number/boolean and treated every other declared type,
// including "object" and "array", as "string": a real object was
// rejected, and a string supplied in its place was wrongly accepted.
// "unsupported" is handled by the caller (validateParameters), which
// rejects it outright rather than reaching this function.
function typeMatches(paramSchema, value) {
  const type = paramSchema.type;
  if (type === "integer") return Number.isInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "boolean") return typeof value === "boolean";
  if (type === "string") return typeof value === "string";
  if (type === "array") {
    if (!Array.isArray(value)) return false;
    return paramSchema.items ? value.every((item) => typeMatches(paramSchema.items, item)) : true;
  }
  if (type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    if (!paramSchema.properties) return true;
    return Object.entries(paramSchema.properties).every(([propName, propSchema]) => {
      const propValue = value[propName];
      if (propValue === undefined) return !propSchema.required;
      return typeMatches(propSchema, propValue);
    });
  }
  // An unrecognized declared type is not a match — fail closed instead of
  // guessing (this is the "strings accepted in place of a real type"
  // failure mode the old fallback had).
  return false;
}

function parametersMatch(a, b) {
  return JSON.stringify(sortedEntries(a)) === JSON.stringify(sortedEntries(b));
}

function sortedEntries(value) {
  return Object.entries(value || {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

// Recursively freezes an object graph so a stored proposal cannot be
// mutated after the fact, only replaced wholesale by this module's own
// code (see the SpecsActionSession constructor). Safe to call on a value
// that's already (partly) frozen.
function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

function humanize(value) {
  return String(value).replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
