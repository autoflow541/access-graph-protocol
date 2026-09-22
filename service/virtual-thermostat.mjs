#!/usr/bin/env node
// A real Web of Things device, reachable only over the network like any
// other WoT Thing: this process's internal state (`state`, below) is
// private to it. `service/run-local-wot.mjs` never touches it directly --
// it only ever sees what this Thing publishes through node-wot's real
// HTTP binding (a fetched Thing Description) and real Scripting API calls
// (readProperty/writeProperty/invokeAction over the network). That is the
// actual thing "real device" means here: still a simulated thermostat
// (there's no physical hardware behind it), but no longer a JS object
// literal another process can just import and mutate -- the two
// processes only ever communicate the way a real WoT client and a real
// WoT device would, which is what ADR-0001 point 4
// (docs/adr-0001-wot-reuse.md) asked node-wot to make possible.
//
// Same x-agp-* vocabulary as service/run-local.mjs's literal TD, so
// adapters/wot/index.js (unmodified) converts this exactly the same way.
import { Servient } from "@node-wot/core";
import { HttpServer } from "@node-wot/binding-http";

const port = Number(process.env.AGP_THING_PORT) || 8788;
const address = process.env.AGP_THING_ADDRESS || "127.0.0.1";

const state = { temperature: 20.4, targetTemperature: 21, mode: "on" };

const servient = new Servient();
// `baseUri` pins every advertised form to this one address instead of
// node-wot's default of enumerating every local network interface
// (link-local IPv6, LAN IP, etc.) -- this process only ever needs to be
// reachable from run-local-wot.mjs on the same machine.
servient.addServer(new HttpServer({ port, address, baseUri: `http://${address}:${port}` }));
const WoT = await servient.start();

const thing = await WoT.produce({
  id: "urn:agp:demo:hall-thermostat",
  title: "Hall thermostat",
  description: "A real WoT Thing (simulated hardware, real node-wot HTTP binding).",
  security: "nosec_sc",
  securityDefinitions: { nosec_sc: { scheme: "nosec" } },
  "x-agp-inputs": ["touch", "voice"],
  "x-agp-outputs": ["visual", "audio"],
  properties: {
    temperature: {
      title: "Room temperature",
      type: "number",
      unit: "celsius",
      readOnly: true,
      "x-agp-risk": "none"
    },
    targetTemperature: {
      title: "Target temperature",
      type: "number",
      unit: "celsius",
      minimum: 16,
      maximum: 28,
      "x-agp-risk": "medium",
      "x-agp-confirmation": true,
      "x-agp-category": "device_control"
    }
  },
  actions: {
    ecoMode: {
      title: "Turn on eco mode",
      "x-agp-risk": "low",
      "x-agp-confirmation": false,
      "x-agp-category": "device_control"
    },
    emergencyShutdown: {
      title: "Emergency shutdown",
      "x-agp-risk": "critical",
      "x-agp-confirmation": true,
      "x-agp-category": "physical_safety"
    }
  },
  events: {
    overheating: { title: "Overheating", "x-agp-priority": "critical" }
  }
});

thing.setPropertyReadHandler("temperature", async () => state.temperature);
thing.setPropertyReadHandler("targetTemperature", async () => state.targetTemperature);
thing.setPropertyWriteHandler("targetTemperature", async (value) => {
  const target = await value.value();
  if (typeof target !== "number" || target < 16 || target > 28) {
    throw new Error("targetTemperature must be a number between 16 and 28");
  }
  state.targetTemperature = target;
});
thing.setActionHandler("ecoMode", async () => {
  state.mode = "eco";
  return undefined;
});
thing.setActionHandler("emergencyShutdown", async () => {
  state.mode = "off";
  return undefined;
});

await thing.expose();
console.log(`Virtual WoT thermostat exposed at http://${address}:${port}/hall-thermostat`);
console.log(`Thing Description: http://${address}:${port}/hall-thermostat`);
