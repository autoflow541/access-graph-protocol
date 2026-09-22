import assert from "node:assert/strict";
import { AccessGraph } from "../sdk/javascript/agp.js";
import { ExecutionService, OUTCOME } from "../service/execution-service.js";

function buildGraph() {
  return new AccessGraph([
    {
      id: "lamp-01",
      role: "light",
      label: "Lamp",
      state: { on: false },
      actions: [
        { id: "turn_on", label: "Turn on", risk: "low", confirmation: false, category: "lighting", authorization: { required: true } },
        { id: "set_brightness", label: "Set brightness", risk: "low", confirmation: false, authorization: { required: true },
          parameters: { value: { type: "integer", minimum: 0, maximum: 100, required: true } } },
        { id: "calibrate", label: "Calibrate sensor", risk: "low", confirmation: false, authorization: { required: false },
          parameters: { sensor: { type: "unsupported" } } }
      ]
    }
  ]);
}

let clock = 1000;
function makeService(overrides = {}) {
  clock = 1000;
  let calls = 0;
  const executor = overrides.executor ?? (async (_objectId, actionId, parameters) => {
    calls += 1;
    return { actionId, parameters };
  });
  const service = new ExecutionService({
    graph: buildGraph(),
    executor,
    allowedCallers: new Set(["good-token"]),
    now: () => clock,
    proposalTtlMs: 1000,
    dispatchTimeoutMs: 200,
    requestRetentionMs: 1000,
    ...overrides
  });
  return { service, getCalls: () => calls };
}

async function readyProposal(service, callerToken = "good-token", actionId = "turn_on", parameters = {}) {
  const { stateVersion } = service.describe({ callerToken, objectId: "lamp-01" });
  const proposal = service.propose({ callerToken, objectId: "lamp-01", actionId, parameters, stateVersion });
  service.confirm({ callerToken, proposalId: proposal.proposalId, accepted: true });
  await service.authorize({ callerToken, proposalId: proposal.proposalId, evidence: { granted: true } });
  return proposal.proposalId;
}

// --- Authentication: an unauthenticated ("spoofed") caller never dispatches
{
  const { service, getCalls } = makeService();
  const good = service.describe({ callerToken: "good-token", objectId: "lamp-01" });
  assert.throws(() => service.describe({ callerToken: "bad-token", objectId: "lamp-01" }), { code: "UNAUTHENTICATED" });
  assert.throws(
    () => service.propose({ callerToken: "bad-token", objectId: "lamp-01", actionId: "turn_on", stateVersion: good.stateVersion }),
    { code: "UNAUTHENTICATED" }
  );

  const proposalId = await readyProposal(service);
  await assert.rejects(() => service.execute({ callerToken: "bad-token", proposalId, requestId: "r1" }), { code: "UNAUTHENTICATED" });
  assert.equal(getCalls(), 0, "an unauthenticated caller must never reach dispatch");
}

// --- A proposal belongs to the caller who created it, not any authenticated caller
{
  const { service } = makeService({ allowedCallers: new Set(["good-token", "other-token"]) });
  const { stateVersion } = service.describe({ callerToken: "good-token", objectId: "lamp-01" });
  const proposal = service.propose({ callerToken: "good-token", objectId: "lamp-01", actionId: "turn_on", stateVersion });
  assert.throws(() => service.confirm({ callerToken: "other-token", proposalId: proposal.proposalId, accepted: true }), { code: "FORBIDDEN" });
}

// --- Stale state version is rejected at propose(), not silently accepted
{
  const { service } = makeService();
  const { stateVersion } = service.describe({ callerToken: "good-token", objectId: "lamp-01" });
  assert.throws(
    () => service.propose({ callerToken: "good-token", objectId: "lamp-01", actionId: "turn_on", stateVersion: stateVersion + 1 }),
    { code: "STALE_STATE" }
  );
}

