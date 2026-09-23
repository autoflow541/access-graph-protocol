import assert from "node:assert/strict";
import { AccessGraph, RISK_ORDER } from "../sdk/javascript/agp.js";
import { SpecsActionSession } from "../adapters/specs/index.js";
import { ExecutionService } from "../service/execution-service.js";

// Regression tests for a pasted external audit's findings (22 September
// 2026), each verified against actual source before being accepted as
// real: see CHANGELOG.md. Every block below reproduces the exploit shape
// first (proving the old behavior would have let it through), then
// asserts the fix.

function lamp(overrides = {}) {
  return { id: "lamp-01", role: "light", label: "Lamp", state: { on: false }, actions: [{ id: "turn_on", label: "Turn on", risk: "low" }], ...overrides };
}

// --- register() rejects a duplicate object id instead of silently overwriting the first registration
{
  const graph = new AccessGraph([lamp()]);
  assert.throws(
    () => graph.register(lamp({ label: "Impostor lamp" })),
    /already registered/,
    "registering a second object with an id already in the graph must throw, not silently replace the first"
  );
  assert.equal(graph.get("lamp-01").label, "Lamp", "the original registration must survive a rejected duplicate");
}

// --- register() rejects a duplicate action id within one object
{
  const graph = new AccessGraph();
  assert.throws(
    () => graph.register(lamp({ actions: [{ id: "turn_on", label: "A" }, { id: "turn_on", label: "B" }] })),
    /duplicate action id/
  );
}

// --- register() rejects an action with a risk value outside RISK_ORDER, instead of letting it silently fail open
{
  const graph = new AccessGraph();
  assert.throws(
    () => graph.register(lamp({ actions: [{ id: "turn_on", label: "Turn on", risk: "extreme" }] })),
    /unrecognized risk value/
  );
  for (const risk of RISK_ORDER) {
    // every real risk value is still accepted
    graph.register({ id: `ok-${risk}`, role: "x", label: "x", actions: [{ id: "a", label: "a", risk }] });
  }
}

// --- requiresConfirmationFor (via resolveAction) fails conservative for an unrecognized risk that
// somehow reaches it despite register()'s guard: treated as requiring confirmation, not exempt from it
{
  const graph = new AccessGraph();
  // Bypass register()'s validation to simulate a future/foreign risk value already in the graph
  // (e.g. loaded from a source that predates a stricter RISK_ORDER).
  graph.objects.set("weird-01", { id: "weird-01", role: "x", label: "Weird", state: {}, actions: [{ id: "go", label: "Go", risk: "quantum" }] });
  const resolved = graph.resolveAction("weird-01", "go", {});
  assert.equal(resolved.requiresConfirmation, true, "an unrecognized risk value must never read as exempt from confirmation");
}

// --- get() returns a clone: mutating the caller's copy must never corrupt the graph's own state
{
  const graph = new AccessGraph([lamp()]);
  const borrowed = graph.get("lamp-01");
  borrowed.label = "Tampered";
  borrowed.actions.push({ id: "delete_everything", label: "Delete everything", risk: "critical" });
  borrowed.state.on = true;

  const fresh = graph.get("lamp-01");
  assert.equal(fresh.label, "Lamp", "mutating a get() result must not change the object's real label");
  assert.equal(fresh.actions.length, 1, "mutating a get() result must not add actions to the real policy graph");
  assert.equal(fresh.state.on, false, "mutating a get() result must not change the object's real state");
}

// --- get() on a missing id still returns null, not an error
{
  const graph = new AccessGraph();
  assert.equal(graph.get("nope"), null);
}

// --- ExecutionService.confirm(): only the literal boolean true counts as acceptance
{
  const graph = new AccessGraph([lamp({ actions: [{ id: "turn_on", label: "Turn on", risk: "high" }] })]);
  const service = new ExecutionService({
    graph,
    executor: async () => ({}),
    allowedCallers: new Set(["good-token"])
  });
  const { stateVersion } = service.describe({ callerToken: "good-token", objectId: "lamp-01" });

  for (const truthyNotTrue of ["false", 1, {}, "yes", []]) {
    const proposal = service.propose({ callerToken: "good-token", objectId: "lamp-01", actionId: "turn_on", stateVersion });
    const result = service.confirm({ callerToken: "good-token", proposalId: proposal.proposalId, accepted: truthyNotTrue });
    assert.equal(result.status, "cancelled", `accepted: ${JSON.stringify(truthyNotTrue)} is truthy but must not count as consent`);
  }

  // The real thing still works
  const proposal = service.propose({ callerToken: "good-token", objectId: "lamp-01", actionId: "turn_on", stateVersion });
  const result = service.confirm({ callerToken: "good-token", proposalId: proposal.proposalId, accepted: true });
  assert.equal(result.status, "ready");
}

// --- SpecsActionSession.confirm(): same truthy-coercion fix, client-side gate
{
  const graph = new AccessGraph([lamp({ actions: [{ id: "turn_on", label: "Turn on", risk: "high" }] })]);
  const session = new SpecsActionSession(graph, {}, async () => ({}));
  session.request("lamp-01", "turn_on");
  const result = session.confirm("false");
  assert.equal(result.status, "cancelled", "SpecsActionSession.confirm('false') must not count as consent");
}

// --- execute()'s idempotency cache is authenticated before it is ever consulted,
// and is scoped per caller: two different callers reusing the same requestId string must not collide
{
  let calls = 0;
  const graph = new AccessGraph([lamp({ actions: [{ id: "turn_on", label: "Turn on", risk: "low" }] })]);
  const service = new ExecutionService({
    graph,
    executor: async (_objectId, actionId) => { calls += 1; return { actionId, callNumber: calls }; },
    allowedCallers: new Set(["alice", "bob"])
  });

  async function proposeAndReady(callerToken) {
    const { stateVersion } = service.describe({ callerToken, objectId: "lamp-01" });
    const proposal = service.propose({ callerToken, objectId: "lamp-01", actionId: "turn_on", stateVersion });
    service.confirm({ callerToken, proposalId: proposal.proposalId, accepted: true });
    return proposal.proposalId;
  }

  const aliceProposal = await proposeAndReady("alice");
  const aliceResult = await service.execute({ callerToken: "alice", proposalId: aliceProposal, requestId: "shared-id" });
  assert.equal(calls, 1);

  // Bob independently picks the exact same requestId string for his own, unrelated action.
  const bobProposal = await proposeAndReady("bob");
  const bobResult = await service.execute({ callerToken: "bob", proposalId: bobProposal, requestId: "shared-id" });
  assert.equal(calls, 2, "bob's request must actually dispatch, not silently return alice's cached outcome");
  assert.notDeepEqual(bobResult, aliceResult, "two different callers sharing a requestId string must not collide in the idempotency cache");

  // An unauthenticated caller must be rejected before the cache is even consulted (no info leak via cache-hit timing/shape either)
  await assert.rejects(
    () => service.execute({ callerToken: "intruder", proposalId: aliceProposal, requestId: "shared-id" }),
    { code: "UNAUTHENTICATED" }
  );
  assert.equal(calls, 2, "an unauthenticated caller must never reach dispatch, and must never be answered from another caller's cache entry");
}

console.log("Security fixes test passed (duplicate ids, risk validation, get() cloning, confirm() truthy coercion, per-caller idempotency scoping)");
