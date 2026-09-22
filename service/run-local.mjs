#!/usr/bin/env node
// Boots a real, listening ExecutionService instance for manual testing:
// e.g. `npm run service:dev`, then curl it. Uses the same simulated
// thermostat Thing Description as examples/smart-device/app.js and
// examples/specs/lens-project/Assets/Scripts/AgpDeviceSource.ts, so
// there's one canonical "first connected device" fixture, not a third
// copy. The device stays simulated: this script does not connect to a
// real Thing, matching NEXT.md ("Keep device invocation simulated until
// service checks are independently tested").
import { AccessGraph } from "../sdk/javascript/agp.js";
import { thingDescriptionToAgp } from "../adapters/wot/index.js";
import { ExecutionService } from "./execution-service.js";
import { createExecutionHttpServer } from "./http-server.js";

const thermostatTd = {
  "@context": "https://www.w3.org/2022/wot/td/v1.1",
  "@type": "Thermostat",
  id: "urn:agp:demo:hall-thermostat",
  title: "Hall thermostat",
  description: "A simulated smart thermostat exposed through a WoT Thing Description.",
  security: "oauth2_sc",
  securityDefinitions: { oauth2_sc: { scheme: "oauth2" } },
  // A real thermostat like this has a touchscreen and voice control, and
  // reports back via its display and a chime -- declared here as an
  // x-agp-inputs/outputs extension so ExecutionService.inspect() and the
  // client's capability negotiation demo have something real to compare
  // against (see negotiateCapabilities(), sdk/javascript/agp.js).
  "x-agp-inputs": ["touch", "voice"],
  "x-agp-outputs": ["visual", "audio"],
  properties: {
    temperature: { title: "Room temperature", type: "number", unit: "celsius", readOnly: true },
    targetTemperature: { title: "Target temperature", type: "number", unit: "celsius", minimum: 16, maximum: 28 }
  },
  actions: {
    ecoMode: { title: "Turn on eco mode", "x-agp-risk": "low", "x-agp-confirmation": false, "x-agp-category": "device_control" },
    emergencyShutdown: { title: "Emergency shutdown", "x-agp-risk": "critical", "x-agp-confirmation": true, "x-agp-category": "physical_safety" }
  },
  events: { overheating: { title: "Overheating", "x-agp-priority": "critical" } }
};

const values = { temperature: 20.4, targetTemperature: 21 };
const object = thingDescriptionToAgp(thermostatTd, { id: "hall-thermostat", propertyValues: values });
const graph = new AccessGraph([object]);

const profile = {
  agp_profile: "0.1",
  interaction: { confirmation_for: ["device_control", "physical_safety"] }
};

const service = new ExecutionService({
  graph,
  profile,
  allowedCallers: new Set([process.env.AGP_DEV_TOKEN || "dev-token"]),
  executor: async (_objectId, actionId, parameters) => {
    if (actionId === "write_targettemperature") {
      values.targetTemperature = Number(parameters.value);
      graph.updateState(object.id, { targetTemperature: values.targetTemperature });
    } else if (actionId === "ecomode") {
      graph.updateState(object.id, { mode: "eco" });
    } else if (actionId === "emergencyshutdown") {
      graph.updateState(object.id, { mode: "off" });
    }
    return graph.get(object.id).state;
  }
});

const server = createExecutionHttpServer(service);
const port = Number(process.env.PORT) || 8787;
server.listen(port, () => {
  const token = process.env.AGP_DEV_TOKEN || "dev-token";
  console.log(`AGP execution service listening on http://localhost:${port}`);
  console.log(`Caller token: ${token} (set AGP_DEV_TOKEN to change it)`);
  console.log(`Try: curl -H "Authorization: Bearer ${token}" http://localhost:${port}/devices/hall-thermostat`);
});
