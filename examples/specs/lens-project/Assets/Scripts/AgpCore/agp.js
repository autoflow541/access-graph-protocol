export const AGP_VERSION = "0.1";

export const RISK_ORDER = ["none", "low", "medium", "high", "critical"];

export class AccessGraph {
  constructor(objects = []) {
    this.objects = new Map();
    objects.forEach((object) => this.register(object));
  }

  register(object) {
    assertBasicObject(object);
    const normalized = structuredCloneSafe(object);
    normalized.agp ??= AGP_VERSION;
    normalized.state ??= {};
    normalized.actions ??= [];
    normalized.source ??= { type: "native_agp", confidence: 1 };
    this.objects.set(normalized.id, normalized);
    return normalized;
  }

  get(id) {
    return this.objects.get(id) ?? null;
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

    const risk = action.risk ?? "none";
    const profileConfirm = profile?.interaction?.confirmation_for ?? [];
    const riskRequiresConfirmation = RISK_ORDER.indexOf(risk) >= RISK_ORDER.indexOf("high");
    const categoryRequiresConfirmation = action.category && profileConfirm.includes(action.category);

    return {
      object: structuredCloneSafe(object),
      action: structuredCloneSafe(action),
      requiresConfirmation: Boolean(action.confirmation || riskRequiresConfirmation || categoryRequiresConfirmation),
      authorizationRequired: Boolean(action.authorization?.required)
    };
  }
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
      risk: action.risk ?? "none",
      confirmation: Boolean(action.confirmation || ["high", "critical"].includes(action.risk))
    })),
    presentation: {
      largeControls: Boolean(large),
      oneStepAtATime: Boolean(oneStep),
      speechPreferred: Boolean(profile?.output?.preferred?.includes("speech"))
    }
  };
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

export function structuredCloneSafe(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
