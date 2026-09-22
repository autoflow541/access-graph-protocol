import { renderControls, structuredCloneSafe, summarizeObject } from "./agp.js";

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
 * at execute(). This closes a confirmation/execution mismatch: without
 * it, a user could confirm one action and have a different set of
 * parameters run, because confirm()/provideAuthorization() only ever
 * referenced the action id, not what it would actually do. execute() uses
 * the bound parameters and rejects an attempt to substitute different ones.
 *
 * The proposal is genuinely immutable, not just "immutable by convention".
 * `pending` is a read-only accessor (defined with only a getter, so an
 * assignment to it throws rather than silently replacing the proposal)
 * over a variable that lives in this constructor's closure, not on `this`
 *: there is no `session._pending` or similar property for outside code
 * to reach around the accessor and write to directly. Every proposal
 * object is deep-frozen before being stored, so even a mutation attempt
 * on a nested field of the object `session.pending` or request()'s return
 * value points at throws (ES modules are strict mode) instead of silently
 * succeeding. State transitions build a new frozen object rather than
 * mutating the previous one in place. (This uses closures instead of
 * ES2022 `#private` class fields because this file is copied verbatim
 * into the Lens Studio project in examples/specs/lens-project/, whose JS
 * engine's support for `#private` fields is unverified: see
 * scripts/sync-lens-assets.mjs.)
 */
export class SpecsActionSession {
  constructor(graph, profile = {}, executor = null, options = {}) {
    this.graph = graph;
    this.profile = profile;
    this.executor = executor;

    // Expiry is opt-in until each client implements an accessible re-proposal flow.
    const ttl = options.proposalTtlMs ?? null;
    const now = options.now ?? Date.now;
    if (ttl !== null && (!Number.isFinite(ttl) || ttl <= 0)) throw new Error("Invalid proposal TTL");
    if (typeof now !== "function") throw new Error("Invalid proposal clock");
    let pendingProposal = null;
    const requirePending = () => {
      if (!pendingProposal) throw new Error("No pending SPECS action");
      if (pendingProposal.expiresAt !== null && now() >= pendingProposal.expiresAt) {
        pendingProposal = null;
        const error = new Error("Proposal expired. Review and submit a new request.");
        error.code = "PROPOSAL_EXPIRED";
        throw error;
      }
    };
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
        expiresAt: ttl === null ? null : now() + ttl,
        confirmed: !resolved.requiresConfirmation,
        authorized: !resolved.authorizationRequired
      });
      return {
        status: nextStatus(pendingProposal),
        object: resolved.object,
        action: resolved.action,
        message: promptFor(resolved, validatedParameters)
      };
    };

    this.confirm = (accepted) => {
      requirePending();
      if (!accepted) {
        pendingProposal = null;
        return { status: "cancelled", message: "Action cancelled." };
      }
      pendingProposal = deepFreeze({ ...pendingProposal, confirmed: true });
      return { status: nextStatus(pendingProposal), message: statusMessage(pendingProposal) };
    };

    this.provideAuthorization = (result) => {
      requirePending();
      if (result !== true) {
        pendingProposal = null;
        return { status: "denied", message: "Authorization denied." };
      }
      pendingProposal = deepFreeze({ ...pendingProposal, authorized: true });
      return { status: nextStatus(pendingProposal), message: statusMessage(pendingProposal) };
    };

    this.execute = async (parameters) => {
      requirePending();
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

function promptFor(resolved, parameters) {
  if (resolved.requiresConfirmation) {
    const values = Object.entries(parameters).map(([name, value]) => {
      const schema = resolved.action.parameters?.[name];
      const text = schema?.sensitive ? "[hidden]" : JSON.stringify(value);
      return `${humanize(name)}: ${text}${schema?.unit ? ` ${schema.unit}` : ""}`;
    });
    return `Confirm ${resolved.action.label || humanize(resolved.action.id)} on ${resolved.object.label}.${values.length ? ` ${values.join("; ")}.` : ""}`;
  }
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
// original argument: this is what gets bound to the proposal, so an
// unvalidated, unrecognized, or externally-mutable value can never reach
// an executor. Exported so service/execution-service.js validates
// proposals with the exact same logic instead of a third reimplementation.
export function validateParameters(action, parameters) {
  if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) {
    throw new Error("Parameters must be an object");
  }
  const schema = action.parameters || {};
  for (const name of Object.keys(parameters)) {
    if (!Object.prototype.hasOwnProperty.call(schema, name)) throw new Error(`Unknown parameter "${name}"`);
  }
  const validated = {};
  for (const [name, paramSchema] of Object.entries(schema)) {
    const value = Object.prototype.hasOwnProperty.call(parameters, name) ? parameters[name] : undefined;
    if (value === undefined) {
      if (paramSchema.required) throw new Error(`Missing required parameter "${name}" for action ${action.id}`);
      continue;
    }
    validateValue(paramSchema, value, name);
    Object.defineProperty(validated, name, { value: structuredCloneSafe(value), enumerable: true });
  }
  return validated;
}

// Validate bounds and enums at EVERY node, including array items.
// This is the documented AGP subset, not a complete JSON Schema implementation.
function validateValue(schema, value, path) {
  const fail = (reason) => { throw new Error(`Parameter "${path}" ${reason}`); };
  if (!schema || schema.unsupported || schema.type === "unsupported") fail("has an unsupported schema");
  const type = schema.type;
  const matches = type === "integer" ? Number.isSafeInteger(value)
    : type === "number" ? typeof value === "number" && Number.isFinite(value)
    : type === "boolean" ? typeof value === "boolean"
    : type === "string" ? typeof value === "string"
    : type === "array" ? Array.isArray(value)
    : type === "object" ? value !== null && typeof value === "object" && !Array.isArray(value)
      && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
    : false;
  if (!matches) fail(`must be of type ${type}`);
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) fail(`is below minimum ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) fail(`is above maximum ${schema.maximum}`);
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((choice) => JSON.stringify(canonical(choice)) === JSON.stringify(canonical(value)))) {
    fail("is not an allowed value");
  }
  if (type === "array") {
    if (!schema.items && value.length) fail("has no item schema; item validation is unsupported");
    for (let i = 0; i < value.length; i++) validateValue(schema.items, value[i], `${path}[${i}]`);
  }
  if (type === "object") {
    const properties = schema.properties || {};
    // Closed by default: an undeclared key fails, the same defense
    // against forwarding unvalidated data to an executor that motivated
    // rejecting unknown top-level parameters in the first place. An
    // adapter that genuinely cannot enumerate an object's shape (e.g. a
    // large, variable, externally-generated structure like a PDF
    // remediation manifest, adapters/pdf-remediation/index.js) must opt
    // in explicitly with `additionalProperties: true`; this never
    // weakens validation for a schema that didn't ask for it, and any
    // properties that ARE declared are still validated normally either
    // way.
    if (schema.additionalProperties !== true) {
      for (const key of Object.keys(value)) {
        if (!Object.prototype.hasOwnProperty.call(properties, key)) fail(`contains unknown property "${key}"`);
      }
    }
    for (const [key, child] of Object.entries(properties)) {
      const present = Object.prototype.hasOwnProperty.call(value, key) && value[key] !== undefined;
      if (!present) {
        if (child.required) fail(`is missing required property "${key}"`);
      } else validateValue(child, value[key], `${path}.${key}`);
    }
  }
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

function parametersMatch(a, b) {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
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