// --- Stale state version is ALSO rejected at execute() time, if state changed after the proposal was made
{
  const { service } = makeService();
  const proposalId = await readyProposal(service);
  // Simulate a second, independent state-changing dispatch happening out of band.
  const other = await readyProposal(service, "good-token", "turn_on", {});
  await service.execute({ callerToken: "good-token", proposalId: other, requestId: "bump-state" });
  await assert.rejects(() => service.execute({ callerToken: "good-token", proposalId, requestId: "r2" }), { code: "STALE_STATE" });
}

// --- Nested parameter validation reuses adapters/specs/index.js's validateParameters
{
  const { service } = makeService();
  const { stateVersion } = service.describe({ callerToken: "good-token", objectId: "lamp-01" });
  assert.throws(
    () => service.propose({ callerToken: "good-token", objectId: "lamp-01", actionId: "set_brightness", parameters: { value: 999 }, stateVersion }),
    /above maximum/
  );
}

// --- Happy path: propose -> confirm -> authorize -> execute -> succeeded, state version advances
{
  const { service, getCalls } = makeService();
  const before = service.describe({ callerToken: "good-token", objectId: "lamp-01" });
  const proposalId = await readyProposal(service);
  const result = await service.execute({ callerToken: "good-token", proposalId, requestId: "req-1" });
  assert.equal(result.status, OUTCOME.SUCCEEDED);
  assert.equal(getCalls(), 1);
  const after = service.describe({ callerToken: "good-token", objectId: "lamp-01" });
  assert.equal(after.stateVersion, before.stateVersion + 1, "a successful dispatch must advance the state version");
}

// --- Duplicate request id: replaying the same requestId does not dispatch twice
{
  const { service, getCalls } = makeService();
  const proposalId = await readyProposal(service);
  const first = await service.execute({ callerToken: "good-token", proposalId, requestId: "dup-1" });
  const second = await service.execute({ callerToken: "good-token", proposalId, requestId: "dup-1" });
  assert.equal(getCalls(), 1, "a repeated request id must not trigger a second dispatch");
  assert.deepEqual(first, second, "a replayed request id must return the original outcome");
}

// --- Authorization denial never dispatches
{
  const { service, getCalls } = makeService();
  const { stateVersion } = service.describe({ callerToken: "good-token", objectId: "lamp-01" });
  const proposal = service.propose({ callerToken: "good-token", objectId: "lamp-01", actionId: "turn_on", stateVersion });
  service.confirm({ callerToken: "good-token", proposalId: proposal.proposalId, accepted: true });
  const denied = await service.authorize({ callerToken: "good-token", proposalId: proposal.proposalId, evidence: { granted: false } });
  assert.equal(denied.status, "denied");
  await assert.rejects(
    () => service.execute({ callerToken: "good-token", proposalId: proposal.proposalId, requestId: "r3" }),
    { code: "UNKNOWN_PROPOSAL" }
  );
  assert.equal(getCalls(), 0);
}

// --- Cancellation before dispatch prevents any later confirm/execute on that proposal
{
  const { service } = makeService();
  const { stateVersion } = service.describe({ callerToken: "good-token", objectId: "lamp-01" });
  const proposal = service.propose({ callerToken: "good-token", objectId: "lamp-01", actionId: "turn_on", stateVersion });
  assert.equal(service.cancel({ callerToken: "good-token", proposalId: proposal.proposalId }).status, "cancelled");
  assert.throws(() => service.confirm({ callerToken: "good-token", proposalId: proposal.proposalId, accepted: true }), { code: "UNKNOWN_PROPOSAL" });
}

// --- Proposal expiry rejects confirm/authorize/execute, same shape as SpecsActionSession's client-side expiry
{
  const { service } = makeService();
  const { stateVersion } = service.describe({ callerToken: "good-token", objectId: "lamp-01" });
  const proposal = service.propose({ callerToken: "good-token", objectId: "lamp-01", actionId: "turn_on", stateVersion });
  clock += 10_000; // past proposalTtlMs
  assert.throws(() => service.confirm({ callerToken: "good-token", proposalId: proposal.proposalId, accepted: true }), { code: "PROPOSAL_EXPIRED" });
}

