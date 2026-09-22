#!/usr/bin/env node
// Boots the pdf-remediation capability (adapters/pdf-remediation/)
// behind the same ExecutionService/HTTP layer every other device in
// this repo uses, dispatching to Auto-Flow's already-deployed PDF
// remediation service (pdf.auto-flow.co by default; set
// AGP_PDF_SERVICE_URL to point at a different instance).
import { AccessGraph } from "../sdk/javascript/agp.js";
import { createPdfDocumentObject } from "../adapters/pdf-remediation/index.js";
import { createPdfExecutor } from "./pdf-executor.mjs";
import { ExecutionService } from "./execution-service.js";
import { createExecutionHttpServer } from "./http-server.js";

const object = createPdfDocumentObject({ id: "uploaded-document" });
const graph = new AccessGraph([object]);

const service = new ExecutionService({
  graph,
  profile: { agp_profile: "0.1", interaction: { confirmation_for: ["document_processing"] } },
  allowedCallers: new Set([process.env.AGP_DEV_TOKEN || "dev-token"]),
  executor: createPdfExecutor(),
  // remediate makes a real AI call (visual review) on top of the
  // structural rewrite; the default 10s dispatchTimeoutMs is tuned for a
  // device property write, not this. A real deployment should size this
  // per action, not repo-wide; this service only has one kind of action.
  dispatchTimeoutMs: Number(process.env.AGP_DISPATCH_TIMEOUT_MS) || 60_000
});

const server = createExecutionHttpServer(service, { corsOrigin: "*" });
const port = Number(process.env.PORT) || 8792;
server.listen(port, () => {
  const token = process.env.AGP_DEV_TOKEN || "dev-token";
  const backend = process.env.AGP_PDF_SERVICE_URL || "https://pdf.auto-flow.co";
  console.log(`AGP pdf-remediation service listening on http://localhost:${port}`);
  console.log(`Dispatching to: ${backend}`);
  console.log(`Caller token: ${token} (set AGP_DEV_TOKEN to change it)`);
  console.log(`Try: curl -H "Authorization: Bearer ${token}" http://localhost:${port}/devices/uploaded-document`);
});
