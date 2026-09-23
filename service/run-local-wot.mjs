#!/usr/bin/env node
// The real-node-wot counterpart to run-local.mjs: same execution service,
// same thermostat shape, but the device is a separate process reached
// only over real WoT HTTP calls (service/virtual-thermostat.mjs), not a
// JS object literal this file can just mutate. Start the Thing first:
//   npm run thing:dev
// then this:
//   npm run service:dev:wot
//
// adapters/wot/index.js is completely unmodified for this path: it
// converts whatever Thing Description it's given, whether that TD is a
// literal object (run-local.mjs) or, as here, fetched live from a
// running WoT server. That's the point: the adapter was never
// simulation-specific to begin with.
// Default-import + destructure, not named imports: see
// service/virtual-thermostat.mjs's comment on why a named import from
// this CJS package is not reliable across Node versions/platforms.
import nodeWotCore from "@node-wot/core";
import nodeWotHttp from "@node-wot/binding-http";
import { AccessGraph } from "../sdk/javascript/agp.js";
import { thingDescriptionToAgp } from "../adapters/wot/index.js";
import { ExecutionService } from "./execution-service.js";
import { createExecutionHttpServer } from "./http-server.js";
import { createWotExecutor } from "./wot-executor.mjs";
import { resolveDevToken } from "./dev-token.mjs";

const { Servient } = nodeWotCore;
const { HttpClientFactory } = nodeWotHttp;

const thingUrl = process.env.AGP_THING_URL || "http://127.0.0.1:8788/hall-thermostat";

const servient = new Servient();
servient.addClientFactory(new HttpClientFactory());
const WoT = await servient.start();

let td;
try {
  td = await WoT.requestThingDescription(thingUrl);
} catch (error) {
  console.error(`Could not fetch a Thing Description from ${thingUrl}.`);
  console.error(`Is the virtual thing running? Try: npm run thing:dev`);
  console.error(String(error?.message ?? error));
  process.exit(1);
}
const thing = await WoT.consume(td);

// Seed AGP's mirror with the Thing's actual current values (not guessed
// defaults) before the graph is ever served to a caller.
const propertyNames = Object.keys(td.properties ?? {});
const propertyValues = {};
for (const name of propertyNames) {
  propertyValues[name] = await thing.readProperty(name).then((output) => output.value());
}

const object = thingDescriptionToAgp(td, { id: "hall-thermostat", propertyValues });
const graph = new AccessGraph([object]);

const profile = {
  agp_profile: "0.1",
  interaction: { confirmation_for: ["device_control", "physical_safety"] }
};

const token = resolveDevToken();
const service = new ExecutionService({
  graph,
  profile,
  allowedCallers: new Set([token]),
  executor: createWotExecutor(graph, thing)
});

const server = createExecutionHttpServer(service);
const port = Number(process.env.PORT) || 8790;
// Bound to loopback only: a dev server with no auth on the network
// layer itself (auth is ExecutionService's job, not TCP's) has no
// business being reachable from anything but this machine.
server.listen(port, "127.0.0.1", () => {
  console.log(`AGP execution service (real node-wot backend) listening on http://127.0.0.1:${port} (localhost only)`);
  console.log(`Dispatching through the real Thing at ${thingUrl}`);
  console.log(`Caller token: ${token} (set AGP_DEV_TOKEN to pin it)`);
  console.log(`Try: curl -H "Authorization: Bearer ${token}" http://127.0.0.1:${port}/devices/hall-thermostat`);
});
