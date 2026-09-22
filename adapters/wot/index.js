import { AGP_VERSION, RISK_ORDER } from "../../sdk/javascript/agp.js";

const RISK_VALUES = new Set(RISK_ORDER);
const PRIMITIVE_PARAMETER_TYPES = new Set(["string", "number", "integer", "boolean"]);

// Category-based policy floors. A source (a Thing Description) can declare
// `x-agp-risk` / `x-agp-confirmation`, but for these categories that
// declaration can only ever RAISE the effective risk/confirmation
// requirement, never lower it below the floor here — an untrusted or
// buggy device cannot self-declare a dangerous action as safe. This is
// the same trust-model gap MCP's tool-annotations spec documents for its
// own hints: annotations may inform UI, but must not be the thing that
// gates a safety-critical decision. See docs/prior-art-and-positioning.md
// and docs/capability-matrix.md (audit finding G).
//
// The category itself is still source-declared (`x-agp-category`), so a
// device could still mislabel a dangerous action as `device_control` to
// dodge these floors entirely. Closing that fully needs category
// classification from a reviewed/allowlisted source, not a client-side
// adapter — tracked in ROADMAP.md, not solved here.
const CATEGORY_RISK_FLOOR = {
  physical_safety: "high",
  security: "high",
  financial: "high",
  destructive: "high"
};
const CATEGORY_CONFIRMATION_FLOOR = new Set(["physical_safety", "security", "financial", "destructive"]);

/**
 * Convert a W3C Web of Things Thing Description into AGP objects.
 *
 * WoT remains authoritative for transport, security, and invocation. This
 * adapter exposes semantics only and never calls a Thing's forms directly.
 */
