import assert from "node:assert/strict";
import { AccessGraph } from "../sdk/javascript/agp.js";
import { ExecutionService } from "../service/execution-service.js";
import { runScenarios } from "../service/scenario-runner.mjs";

function buildGraph() {
  return new AccessGraph([
    {
      id: "lamp-01",
      role: "light",
      label: "Lamp",
      state: { on: false },
      actions: [
        { id: "turn_on", label: "Turn on", risk: "low", confirmation: false, authorization: { required: true } },
        {
          id: "set_brightness",
          label: "Set brightness",
          risk: "low",
          confirmation: false,
          authorization: { required: true },
          parameters: { value: { type: "integer", minimum: 0, maximum: 100, required: true } }
        }
      ]
    }
  ]);
}

function makeService(overrides = {}) {
  return new ExecutionService({
    graph: buildGraph(),
    executor: async (_objectId, actionId, parameters) => ({ actionId, parameters }),
    allowedCallers: new Set(["good-token"]),
    proposalTtlMs: 5000,
    dispatchTimeoutMs: 200,
    requestRetentionMs: 5000,
    ...overrides
  });
}

// --- Against the standard fixture: every forceable scenario passes, the timeout scenario is honestly reported "skipped" when no hanging service is supplied
{
  const service = makeService();
  const report = await runScenarios({
    service,
    callerToken: "good-token",
    objectId: "lamp-01",
    actionId: "turn_on",
    parameters: {}
  });

  const byName = Object.fromEntries(report.results.map((r) => [r.scenario, r]));
  assert.equal(byName.authorization_denial.status, "pass");
  assert.equal(byName.stale_state_at_execute.status, "pass");
  assert.equal(byName.duplicate_request_replay.status, "pass");
  assert.equal(byName.malformed_schema_rejected.status, "skipped", "no badParameters supplied for an action with no parameters");
  assert.equal(byName.dispatch_timeout.status, "skipped", "no buildHangingService supplied");
  assert.equal(report.summary.pass, 3);
  assert.equal(report.summary.skipped, 2);
  assert.equal(report.summary.fail, 0);
}

// --- malformed_schema_rejected actually exercises real, invalid parameters against a real parameterized action
{
  const service = makeService();
  const report = await runScenarios({
    service,
    callerToken: "good-token",
    objectId: "lamp-01",
    actionId: "set_brightness",
    parameters: { value: 50 },
    badParameters: { value: 999 } // above the declared maximum
  });
  const scenario = report.results.find((r) => r.scenario === "malformed_schema_rejected");
  assert.equal(scenario.status, "pass");
}

// --- dispatch_timeout actually exercises a real hung dispatch when a hanging service is supplied
{
  const service = makeService();
  const report = await runScenarios({
    service,
    callerToken: "good-token",
    objectId: "lamp-01",
    actionId: "turn_on",
    parameters: {},
    buildHangingService: async () => ({
      service: makeService({ executor: () => new Promise(() => {}), dispatchTimeoutMs: 20 }),
      callerToken: "good-token",
      objectId: "lamp-01",
      actionId: "turn_on",
      parameters: {}
    })
  });
  const scenario = report.results.find((r) => r.scenario === "dispatch_timeout");
  assert.equal(scenario.status, "pass");
}

// --- A genuinely broken ExecutionService (denial does not actually block execute()) is honestly reported "fail," not silently passed
{
  const brokenService = makeService();
  const realExecute = brokenService.execute.bind(brokenService);
  brokenService.execute = async (args) => {
    // Simulate a bug: execute() ignores that the proposal was never authorized/was denied.
    try {
      return await realExecute(args);
    } catch {
      return { status: "succeeded", proposalId: args.proposalId, result: {} };
    }
  };
  const report = await runScenarios({
    service: brokenService,
    callerToken: "good-token",
    objectId: "lamp-01",
    actionId: "turn_on",
    parameters: {}
  });
  const scenario = report.results.find((r) => r.scenario === "authorization_denial");
  assert.equal(scenario.status, "fail", "the runner must not report a pass when a denied proposal was actually executable");
}

console.log("Scenario runner test passed (denial, staleness, replay, malformed-schema, and timeout fault injection; honestly reports skipped vs failed vs passed)");