// --- A dispatch that exceeds dispatchTimeoutMs resolves as "unknown", not "failed" or "succeeded"
{
  const hangingExecutor = () => new Promise(() => {}); // never resolves
  const { service } = makeService({ executor: hangingExecutor, dispatchTimeoutMs: 20 });
  const proposalId = await readyProposal(service);
  const result = await service.execute({ callerToken: "good-token", proposalId, requestId: "timeout-1" });
  assert.equal(result.status, OUTCOME.UNKNOWN);
}

// --- An executor that throws resolves as "failed", and does not advance the state version
{
  const failingExecutor = async () => { throw new Error("device unreachable"); };
  const { service } = makeService({ executor: failingExecutor });
  const before = service.describe({ callerToken: "good-token", objectId: "lamp-01" });
  const proposalId = await readyProposal(service);
  const result = await service.execute({ callerToken: "good-token", proposalId, requestId: "fail-1" });
  assert.equal(result.status, OUTCOME.FAILED);
  const after = service.describe({ callerToken: "good-token", objectId: "lamp-01" });
  assert.equal(after.stateVersion, before.stateVersion, "a failed dispatch must not advance the state version");
}

// --- Unauthorized action id / device id are rejected the same way an unreviewed action would be (the graph IS the allowlist)
{
  const { service } = makeService();
  const { stateVersion } = service.describe({ callerToken: "good-token", objectId: "lamp-01" });
  assert.throws(() => service.propose({ callerToken: "good-token", objectId: "lamp-01", actionId: "delete_everything", stateVersion }));
  assert.throws(() => service.describe({ callerToken: "good-token", objectId: "unknown-device" }), { code: "UNKNOWN_DEVICE" });
}

// --- Constructor guards: no default-allow caller, no silently-permissive config
{
  assert.throws(() => new ExecutionService({ graph: buildGraph(), executor: async () => {}, allowedCallers: new Set() }));
  assert.throws(() => new ExecutionService({ graph: buildGraph(), executor: async () => {}, allowedCallers: null }));
  assert.throws(() => new ExecutionService({ graph: {}, executor: async () => {}, allowedCallers: new Set(["x"]) }));
}

// --- inspect(): resolved (not just declared) confirmation/authorization per action, and a structural blocked reason for an unsupported parameter schema
{
  const { service } = makeService();
  const { actions } = service.inspect({ callerToken: "good-token", objectId: "lamp-01" });
  const turnOn = actions.find((a) => a.id === "turn_on");
  assert.equal(turnOn.requiresConfirmation, false);
  assert.equal(turnOn.authorizationRequired, true);
  assert.equal(turnOn.blocked, false);
  assert.equal(turnOn.blockedReason, null);

  const calibrate = actions.find((a) => a.id === "calibrate");
  assert.equal(calibrate.blocked, true);
  assert.match(calibrate.blockedReason, /sensor/);
  assert.match(calibrate.blockedReason, /cannot be proposed/);

  assert.throws(() => service.inspect({ callerToken: "bad-token", objectId: "lamp-01" }), { code: "UNAUTHENTICATED" });
  assert.throws(() => service.inspect({ callerToken: "good-token", objectId: "unknown-device" }), { code: "UNKNOWN_DEVICE" });
}

// --- inspect() reflects the Access Profile's category-triggered confirmation floor, not just each action's own declared flag
// (turn_on declares confirmation: false, but its category ("lighting") is in this profile's confirmation_for list)
{
  const { service } = makeService({ profile: { interaction: { confirmation_for: ["lighting"] } } });
  const { actions } = service.inspect({ callerToken: "good-token", objectId: "lamp-01" });
  assert.equal(actions.find((a) => a.id === "turn_on").requiresConfirmation, true);
  assert.equal(actions.find((a) => a.id === "set_brightness").requiresConfirmation, false);
}

console.log("Execution service test passed (auth, staleness, dedup, timeout, expiry, denial, cancel, inspect)");
