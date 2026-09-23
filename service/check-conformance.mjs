#!/usr/bin/env node
// The actual deliverable docs/audit-2026-09-22.md item 5 asks for: run
// service/scenario-runner.mjs's fault-injection suite against a real
// ExecutionService and print the machine-readable pass/fail report.
// Reuses the exact same simulated thermostat fixture as
// service/run-local.mjs (in-process, not over HTTP: the scenario runner
// operates on an ExecutionService instance directly). Exits non-zero if
// anything failed, so this is scriptable in CI later, though it is not
// wired into one yet: see NEXT.md.
//
// This is implementation testing of this repo's own fault handling, not
// an accessibility certification of the underlying device -- the same
// caveat the audit item itself states.
import { AccessGraph } from "../sdk/javascript/agp.js";
import { thingDescriptionToAgp } from "../adapters/wot/index.js";
import { ExecutionService } from "./execution-service.js";
import { runScenarios } from "./scenario-runner.mjs";

const thermostatTd = {
  "@context": "https://www.w3.org/2022/wot/td/v1.1",
  "@type": "Thermostat",
  id: "urn:agp:demo:hall-thermostat",
  title: "Hall thermostat",
  security: "oauth2_sc",
  securityDefinitions: { oauth2_sc: { scheme: "oauth2" } },
  properties: {
    temperature: { title: "Room temperature", type: "number", unit: "celsius", readOnly: true },
    targetTemperature: { title: "Target temperature", type: "number", unit: "celsius", minimum: 16, maximum: 28 }
  },
  actions: {
    ecoMode: { title: "Turn on eco mode", "x-agp-risk": "low", "x-agp-confirmation": false, "x-agp-category": "device_control" }
  }
};

const object = thingDescriptionToAgp(thermostatTd, {
  id: "hall-thermostat",
  propertyValues: { temperature: 20.4, targetTemperature: 21 }
});
const graph = new AccessGraph([object]);
const profile = { agp_profile: "0.1", interaction: { confirmation_for: ["device_control"] } };
const token = "conformance-check-token";

const service = new ExecutionService({
  graph,
  profile,
  allowedCallers: new Set([token]),
  executor: async (_objectId, actionId, parameters) => {
    if (actionId === "write_targettemperature") {
      graph.updateState(object.id, { targetTemperature: Number(parameters.value) });
    }
    return graph.get(object.id).state;
  }
});

async function buildHangingService() {
  const hangGraph = new AccessGraph([object]);
  const hangService = new ExecutionService({
    graph: hangGraph,
    profile,
    allowedCallers: new Set([token]),
    executor: () => new Promise(() => {}), // never resolves
    dispatchTimeoutMs: 50
  });
  return {
    service: hangService,
    callerToken: token,
    objectId: "hall-thermostat",
    actionId: "write_targettemperature",
    parameters: { value: 22 }
  };
}

const report = await runScenarios({
  service,
  callerToken: token,
  objectId: "hall-thermostat",
  actionId: "write_targettemperature",
  parameters: { value: 22 },
  badParameters: { value: 999 }, // above the declared maximum (28)
  buildHangingService
});

console.log(JSON.stringify(report, null, 2));
console.error(`\n${report.summary.pass} passed, ${report.summary.fail} failed, ${report.summary.skipped} skipped.`);
if (report.summary.fail > 0) process.exit(1);
