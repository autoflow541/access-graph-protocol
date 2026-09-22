import assert from "node:assert/strict";
// Default-import + destructure, not named imports: node-wot ships CJS,
// and Node's static named-export detection for CJS packages is not
// reliable across every Node version/platform (this repo's CI failed on
// a named import that worked locally). A default import always works.
import nodeWotCore from "@node-wot/core";
import nodeWotHttp from "@node-wot/binding-http";
import { AccessGraph } from "../sdk/javascript/agp.js";
import { thingDescriptionToAgp } from "../adapters/wot/index.js";
import { ExecutionService } from "../service/execution-service.js";
import { createWotExecutor } from "../service/wot-executor.mjs";

const { Servient: ServerServient } = nodeWotCore;
const { Servient: ClientServient } = nodeWotCore;
const { HttpServer } = nodeWotHttp;
const { HttpClientFactory } = nodeWotHttp;

// A real node-wot Servient exposing a real Thing over real HTTP, on a
// fixed test-only port: this is the same thing service/virtual-thermostat.mjs
// does for manual use, kept small here for the automated suite. The point
// of this test is that nothing between ExecutionService and this Thing is
// mocked: a fake ConsumedThing would not have caught a real protocol
// mismatch the way this does.
const PORT = 18788;

const state = { level: 40 };
const serverServient = new ServerServient();
serverServient.addServer(new HttpServer({ port: PORT, address: "127.0.0.1", baseUri: `http://127.0.0.1:${PORT}` }));
const producingWoT = await serverServient.start();

const exposedThing = await producingWoT.produce({
  id: "urn:agp:test:lamp",
  title: "Test Lamp",
  security: "nosec_sc",
  securityDefinitions: { nosec_sc: { scheme: "nosec" } },
  properties: {
    level: { title: "Brightness level", type: "integer", minimum: 0, maximum: 100, "x-agp-risk": "low" }
  },
  actions: {
    flash: { title: "Flash", "x-agp-risk": "none", "x-agp-category": "device_control" }
  }
});
let flashCount = 0;
exposedThing.setPropertyReadHandler("level", async () => state.level);
exposedThing.setPropertyWriteHandler("level", async (value) => {
  const level = await value.value();
  if (typeof level !== "number" || level < 0 || level > 100) throw new Error("level must be 0-100");
  state.level = level;
});
exposedThing.setActionHandler("flash", async () => {
  flashCount += 1;
});
await exposedThing.expose();

const clientServient = new ClientServient();
clientServient.addClientFactory(new HttpClientFactory());
const consumingWoT = await clientServient.start();

const td = await consumingWoT.requestThingDescription(`http://127.0.0.1:${PORT}/test-lamp`);
const consumedThing = await consumingWoT.consume(td);

const object = thingDescriptionToAgp(td, { id: "lamp-01", propertyValues: { level: state.level } });
const graph = new AccessGraph([object]);
const service = new ExecutionService({
  graph,
  allowedCallers: new Set(["good-token"]),
  executor: createWotExecutor(graph, consumedThing)
});

async function ready(actionId, parameters) {
  const { stateVersion } = service.describe({ callerToken: "good-token", objectId: "lamp-01" });
  const proposal = service.propose({ callerToken: "good-token", objectId: "lamp-01", actionId, parameters, stateVersion });
  service.confirm({ callerToken: "good-token", proposalId: proposal.proposalId, accepted: true });
  if (proposal.status !== "ready") await service.authorize({ callerToken: "good-token", proposalId: proposal.proposalId, evidence: { granted: true } });
  return proposal.proposalId;
}

// --- Writing a property through ExecutionService really calls the real Thing's write handler over real HTTP
{
  const proposalId = await ready("write_level", { value: 77 });
  const result = await service.execute({ callerToken: "good-token", proposalId, requestId: "wot-write-1" });
  assert.equal(result.status, "succeeded");
  assert.equal(result.result.level, 77);
  // Independently verify against the Thing directly, not through ExecutionService's own report of success.
  const directRead = await fetch(`http://127.0.0.1:${PORT}/test-lamp/properties/level`).then((r) => r.json());
  assert.equal(directRead, 77, "the real Thing's own state must have actually changed");
  assert.equal(state.level, 77, "the exposed Thing's in-process state must match too");
}

// --- AGP's local graph mirror is refreshed from the real Thing after dispatch, not left stale
{
  const described = service.describe({ callerToken: "good-token", objectId: "lamp-01" });
  assert.equal(described.object.state.level, 77);
}

// --- Invoking an action through ExecutionService really calls the real Thing's action handler
{
  const before = flashCount;
  const proposalId = await ready("flash", {});
  const result = await service.execute({ callerToken: "good-token", proposalId, requestId: "wot-flash-1" });
  assert.equal(result.status, "succeeded");
  assert.equal(flashCount, before + 1, "the real Thing's action handler must have actually run");
}

// --- An out-of-range write never reaches the real Thing at all: AGP's own declared bounds reject it at propose() time
{
  const { stateVersion } = service.describe({ callerToken: "good-token", objectId: "lamp-01" });
  assert.throws(
    () => service.propose({ callerToken: "good-token", objectId: "lamp-01", actionId: "write_level", parameters: { value: 500 }, stateVersion }),
    /above maximum/
  );
  assert.equal(state.level, 77, "a proposal AGP itself rejected must never have reached the real Thing");
}

await serverServient.shutdown();
await clientServient.shutdown();

console.log("WoT executor test passed (real node-wot Servient, real HTTP, no mocks: property write, action invoke, state resync, rejected write)");
