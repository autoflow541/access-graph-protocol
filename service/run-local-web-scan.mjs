#!/usr/bin/env node
// Boots the web-scan capability (adapters/web-scan/) behind the same
// ExecutionService/HTTP layer every other device in this repo uses,
// dispatching to Auto-Flow's already-deployed scan service
// (scan.auto-flow.co by default; set AGP_SCAN_SERVICE_URL to point at a
// different instance).
import { AccessGraph } from "../sdk/javascript/agp.js";
import { createWebsiteObject } from "../adapters/web-scan/index.js";
import { createWebScanExecutor } from "./web-scan-executor.mjs";
import { ExecutionService } from "./execution-service.js";
import { createExecutionHttpServer } from "./http-server.js";

const object = createWebsiteObject({ id: "scanned-site" });
const graph = new AccessGraph([object]);

const service = new ExecutionService({
  graph,
  allowedCallers: new Set([process.env.AGP_DEV_TOKEN || "dev-token"]),
  executor: createWebScanExecutor(),
  // A real scan renders the page with a headless browser before axe-core
  // even runs: observed ~10s against a trivial page, so the default 10s
  // dispatchTimeoutMs (tuned for a device property write) is too tight
  // here, same finding as service/run-local-pdf.mjs.
  dispatchTimeoutMs: Number(process.env.AGP_DISPATCH_TIMEOUT_MS) || 60_000
});

const server = createExecutionHttpServer(service, { corsOrigin: "*" });
const port = Number(process.env.PORT) || 8794;
server.listen(port, () => {
  const token = process.env.AGP_DEV_TOKEN || "dev-token";
  const backend = process.env.AGP_SCAN_SERVICE_URL || "https://scan.auto-flow.co";
  console.log(`AGP web-scan service listening on http://localhost:${port}`);
  console.log(`Dispatching to: ${backend}`);
  console.log(`Caller token: ${token} (set AGP_DEV_TOKEN to change it)`);
  console.log(`Try: curl -H "Authorization: Bearer ${token}" http://localhost:${port}/devices/scanned-site`);
});
