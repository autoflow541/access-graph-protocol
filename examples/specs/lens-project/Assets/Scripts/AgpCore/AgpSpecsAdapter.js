import { renderControls, summarizeObject } from "./agp.js";

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
 * are validated and bound at that point, not supplied later at execute().
 * This closes a confirmation/execution mismatch — without it, a user could
 * confirm one action and have a different set of parameters run, because
 * confirm()/provideAuthorization() only ever referenced the action id, not
 * what it would actually do. execute() uses the bound parameters and
 * rejects an attempt to substitute different ones.
 */
export class SpecsActionSession {
  constructor(graph, profile = {}, executor = null) {
    this.graph = graph;
    this.profile = profile;
    this.executor = executor;
    this.pending = null;
  }

  request(objectId, actionId, parameters = {}) {
    const resolved = this.graph.resolveAction(objectId, actionId, this.profile);
    const validatedParameters = validateParameters(resolved.action, parameters);
    this.pending = {
      objectId,
      actionId,
      parameters: validatedParameters,
      confirmed: !resolved.requiresConfirmation,
      authorized: !resolved.authorizationRequired
    };
    return {
      status: nextStatus(this.pending),
      object: resolved.object,
      action: resolved.action,
      message: promptFor(resolved)
    };
  }

  confirm(accepted) {
    if (!this.pending) throw new Error("No pending SPECS action");
    if (!accepted) {
      this.pending = null;
      return { status: "cancelled", message: "Action cancelled." };
    }
    this.pending.confirmed = true;
    return { status: nextStatus(this.pending), message: statusMessage(this.pending) };
  }

  provideAuthorization(result) {
    if (!this.pending) throw new Error("No pending SPECS action");
    if (result !== true) {
      this.pending = null;
      return { status: "denied", message: "Authorization denied." };
    }
    this.pending.authorized = true;
    return { status: nextStatus(this.pending), message: statusMessage(this.pending) };
  }

  async execute(parameters) {
    if (!this.pending) throw new Error("No pending SPECS action");
    const status = nextStatus(this.pending);
    if (status !== "ready") throw new Error(`Action is not ready: ${status}`);
    if (typeof this.executor !== "function") throw new Error("No device action executor configured");

    const isOverride = parameters !== undefined && Object.keys(parameters).length > 0;
    if (isOverride && !parametersMatch(parameters, this.pending.parameters)) {
      throw new Error(
        `Execution parameters for ${this.pending.actionId} do not match the confirmed proposal. Cancel and submit a new request to change parameters.`
      );
    }

    const pending = { ...this.pending };
    this.pending = null;
    const result = await this.executor(pending.objectId, pending.actionId, pending.parameters);
    return { status: "executed", result };
  }

  cancel() {
    this.pending = null;
    return { status: "cancelled", message: "Action cancelled." };
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
// returns only the recognized, valid values — this is what gets bound to
// the proposal, so an unvalidated or unrecognized value can never reach
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
    if (!typeMatches(paramSchema.type, value)) {
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
    validated[name] = value;
  }
  return validated;
}

function typeMatches(type, value) {
  if (type === "integer") return Number.isInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "boolean") return typeof value === "boolean";
  return typeof value === "string";
}

function parametersMatch(a, b) {
  return JSON.stringify(sortedEntries(a)) === JSON.stringify(sortedEntries(b));
}

function sortedEntries(value) {
  return Object.entries(value || {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

function humanize(value) {
  return String(value).replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
