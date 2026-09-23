#!/usr/bin/env node
// Boots the web-vision capability (adapters/web-vision/) behind the same
// ExecutionService/HTTP layer every other device in this repo uses.
// Deliberately reuses service/vision-executor.mjs unmodified: the same
// executor that dispatches adapters/vision-assistant/'s camera actions
// dispatches these, driven by each action's metadata.describerMode, not
// by anything specific to this adapter.
import { AccessGraph } from "../sdk/javascript/agp.js";
import { createWebPageObject } from "../adapters/web-vision/index.js";
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

const object = createWebPageObject({ id: "current-tab" });
const graph = new AccessGraph([object]);

const token = resolveDevToken();
const service = new ExecutionService({
  graph,
  allowedCallers: new Set([token]),
  executor: createVisionExecutor(graph, describer)
});

const server = createExecutionHttpServer(service, { corsOrigin: "*" });
const port = Number(process.env.PORT) || 8793;
server.listen(port, "127.0.0.1", () => {
  console.log(`AGP web-vision service listening on http://127.0.0.1:${port} (localhost only)`);
  console.log(`Describer: ${describerLabel}`);
  console.log(`Caller token: ${token} (set AGP_DEV_TOKEN to pin it)`);
  console.log(`Try: curl -H "Authorization: Bearer ${token}" http://127.0.0.1:${port}/devices/current-tab`);
});
