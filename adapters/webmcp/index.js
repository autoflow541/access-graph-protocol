import { humanize } from "../../sdk/javascript/agp.js";

/**
 * Convert an AGP action's parameter schema (the shape produced by
 * adapters/wot/index.js's schemaParameter, or written natively: see
 * schema/access-graph.schema.json's $defs/parameter) into a WebMCP tool's
 * `inputSchema`: a standard JSON Schema object, per
 * github.com/webmachinelearning/webmcp's `document.modelContext.
 * registerTool()` ({ name, description, inputSchema, execute }).
 *
 * The one real shape difference: AGP puts `required: true/false` on each
 * individual parameter; JSON Schema (and so WebMCP) wants required names
 * collected into a sibling `required` array. Everything else (type,
 * description, minimum/maximum, enum, nested object/array shapes) maps
 * through directly.
 *
 * Returns null if any parameter's schema is `unsupported: true` (the
 * escape hatch schemaParameter uses for a shape it can't represent): a
 * tool an AI agent cannot fill in with valid structured arguments must
 * not be registered with a guessed schema, it must not be registered at
 * all. Same reasoning as adapters/wot/index.js's audit finding D.
 */
export function agpParametersToInputSchema(parameters) {
  if (!parameters || Object.keys(parameters).length === 0) {
    return { type: "object", properties: {} };
  }
  const properties = {};
  const required = [];
  for (const [name, schema] of Object.entries(parameters)) {
    const converted = convertParameter(schema);
    if (converted === null) return null;
    properties[name] = converted;
    if (schema.required) required.push(name);
  }
  return { type: "object", properties, ...(required.length ? { required } : {}) };
}

function convertParameter(schema) {
  if (!schema || schema.unsupported || schema.type === "unsupported") return null;
  // AGP's `unit` has no JSON Schema equivalent; fold it into the
  // description text instead of inventing a non-standard keyword an
  // agent (or a strict schema validator) wouldn't know to look for.
  // Mirrors how adapters/specs/index.js's promptFor() already appends
  // unit to confirmation text.
  const unit = schema.unit ? ` (${schema.unit})` : "";
  const description = `${schema.description || ""}${unit}`.trim() || undefined;

  if (schema.type === "object" && schema.properties) {
    const nested = agpParametersToInputSchema(schema.properties);
    if (nested === null) return null;
    return {
      type: "object",
      ...(description ? { description } : {}),
      properties: nested.properties,
      ...(nested.required ? { required: nested.required } : {}),
      ...(schema.additionalProperties === true ? { additionalProperties: true } : {})
    };
  }
  if (schema.type === "array") {
    if (!schema.items) return null;
    const items = convertParameter(schema.items);
    if (items === null) return null;
    return { type: "array", ...(description ? { description } : {}), items };
  }
  return {
    type: schema.type,
    ...(description ? { description } : {}),
    ...(schema.minimum !== undefined ? { minimum: schema.minimum } : {}),
    ...(schema.maximum !== undefined ? { maximum: schema.maximum } : {}),
    ...(Array.isArray(schema.enum) ? { enum: schema.enum } : {})
  };
}

/**
 * Build one WebMCP tool definition for a single AGP action, backed by a
 * session with the same request/confirm/provideAuthorization/execute/
 * pending shape as adapters/specs/index.js's SpecsActionSession (that
 * class is meant to be reused directly here; nothing in this file is
 * WebMCP-specific about it, which is the point: one safety gate, every
 * client).
 *
 * THE NON-NEGOTIABLE PART: this tool's execute() never confirms or
 * authorizes on the agent's behalf, and it never exposes confirm() or
 * provideAuthorization() as callable WebMCP tools at all. Doing either
 * would hand an AI agent exactly the bypass path docs/prior-art-and-
 * positioning.md's MCP and Apple App Intents sections exist to warn
 * against: a source- or agent-supplied signal is not permission, and a
 * confirmation step an input path can silently route around is worse
 * than no confirmation step, because it looks safe in code review.
 *
 * For an action that comes back `confirmation_required` or
 * `authorization_required`, execute() returns a result saying so and
 * stops -- full stop, not "try again shortly." Completing it requires a
 * REAL person acting on the SAME page this tool is registered from: that
 * page reads `session.pending` (populated by this tool's own request()
 * call) and drives session.confirm()/provideAuthorization() from an
 * actual click, exactly as adapters/specs/README.md already describes
 * for a SPECS Lens. If the agent calls this same tool again afterward
 * with the same objectId/actionId, this function resumes the now-
 * confirmed pending proposal instead of calling request() again (which
 * would otherwise silently discard it and demand confirmation a second
 * time): see the `alreadyPending` branch below.
 *
 * A confirmation-required action is therefore never completable through
 * WebMCP alone, by construction -- not merely discouraged. This is a
 * deliberately conservative design choice for v0.1: it limits WebMCP
 * tools to zero-friction (no confirmation, no authorization) actions for
 * now, in exchange for having no new bypass surface to reason about at
 * all. A lower-friction path for gated actions, if one is ever built
 * once there's a reference browser implementation to test against, is
 * tracked in ROADMAP.md rather than guessed at here.
 */
