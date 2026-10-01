import { AccessGraph } from "../sdk/javascript/agp.js";
import { SpecsActionSession } from "../adapters/specs/index.js";
import {
  agpGraphToWebMcpTools,
  agpObjectToWebMcpTools,
  agpParametersToInputSchema,
  createWebMcpTool,
  registerAgpToolsWithWebMcp
} from "../adapters/webmcp/index.js";

// --- agpParametersToInputSchema: AGP's per-parameter `required` folds
// into a sibling JSON Schema `required` array; `unit` folds into
// `description`; an unsupported nested shape poisons the whole schema. --
const schema = agpParametersToInputSchema({
  value: { type: "number", required: true, minimum: 16, maximum: 28, unit: "celsius" },
  label: { type: "string", required: false, description: "A note." }
});
if (!schema.required || schema.required.length !== 1 || schema.required[0] !== "value") {
  throw new Error("Required parameters must be collected into a top-level `required` array");
}
if (!schema.properties.value.description.includes("celsius")) throw new Error("unit must be folded into description");
if (schema.properties.label.required !== undefined) throw new Error("Per-property `required` must not leak into the converted JSON Schema property itself");

if (agpParametersToInputSchema({ value: { type: "unsupported", unsupported: true, sourceSchema: {}, required: true } }) !== null) {
  throw new Error("A parameter with an unsupported schema must poison the whole inputSchema (return null), not be silently dropped or guessed");
}

if (agpParametersToInputSchema(undefined).properties && Object.keys(agpParametersToInputSchema(undefined).properties).length !== 0) {
  throw new Error("No parameters should produce an empty object schema, not throw");
}

// --- Graph: one zero-friction action, one confirmation+authorization-gated
// action, one action with an unsupported parameter shape. ------------------
const graph = new AccessGraph([{
  id: "hall-light",
  role: "light",
  label: "Hall light",
  state: { on: false },
  actions: [
    { id: "read_state", label: "Read state", risk: "none", category: "information" },
    {
      id: "turn_on",
      label: "Turn on",
      risk: "medium",
      confirmation: true,
      category: "device_control",
      authorization: { required: true }
    },
    {
      id: "set_schedule",
      label: "Set schedule",
      risk: "low",
      parameters: { value: { type: "unsupported", unsupported: true, sourceSchema: {}, required: true } }
    }
  ]
}]);

let executions = [];
function makeSession() {
  executions = [];
  return new SpecsActionSession(graph, {}, async (objectId, actionId, parameters) => {
    executions.push({ objectId, actionId, parameters });
    return { ok: true };
  });
}

// --- A zero-friction action executes in a single tool call. ---------------
{
  const session = makeSession();
  const tool = createWebMcpTool(session, "hall-light", "read_state");
  if (tool.name !== "hall_light_read_state") throw new Error(`Unexpected default tool name: ${tool.name}`);
  const result = await tool.execute({});
  if (!result.content[0].text.includes("Read state executed.")) throw new Error("A zero-friction action should execute in one tool call");
  if (executions.length !== 1) throw new Error("Executor should run exactly once for a zero-friction action");
}

// --- A confirmation+authorization-gated action is NEVER completed through
// the WebMCP tool alone, no matter how many times the agent calls it. ------
{
  const session = makeSession();
  const tool = createWebMcpTool(session, "hall-light", "turn_on");

  const first = await tool.execute({});
  if (first.content[0].text.includes("Turn on executed.")) throw new Error("A confirmation-required action must not execute on the first call");
  if (!first.content[0].text.toLowerCase().includes("not executed")) throw new Error("The tool result must say the action was not executed");
  if (!first.content[0].text.toLowerCase().includes("confirmation")) throw new Error("The tool result must say confirmation is needed");
  if (executions.length !== 0) throw new Error("Executor must not run before confirmation");
  if (!session.pending) throw new Error("request() should still populate session.pending so the page's own UI can show it");

  // Calling the SAME tool again (the agent retrying, or the page polling)
  // before a human has confirmed anything must not execute it either, and
  // must not be indistinguishable from a successful retry.
  const second = await tool.execute({});
  if (second.content[0].text.includes("Turn on executed.")) throw new Error("Calling the tool again must not execute an unconfirmed action");
  if (executions.length !== 0) throw new Error("Executor must still not have run");

  // Now a REAL person, on the page, confirms and authorizes via the same
  // session -- this is the part the WebMCP tool itself can never do.
  session.confirm(true);
  session.provideAuthorization(true);

  // The agent calling the tool again (same objectId/actionId) must resume
  // and complete the now-ready proposal, not call request() again and
  // discard the human's confirmation.
  const third = await tool.execute({});
  if (!third.content[0].text.includes("Turn on executed.")) throw new Error("A tool call after a real human confirmation must execute");
  if (executions.length !== 1) throw new Error("Executor should run exactly once total, only after confirmation");
}

// --- An action requiring a parameter shape WebMCP can't represent is
// skipped entirely, never registered with a guessed schema. ----------------
{
  const session = makeSession();
  if (createWebMcpTool(session, "hall-light", "set_schedule") !== null) {
    throw new Error("An action with an unsupported parameter schema must not become a WebMCP tool");
  }
  const tools = agpObjectToWebMcpTools(session, "hall-light");
  if (tools.some((tool) => tool.name.includes("set_schedule"))) throw new Error("agpObjectToWebMcpTools must skip the unrepresentable action");
  if (tools.length !== 2) throw new Error("Expected exactly the two representable actions (read_state, turn_on)");

  const graphTools = agpGraphToWebMcpTools(session);
  if (graphTools.length !== tools.length) throw new Error("agpGraphToWebMcpTools should match the single object's tools here (only one object registered)");
}

// --- Outside a browser with document.modelContext, registration is a
// safe no-op, not a throw. --------------------------------------------------
{
  const session = makeSession();
  const tools = agpObjectToWebMcpTools(session, "hall-light");
  const outcome = await registerAgpToolsWithWebMcp(tools);
  if (outcome.available !== false || outcome.registered !== 0) {
    throw new Error("registerAgpToolsWithWebMcp must report unavailable, not throw, when document.modelContext doesn't exist");
  }
}

// --- When document.modelContext IS present (simulated), every tool is
// registered through it with the supplied AbortSignal. ---------------------
{
  const session = makeSession();
  const tools = agpObjectToWebMcpTools(session, "hall-light");
  const registeredTools = [];
  globalThis.document = {
    modelContext: {
      async registerTool(tool, options) {
        registeredTools.push({ tool, options });
      }
    }
  };
  try {
    const controller = new AbortController();
    const outcome = await registerAgpToolsWithWebMcp(tools, { signal: controller.signal });
    if (!outcome.available || outcome.registered !== tools.length) throw new Error("Expected every tool to be reported as registered");
    if (registeredTools.length !== tools.length) throw new Error("document.modelContext.registerTool should be called once per tool");
    if (registeredTools[0].options.signal !== controller.signal) throw new Error("The supplied AbortSignal must reach registerTool, so callers can unregister later");
  } finally {
    delete globalThis.document;
  }
}

console.log("WebMCP adapter test passed");