export function thingDescriptionToAgp(td, options = {}) {
  assertThingDescription(td);

  const thingId = options.id || stableId(td.id || td.title || "thing");
  const allocateActionId = createIdAllocator();
  const actions = [
    ...propertyActions(td, td.properties || {}, allocateActionId),
    ...thingActions(td, td.actions || {}, allocateActionId)
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
  const allocateChildId = createIdAllocator();

  for (const [name, property] of Object.entries(td.properties || {})) {
    const knownValue = isStateReadable(property) ? readValue(property, options.propertyValues?.[name]) : undefined;
    children.push({
      agp: AGP_VERSION,
      id: allocateChildId(`${root.id}-property-${stableId(name)}`),
      role: "sensor",
      label: property.title || humanize(name),
      ...(property.description ? { description: property.description } : {}),
      state: knownValue === undefined ? {} : { value: knownValue },
      actions: property.readOnly ? [] : propertyActions(td, { [name]: property }, createIdAllocator()),
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
    if (!isStateReadable(property)) continue;
    const value = readValue(property, values[name]);
    if (value !== undefined) state[name] = value;
  }
  return state;
}

// write-only properties (WoT `writeOnly: true`) are never observable —
// projecting a supplied or default value into `state` for one would claim
// to know something that, by the property's own declared affordance, this
// adapter cannot read back (audit finding C).
function isStateReadable(property) {
  return property.writeOnly !== true;
}

// Returns the property's OBSERVED value only: a live supplied value, or a
// WoT `const` (definitionally always known — a const property doesn't
// need a live read to be accurate). A schema `default` is NOT an observed
// value; using it as a state fallback would silently present a guess as
// live device state. With neither a supplied value nor a const, the
// property is correctly represented as unknown by being absent from
// `state`, rather than invented from `default` (audit finding C).
function readValue(property, suppliedValue) {
  if (suppliedValue !== undefined) return suppliedValue;
  if (property.const !== undefined) return property.const;
  return undefined;
}

function propertyActions(td, properties, allocateActionId) {
  const actions = [];
  for (const [name, property] of Object.entries(properties)) {
    const authorizationRequired = requiresAuthorization(td, property);
    if (property.writeOnly !== true) {
      actions.push({
        id: allocateActionId(`read_${stableId(name)}`),
        label: `Read ${property.title || humanize(name)}`,
        risk: "none",
        category: "information",
        authorization: { required: authorizationRequired },
        metadata: { affordance: "property", wot_name: name }
      });
    }
    if (property.readOnly !== true) {
      const category = extension(property, "category") || "device_control";
      actions.push({
        id: allocateActionId(`write_${stableId(name)}`),
        label: `Set ${property.title || humanize(name)}`,
        risk: riskFor(property, category, "medium"),
        confirmation: confirmationFor(property, category, true),
        category,
        parameters: { value: schemaParameter(property, true) },
        authorization: { required: authorizationRequired },
        metadata: { affordance: "property", wot_name: name }
      });
    }
  }
  return actions;
}

function thingActions(td, actions, allocateActionId) {
  return Object.entries(actions).map(([name, action]) => {
    const category = extension(action, "category") || "device_control";
    return {
      id: allocateActionId(stableId(name)),
      label: action.title || humanize(name),
      ...(action.description ? { description: action.description } : {}),
      risk: riskFor(action, category, "medium"),
      confirmation: confirmationFor(action, category, true),
      category,
      ...(action.input ? { parameters: inputParameters(action.input) } : {}),
      authorization: { required: requiresAuthorization(td, action) },
      metadata: { affordance: "action", wot_name: name }
    };
  });
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
    const requiredNames = new Set(Array.isArray(input.required) ? input.required : []);
    return Object.fromEntries(
      Object.entries(input.properties).map(([name, schema]) => [name, schemaParameter(schema, requiredNames.has(name))])
    );
  }
  return { value: schemaParameter(input, true) };
}

// Translates a WoT/JSON-Schema-shaped parameter schema into an AGP
// `parameter` ($defs/parameter in schema/access-graph.schema.json).
// Preserves object/array structure and each property's real
// requiredness instead of the previous behavior of silently coercing any
// unsupported type to "string" and marking everything required (audit
// finding D). A schema shape this function genuinely can't represent is
// flagged with `unsupported: true` and the original schema preserved
// under `sourceSchema`, rather than misrepresented as a string.
function schemaParameter(schema = {}, required = true) {
  const shared = {
    ...(schema.description ? { description: schema.description } : {}),
    ...(schema.unit ? { unit: schema.unit } : {}),
    required: Boolean(required)
  };

  if (PRIMITIVE_PARAMETER_TYPES.has(schema.type)) {
    return {
      type: schema.type,
      ...shared,
      ...(schema.minimum !== undefined ? { minimum: schema.minimum } : {}),
      ...(schema.maximum !== undefined ? { maximum: schema.maximum } : {}),
      ...(Array.isArray(schema.enum) ? { enum: schema.enum } : {})
    };
  }

  if (schema.type === "array") {
    return {
      type: "array",
      ...shared,
      ...(schema.items ? { items: schemaParameter(schema.items, true) } : {})
    };
  }

  if (schema.type === "object" && schema.properties) {
    const requiredNames = new Set(Array.isArray(schema.required) ? schema.required : []);
    return {
      type: "object",
      ...shared,
      properties: Object.fromEntries(
        Object.entries(schema.properties).map(([name, propSchema]) => [name, schemaParameter(propSchema, requiredNames.has(name))])
      )
    };
  }

  return {
    type: "unsupported",
    unsupported: true,
    sourceSchema: schema,
    ...shared
  };
}

// A form (WoT TD §5.3.4) can declare its own `security`, overriding the
// Thing-level default for that specific interaction affordance. Reading
// only `td.security` (as this adapter previously did) misses that
// override entirely (audit finding F). When forms disagree or combine
// multiple schemes, this fails toward requiring authorization rather than
// picking an arbitrary one.
function requiresAuthorization(td, affordance) {
  const formOverride = formSecuritySchemes(affordance);
  const security = formOverride !== null ? formOverride : normalizeSecurity(td.security);
  if (security.length === 0) return true;
  return !security.every((name) => td.securityDefinitions?.[name]?.scheme === "nosec");
}

function formSecuritySchemes(affordance) {
  const forms = Array.isArray(affordance?.forms) ? affordance.forms : [];
  const declared = forms.map((form) => form.security).filter((security) => security !== undefined);
  if (declared.length === 0) return null;
  return unique(declared.flatMap((security) => normalizeSecurity(security)));
}

function normalizeSecurity(security) {
  if (!security) return [];
  return Array.isArray(security) ? security : [security];
}

function riskFor(value, category, fallback) {
  const declared = extension(value, "risk");
  const sourceRisk = RISK_VALUES.has(declared) ? declared : fallback;
  const floor = CATEGORY_RISK_FLOOR[category];
  if (!floor) return sourceRisk;
  return RISK_ORDER.indexOf(sourceRisk) >= RISK_ORDER.indexOf(floor) ? sourceRisk : floor;
}

function confirmationFor(value, category, fallback) {
  if (CATEGORY_CONFIRMATION_FLOOR.has(category)) return true;
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

// Case/punctuation folding in stableId() can map two distinct source
// names to the same candidate id (e.g. "Target-Temperature" and
// "target_temperature" both fold to "target-temperature"). Silently
// letting that happen means the second registration overwrites the first
// in AccessGraph (audit finding E). Each adapter entry point uses its own
// allocator instance so collisions are only disambiguated within that
// call's own id namespace, not across unrelated Things.
function createIdAllocator() {
  const used = new Map();
  return function allocate(candidateId) {
    const count = used.get(candidateId) || 0;
    used.set(candidateId, count + 1);
    return count === 0 ? candidateId : `${candidateId}-${count + 1}`;
  };
}

function humanize(value) {
  return String(value).replaceAll("_", " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function unique(values) {
  return [...new Set(values)];
}
