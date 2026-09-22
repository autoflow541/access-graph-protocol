import assert from "node:assert/strict";
import { AccessGraph, negotiateCapabilities } from "../sdk/javascript/agp.js";
import { createVisionAssistantObject } from "../adapters/vision-assistant/index.js";
import { createVisionExecutor } from "../service/vision-executor.mjs";
import { simulatedDescriber } from "../service/describers/simulated-describer.mjs";
import { ExecutionService } from "../service/execution-service.js";

// --- The object is well-formed against AGP's own shape: both actions are risk:none, no confirmation, no authorization
{
  const object = createVisionAssistantObject({ id: "front-camera" });
  assert.equal(object.actions.length, 2);
  for (const action of object.actions) {
    assert.equal(action.risk, "none");
    assert.equal(action.confirmation, false);
    assert.equal(action.authorization.required, false);
  }
  assert.deepEqual(object.inputs, ["camera"]);
  assert.ok(object.outputs.includes("speech"));
}

// --- createVisionAssistantObject requires an id, same discipline as every other constructor in this repo
{
  assert.throws(() => createVisionAssistantObject({}));
}

// --- The executor is metadata-driven (graph.get(objectId).actions[..].metadata.describerMode), not hardcoded to this adapter's action ids
{
  const calls = [];
  const fakeDescriber = async (image, mode) => {
    calls.push({ image, mode });
    return `described:${mode}`;
  };
  const graph = new AccessGraph([createVisionAssistantObject({ id: "front-camera" })]);
  const executor = createVisionExecutor(graph, fakeDescriber);

  const sceneResult = await executor("front-camera", "describe_scene", { image: "abc" });
  assert.deepEqual(sceneResult, { description: "described:describe_scene" });

  const textResult = await executor("front-camera", "read_text", { image: "def" });
  assert.deepEqual(textResult, { description: "described:read_text" });

  assert.deepEqual(calls, [
    { image: "abc", mode: "describe_scene" },
    { image: "def", mode: "read_text" }
  ]);

  await assert.rejects(() => executor("front-camera", "unknown_action", { image: "x" }), /Unknown action/);
  await assert.rejects(() => executor("front-camera", "describe_scene", {}), /requires a captured image/);
}

// --- The simulated describer never claims to have actually looked at the image, and reflects payload size, not content
{
  const description = await simulatedDescriber("xxxxxxxxxx", "describe_scene");
  assert.match(description, /Simulated description/);
  assert.match(description, /10-character/);
}

// --- End to end through the real ExecutionService: risk:none/no-confirmation means propose() is immediately "ready", matching the real-world requirement (ask constantly, no friction) this adapter exists for
{
  const object = createVisionAssistantObject({ id: "front-camera" });
  const graph = new AccessGraph([object]);
  const service = new ExecutionService({
    graph,
    allowedCallers: new Set(["good-token"]),
    executor: createVisionExecutor(graph, simulatedDescriber)
  });

  const { stateVersion } = service.describe({ callerToken: "good-token", objectId: "front-camera" });
  const proposal = service.propose({
    callerToken: "good-token",
    objectId: "front-camera",
    actionId: "describe_scene",
    parameters: { image: "fake-image-data" },
    stateVersion
  });
  assert.equal(proposal.status, "ready", "an informational, no-risk action must never require confirmation or authorization");

  const result = await service.execute({ callerToken: "good-token", proposalId: proposal.proposalId, requestId: "vision-e2e-1" });
  assert.equal(result.status, "succeeded");
  assert.match(result.result.description, /Simulated description/);
}

// --- negotiateCapabilities() (built for capability negotiation, sdk/javascript/agp.js) works unmodified against this new "camera" input requirement: no changes needed for a new media type
{
  const object = createVisionAssistantObject({ id: "front-camera" });
  const withCamera = negotiateCapabilities(object, { inputs: ["camera"], outputs: ["speech", "text"] });
  assert.equal(withCamera.canControl, true);
  assert.deepEqual(withCamera.conflicts, []);

  const withoutCamera = negotiateCapabilities(object, { inputs: [], outputs: ["speech", "text"] });
  assert.equal(withoutCamera.canControl, false);
  const inputConflict = withoutCamera.conflicts.find((c) => c.channel === "input");
  assert.match(inputConflict.explanation, /No alternative input is available in this session/);
}

console.log("Vision assistant test passed (object shape, executor dispatch, simulated describer, zero-friction lifecycle, capability negotiation reuse)");
