import { AGP_VERSION } from "./agp.js";

const RISK_VALUES = new Set(["none", "low", "medium", "high", "critical"]);

/**
 * Convert a W3C Web of Things Thing Description into AGP objects.
 *
 * WoT remains authoritative for transport, security, and invocation. This
 * adapter exposes semantics only and never calls a Thing's forms directly.
 */
export function thingDescriptionToAgp(td, options = {}) {
  assertThingDescription(td);

  const thingId = options.id || stableId(td.id || td.title || "thing");
  const authorizationRequired = requiresAuthorization(td);
  const actions = [
    ...propertyActions(td.properties || {}, authorizationRequired),
    ...thingActions(td.actions || {}, authorizationRequired)
  ];

  const object = {
    agp: AGP_VERSION,
    id: thingId,
    role: extension(td, "role") || inferThingRole(td),
    label: td.title || thingId,
    ...(td.description ? { description: td.description } : {}),
    state: propertyState(td.properties || {}, options.propertyValues || {}),
    actions,
    inputs: unique(actions.length ? ["network", ...listExtension(td, "inputs")] : listExtension(td, "inputs")),
    outputs: unique(listExtension(td, "outputs")),
    events: thingEvents(td.events || {}),
    source: {
      type: "structured_api",
      confidence: 1,
      adapter: "w3c-wot-td-0.1"
    },
    metadata: {
      standard: "W3C Web of Things Thing Description",
      ...(td.id ? { thing_id: td.id } : {}),
      ...(td.base ? { base: td.base } : {}),
      security: normalizeSecurity(td.security),
      transport_owned_by: "wot"
    }
  };

  return object;
}

export function thingDescriptionToGraph(td, options = {}) {
  const root = thingDescriptionToAgp(td, options);
  const children = [];

  for (const [name, property] of Object.entries(td.properties || {})) {
    children.push({
      agp: AGP_VERSION,
      id: `${root.id}-property-${stableId(name)}`,
      role: "sensor",
      label: property.title || humanize(name),
      ...(property.description ? { description: property.description } : {}),
      state: { value: readValue(property, options.propertyValues?.[name]) },
      actions: property.readOnly ? [] : propertyActions({ [name]: property }, requiresAuthorization(td)),
      relationships: [{ type: "part_of", target: root.id }],
      outputs: ["data"],
      source: { type: "structured_api", confidence: 1, adapter: "w3c-wot-td-0.1" },
      metadata: { affordance: "property", property: name }
    });
  }

  root.relationships = children.map((child) => ({ type: "contains", target: child.id }));
  return [root, ...children];
}

function propertyState(properties, values) {
  const state = {};
  for (const [name, property] of Object.entries(properties)) {
    const value = readValue(property, values[name]);
    if (value !== undefined) state[name] = value;
  }
  return state;
}

function readValue(property, suppliedValue) {
  if (suppliedValue !== undefined) return suppliedValue;
  if (property.const !== undefined) return property.const;
  if (property.default !== undefined) return property.default;
  return undefined;
}

function propertyActions(properties, authorizationRequired) {
  const actions = [];
  for (const [name, property] of Object.entries(properties)) {
    if (property.writeOnly !== true) {
      actions.push({
        id: `read_${stableId(name)}`,
        label: `Read ${property.title || humanize(name)}`,
        risk: "none",
        category: "information",
        authorization: { required: authorizationRequired }
      });
    }
    if (property.readOnly !== true) {
      actions.push({
        id: `write_${stableId(name)}`,
        label: `Set ${property.title || humanize(name)}`,
        risk: riskFor(property, "medium"),
        confirmation: confirmationFor(property, true),
        category: extension(property, "category") || "device_control",
        parameters: { value: schemaParameter(property) },
        authorization: { required: authorizationRequired }
      });
    }
  }
  return actions;
}

function thingActions(actions, authorizationRequired) {
  return Object.entries(actions).map(([name, action]) => ({
    id: stableId(name),
    label: action.title || humanize(name),
    ...(action.description ? { description: action.description } : {}),
    risk: riskFor(action, "medium"),
    confirmation: confirmationFor(action, true),
    category: extension(action, "category") || "device_control",
    ...(action.input ? { parameters: inputParameters(action.input) } : {}),
    authorization: { required: authorizationRequired },
    metadata: { affordance: "action", wot_name: name }
  }));
}

function thingEvents(events) {
  return Object.entries(events).map(([name, event]) => ({
    id: stableId(name),
    label: event.title || humanize(name),
    priority: extension(event, "priority") || "normal"
  }));
}

function inputParameters(input) {
  if (input.type === "object" && input.properties) {
    return Object.fromEntries(Object.entries(input.properties).map(([name, schema]) => [name, schemaParameter(schema)]));
  }
  return { value: schemaParameter(input) };
}

function schemaParameter(schema = {}) {
  const allowedTypes = new Set(["string", "number", "integer", "boolean"]);
  const type = allowedTypes.has(schema.type) ? schema.type : "string";
  return {
    type,
    ...(schema.description ? { description: schema.description } : {}),
    ...(schema.minimum !== undefined ? { minimum: schema.minimum } : {}),
    ...(schema.maximum !== undefined ? { maximum: schema.maximum } : {}),
    ...(schema.unit ? { unit: schema.unit } : {}),
    ...(Array.isArray(schema.enum) ? { enum: schema.enum } : {}),
    required: true
  };
}

function requiresAuthorization(td) {
  const security = normalizeSecurity(td.security);
  if (security.length === 0) return true;
  return !security.every((name) => td.securityDefinitions?.[name]?.scheme === "nosec");
}

function normalizeSecurity(security) {
  if (!security) return [];
  return Array.isArray(security) ? security : [security];
}

function riskFor(value, fallback) {
  const risk = extension(value, "risk");
  return RISK_VALUES.has(risk) ? risk : fallback;
}

function confirmationFor(value, fallback) {
  const explicit = extension(value, "confirmation");
  return typeof explicit === "boolean" ? explicit : fallback;
}

function extension(object, name) {
  return object?.[`x-agp-${name}`] ?? object?.[`agp:${name}`];
}

function listExtension(object, name) {
  const value = extension(object, name);
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function inferThingRole(td) {
  const types = Array.isArray(td["@type"]) ? td["@type"] : [td["@type"]].filter(Boolean);
  const joined = types.join(" ").toLowerCase();
  if (joined.includes("thermostat")) return "thermostat";
  if (joined.includes("light")) return "light";
  if (joined.includes("door")) return "door";
  if (joined.includes("sensor")) return "sensor";
  return "device";
}

function assertThingDescription(td) {
  if (!td || typeof td !== "object" || Array.isArray(td)) throw new Error("WoT Thing Description must be an object");
  if (!td.title && !td.id) throw new Error("WoT Thing Description requires title or id");
}

function stableId(value) {
  return String(value).toLowerCase().replace(/^urn:/, "").replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "thing";
}

function humanize(value) {
  return String(value).replaceAll("_", " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function unique(values) {
  return [...new Set(values)];
}
