import assert from "node:assert/strict";
import { AccessGraph, negotiateCapabilities } from "../sdk/javascript/agp.js";
import { createWebPageObject } from "../adapters/web-vision/index.js";
import { createVisionExecutor } from "../service/vision-executor.mjs";
import { simulatedDescriber } from "../service/describers/simulated-describer.mjs";
import { ExecutionService } from "../service/execution-service.js";

// --- The object is well-formed, and distinct from vision-assistant's "camera" input requirement
{
  const object = createWebPageObject({ id: "current-tab" });
  assert.equal(object.actions.length, 2);
  for (const action of object.actions) {
    assert.equal(action.risk, "none");
    assert.equal(action.confirmation, false);
  }
  assert.deepEqual(object.inputs, ["screen_capture"]);
  assert.equal(object.actions.find((a) => a.id === "find_element").parameters.query.required, true);
}

assert.throws(() => createWebPageObject({}));

// --- The exact same executor built for adapters/vision-assistant/ dispatches this adapter's actions unmodified,
// including passing "query" through for find_element, which describe_page never needed
{
  const calls = [];
  const fakeDescriber = async (image, mode, query) => {
    calls.push({ image, mode, query });
    return `described:${mode}:${query ?? "none"}`;
  };
  const graph = new AccessGraph([createWebPageObject({ id: "current-tab" })]);
  const executor = createVisionExecutor(graph, fakeDescriber);

  const pageResult = await executor("current-tab", "describe_page", { image: "screenshot-data" });
  assert.deepEqual(pageResult, { description: "described:describe_page:none" });

  const findResult = await executor("current-tab", "find_element", { image: "screenshot-data", query: "the submit button" });
  assert.deepEqual(findResult, { description: "described:find_element:the submit button" });

  assert.deepEqual(calls, [
    { image: "screenshot-data", mode: "describe_page", query: undefined },
    { image: "screenshot-data", mode: "find_element", query: "the submit button" }
  ]);
}

// --- The simulated describer echoes the query when one is given
{
  const withoutQuery = await simulatedDescriber("xxxxxxxxxx", "describe_page");
  assert.doesNotMatch(withoutQuery, /asked to find/);
  const withQuery = await simulatedDescriber("xxxxxxxxxx", "find_element", "the login link");
  assert.match(withQuery, /asked to find: "the login link"/);
}

// --- End to end through the real ExecutionService: same zero-friction lifecycle as vision-assistant
{
  const object = createWebPageObject({ id: "current-tab" });
  const graph = new AccessGraph([object]);
  const service = new ExecutionService({
    graph,
    allowedCallers: new Set(["good-token"]),
    executor: createVisionExecutor(graph, simulatedDescriber)
  });

  const { stateVersion } = service.describe({ callerToken: "good-token", objectId: "current-tab" });
  const proposal = service.propose({
    callerToken: "good-token",
    objectId: "current-tab",
    actionId: "find_element",
    parameters: { image: "fake-screenshot-data", query: "the search box" },
    stateVersion
  });
  assert.equal(proposal.status, "ready");

  const result = await service.execute({ callerToken: "good-token", proposalId: proposal.proposalId, requestId: "web-vision-e2e-1" });
  assert.equal(result.status, "succeeded");
  assert.match(result.result.description, /the search box/);
}

// --- negotiateCapabilities() distinguishes "screen_capture" from vision-assistant's "camera" with zero changes to that function
{
  const object = createWebPageObject({ id: "current-tab" });
  const withCapture = negotiateCapabilities(object, { inputs: ["screen_capture"], outputs: ["text"] });
  assert.equal(withCapture.canControl, true);

  const cameraOnly = negotiateCapabilities(object, { inputs: ["camera"], outputs: ["text"] });
  assert.equal(cameraOnly.canControl, false, "having a camera does not imply screen-capture capability, and the function must not conflate them");
}

console.log("Web vision test passed (object shape, shared executor reuse across two media types, query passthrough, capability negotiation distinguishes screen_capture from camera)");
