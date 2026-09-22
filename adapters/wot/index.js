import { AGP_VERSION, createIdAllocator, RISK_ORDER } from "../../sdk/javascript/agp.js";

const RISK_VALUES = new Set(RISK_ORDER);
const PRIMITIVE_PARAMETER_TYPES = new Set(["string", "number", "integer", "boolean"]);

// Category-based policy floors. A source (a Thing Description) can declare
// `x-agp-risk` / `x-agp-confirmation`, but for these categories that
// declaration can only ever RAISE the effective risk/confirmation
// requirement, never lower it below the floor here: an untrusted or
// buggy device cannot self-declare a dangerous action as safe. This is
// the same trust-model gap MCP's tool-annotations spec documents for its
// own hints: annotations may inform UI, but must not be the thing that
// gates a safety-critical decision. See docs/prior-art-and-positioning.md
// and docs/capability-matrix.md (audit finding G).
//
// The category itself (`x-agp-category`) is ALSO source-declared, so a
// device can still dodge these floors by mislabeling a dangerous action as
// e.g. `device_control`. A client-side adapter has no independent way to
// know a category claim is honest: closing that needs classification
// from a reviewed/allowlisted source, not the device itself. `options.
// categoryPolicy` (see resolveCategory below) is that mechanism: a caller
// who has reviewed a specific device/role can supply the real category,
// which then overrides the source's claim and is subject to the same
// floors above. Every action's `metadata.category_trust` records whether
// its category came from that reviewed policy ("reviewed") or only from
// the source itself ("declared"), so a consumer can see: and choose to
// treat with extra caution: an unreviewed claim, instead of the trust
// status being silently assumed either way (audit finding G, category gap).
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
    ...propertyActions(td, td.properties || {}, allocateActionId, options.categoryPolicy),
    ...thingActions(td, td.actions || {}, allocateActionId, options.categoryPolicy)
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
      actions: property.readOnly ? [] : propertyActions(td, { [name]: property }, createIdAllocator(), options.categoryPolicy),
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

// write-only properties (WoT `writeOnly: true`) are never observable:
// projecting a supplied or default value into `state` for one would claim
// to know something that, by the property's own declared affordance, this
// adapter cannot read back (audit finding C).
function isStateReadable(property) {
  return property.writeOnly !== true;
}

// Returns the property's OBSERVED value only: a live supplied value, or a
// WoT `const` (definitionally always known: a const property doesn't
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

function propertyActions(td, properties, allocateActionId, categoryPolicy) {
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
        metadata: { affordance: "property", wot_name: name, category_trust: "reviewed" }
      });
    }
    if (property.readOnly !== true) {
      const resolved = resolveCategory(td, name, extension(property, "category"), categoryPolicy);
      actions.push({
        id: allocateActionId(`write_${stableId(name)}`),
        label: `Set ${property.title || humanize(name)}`,
        risk: riskFor(property, resolved.category, "medium"),
        confirmation: confirmationFor(property, resolved.category, true),
        category: resolved.category,
        parameters: { value: schemaParameter(property, true) },
        authorization: { required: authorizationRequired },
        metadata: { affordance: "property", wot_name: name, category_trust: resolved.trust }
      });
    }
  }
  return actions;
}

function thingActions(td, actions, allocateActionId, categoryPolicy) {
  return Object.entries(actions).map(([name, action]) => {
    const resolved = resolveCategory(td, name, extension(action, "category"), categoryPolicy);
    return {
      id: allocateActionId(stableId(name)),
      label: action.title || humanize(name),
      ...(action.description ? { description: action.description } : {}),
      risk: riskFor(action, resolved.category, "medium"),
      confirmation: confirmationFor(action, resolved.category, true),
      category: resolved.category,
      ...(action.input ? { parameters: inputParameters(action.input) } : {}),
      authorization: { required: requiresAuthorization(td, action) },
      metadata: { affordance: "action", wot_name: name, category_trust: resolved.trust }
    };
  });
}

// The only sound way to correct a self-declared category is an external
// review, encoded here as a caller-supplied `categoryPolicy`: either a
// function `({ td, name, declaredCategory }) => reviewedCategory` (for
// bulk/role-based rules) or a plain object keyed by the affordance's
// original WoT name (for per-action overrides). A category it returns is
// trusted ("reviewed") and subject to the same floors as an honestly
// self-declared one; anything else falls back to the TD's own
// `x-agp-category` (or the "device_control" default) and is marked
// "declared": untrusted, not silently treated as equivalent to reviewed.
// This does not detect a lie on its own; it gives an integrator who HAS
// reviewed a device a way to correct one, and makes which actions have
// NOT been reviewed visible instead of indistinguishable from those that
// have (audit finding G, category gap; docs/capability-matrix.md).
function resolveCategory(td, name, declaredCategory, categoryPolicy) {
  let reviewed;
  if (typeof categoryPolicy === "function") {
    reviewed = categoryPolicy({ td, name, declaredCategory });
  } else if (categoryPolicy && Object.prototype.hasOwnProperty.call(categoryPolicy, name)) {
    reviewed = categoryPolicy[name];
  }
  if (typeof reviewed === "string" && reviewed) {
    return { category: reviewed, trust: "reviewed" };
  }
  return { category: declaredCategory || "device_control", trust: "declared" };
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
// override entirely (audit finding F).
//
// An affordance can have MULTIPLE forms, and a form with no `security` of
// its own inherits the Thing-level default rather than being exempt from
// it. An earlier version only looked at forms that had an explicit
// override and ignored every other form entirely: so one form
// explicitly declaring "nosec" made the whole affordance look
// unauthenticated even when a sibling form (with no override, and so
// inheriting a Thing-level scheme that DOES require auth) was just as
// valid a way to invoke it. This resolves each form's OWN effective
// security independently and requires authorization if ANY of them would
//: fail toward the more restrictive reading, never toward whichever
// form happens to be open.
function requiresAuthorization(td, affordance) {
  const forms = Array.isArray(affordance?.forms) ? affordance.forms : [];
  if (forms.length === 0) return securityRequiresAuth(td, normalizeSecurity(td.security));
  return forms.some((form) => {
    const effective = form.security !== undefined ? normalizeSecurity(form.security) : normalizeSecurity(td.security);
    return securityRequiresAuth(td, effective);
  });
}

function securityRequiresAuth(td, security) {
  if (security.length === 0) return true;
  return !security.every((name) => td.securityDefinitions?.[name]?.scheme === "nosec");
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

function humanize(value) {
  return String(value).replaceAll("_", " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function unique(values) {
  return [...new Set(values)];
}