export function createWebMcpTool(session, objectId, actionId, options = {}) {
  const resolved = session.graph.resolveAction(objectId, actionId, session.profile);
  const action = resolved.action;
  const inputSchema = agpParametersToInputSchema(action.parameters);
  if (inputSchema === null) return null;

  const label = action.label || humanize(action.id);

  return {
    name: options.name || `${stableToolName(objectId)}_${action.id}`,
    description: action.description || label,
    inputSchema,
    async execute(args = {}) {
      const pending = session.pending;
      const alreadyPending = pending && pending.objectId === objectId && pending.actionId === actionId;

      if (alreadyPending) {
        try {
          const result = await session.execute();
          return toolResult(`${label} executed.`, result.result);
        } catch (error) {
          if (error?.code === "PROPOSAL_EXPIRED") {
            // Fall through: the stale proposal is gone, request a fresh one below.
          } else {
            // Still confirmation_required / authorization_required: report
            // status without touching the pending proposal a human may be
            // actively reviewing on the page right now.
            return toolResult(gateMessage(pending, label));
          }
        }
      }

      const outcome = session.request(objectId, actionId, args);
      if (outcome.status !== "ready") {
        return toolResult(gateMessage(session.pending, label, outcome.message));
      }
      const result = await session.execute();
      return toolResult(`${label} executed.`, result.result);
    }
  };
}

function gateMessage(pending, label, requestMessage) {
  const needs = !pending.confirmed ? "confirmation" : "authorization";
  const prefix = requestMessage ? `${requestMessage} ` : "";
  return `${prefix}"${label}" was NOT executed: it requires ${needs} from the person using this page, not from an AI agent. Ask them to review and complete it there, then try again.`;
}

function toolResult(text, data) {
  return {
    content: [
      { type: "text", text },
      ...(data !== undefined ? [{ type: "text", text: JSON.stringify(data) }] : [])
    ]
  };
}

/**
 * Build a WebMCP tool for every action on one AGP object that can be
 * safely represented (agpParametersToInputSchema didn't return null for
 * it). An action that can't be represented is silently skipped, not
 * registered with a guessed schema -- same reasoning as createWebMcpTool.
 */
export function agpObjectToWebMcpTools(session, objectId) {
  const object = session.graph.get(objectId);
  if (!object) throw new Error(`Unknown AGP object: ${objectId}`);
  return (object.actions || [])
    .map((action) => createWebMcpTool(session, objectId, action.id))
    .filter((tool) => tool !== null);
}

/** Build WebMCP tools for every object currently registered in the graph. */
export function agpGraphToWebMcpTools(session) {
  return session.graph.list().flatMap((object) => agpObjectToWebMcpTools(session, object.id));
}

/**
 * Register a list of WebMCP tool definitions (as built above) with the
 * browser's `document.modelContext`, per the WebMCP explainer
 * (github.com/webmachinelearning/webmcp). A no-op outside a browser that
 * implements `document.modelContext` (Node, a test runner, or a browser
 * without the feature yet: it shipped as a Chrome Early Preview in
 * February 2026, not universal) -- this never throws for an environment
 * gap, it reports `{ available: false }` and lets the caller decide
 * whether that's worth surfacing.
 */
export async function registerAgpToolsWithWebMcp(tools, options = {}) {
  const modelContext = typeof document !== "undefined" ? document.modelContext : undefined;
  if (!modelContext || typeof modelContext.registerTool !== "function") {
    return { available: false, registered: 0 };
  }
  for (const tool of tools) {
    await modelContext.registerTool(tool, options.signal ? { signal: options.signal } : undefined);
  }
  return { available: true, registered: tools.length };
}

function stableToolName(objectId) {
  return String(objectId).toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || "agp_object";
}
