#!/usr/bin/env node
// Boots the vision-assistant capability (adapters/vision-assistant/)
// behind the same ExecutionService/HTTP layer every other device in this
// repo uses: proof that AGP's execution model was never IoT-specific.
// The describer is pluggable and defaults to a clearly-labeled
// simulation; set ANTHROPIC_API_KEY to use a real one instead (billed
// API calls, see service/describers/anthropic-describer.mjs).
import { AccessGraph } from "../sdk/javascript/agp.js";
import { createVisionAssistantObject } from "../adapters/vision-assistant/index.js";
import { createVisionExecutor } from "./vision-executor.mjs";
import { simulatedDescriber } from "./describers/simulated-describer.mjs";
import { ExecutionService } from "./execution-service.js";
import { createExecutionHttpServer } from "./http-server.js";
import { resolveDevToken } from "./dev-token.mjs";

let describer = simulatedDescriber;
let describerLabel = "simulated (set ANTHROPIC_API_KEY for a real one)";
if (process.env.ANTHROPIC_API_KEY) {
  const { createAnthropicDescriber } = await import("./describers/anthropic-describer.mjs");
  describer = createAnthropicDescriber();
  describerLabel = `real, Anthropic API, model ${process.env.ANTHROPIC_MODEL || "claude-sonnet-5"} (billed calls)`;
}

const object = createVisionAssistantObject({ id: "front-camera", label: "Front Camera" });
const graph = new AccessGraph([object]);

const token = resolveDevToken();
const service = new ExecutionService({
  graph,
  allowedCallers: new Set([token]),
  executor: createVisionExecutor(graph, describer)
});

const server = createExecutionHttpServer(service, { corsOrigin: "*" });
const port = Number(process.env.PORT) || 8791;
server.listen(port, "127.0.0.1", () => {
  console.log(`AGP vision-assistant service listening on http://127.0.0.1:${port} (localhost only)`);
  console.log(`Describer: ${describerLabel}`);
  console.log(`Caller token: ${token} (set AGP_DEV_TOKEN to pin it)`);
  console.log(`Try: curl -H "Authorization: Bearer ${token}" http://127.0.0.1:${port}/devices/front-camera`);
});
