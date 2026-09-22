import assert from "node:assert/strict";
import { AccessGraph } from "../sdk/javascript/agp.js";
import { createWebsiteObject } from "../adapters/web-scan/index.js";
import { createWebScanExecutor } from "../service/web-scan-executor.mjs";
import { ExecutionService } from "../service/execution-service.js";

// This suite stubs global.fetch rather than calling the real, live
// scan.auto-flow.co service on every `npm test`. The real backend WAS
// exercised manually (see CHANGELOG.md): a real scan of a real URL,
// through the full propose/execute lifecycle, real score/issues/passes
// counts, ~10s render time observed (the reason
// service/run-local-web-scan.mjs raises dispatchTimeoutMs).

// --- The object is well-formed: one informational, no-confirmation action, honestly labeled as a structured audit, not an AI guess
{
  const object = createWebsiteObject({ id: "site-1" });
  assert.equal(object.actions.length, 1);
  const action = object.actions[0];
  assert.equal(action.risk, "none");
  assert.equal(action.confirmation, false);
  assert.equal(action.parameters.url.required, true);
  assert.equal(object.source.type, "structured_api");
}

assert.throws(() => createWebsiteObject({}));

// --- The executor sends a plain JSON {url} body (no file encoding needed) and returns the scan result as-is
{
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ score: 87, issues: [{ id: "color-contrast" }], passes: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };
  try {
    const executor = createWebScanExecutor({ baseUrl: "https://scan.example.test" });
    const result = await executor("site-1", "check_accessibility", { url: "https://example.com" });
    assert.equal(result.score, 87);
    assert.equal(result.issues.length, 1);
    assert.deepEqual(calls, [{ url: "https://scan.example.test/scan", body: { url: "https://example.com" } }]);

    await assert.rejects(() => executor("site-1", "check_accessibility", {}), /requires a url/);
    await assert.rejects(() => executor("site-1", "unknown_action", { url: "https://example.com" }), /Unsupported web-scan action/);
  } finally {
    globalThis.fetch = realFetch;
  }
}

// --- End to end through the real ExecutionService: risk:none/no-confirmation means propose() is immediately "ready"
{
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ score: 100, issues: [], passes: [{ id: "document-title" }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  try {
    const object = createWebsiteObject({ id: "site-1" });
    const graph = new AccessGraph([object]);
    const service = new ExecutionService({
      graph,
      allowedCallers: new Set(["good-token"]),
      executor: createWebScanExecutor({ baseUrl: "https://scan.example.test" })
    });

    const { stateVersion } = service.describe({ callerToken: "good-token", objectId: "site-1" });
    const proposal = service.propose({
      callerToken: "good-token", objectId: "site-1", actionId: "check_accessibility",
      parameters: { url: "https://example.com" }, stateVersion
    });
    assert.equal(proposal.status, "ready", "an informational audit action must never require confirmation");

    const result = await service.execute({ callerToken: "good-token", proposalId: proposal.proposalId, requestId: "web-scan-e2e-1" });
    assert.equal(result.status, "succeeded");
    assert.equal(result.result.score, 100);
  } finally {
    globalThis.fetch = realFetch;
  }
}

console.log("Web scan test passed (object shape, executor request/response plumbing, zero-friction lifecycle; real backend verified manually, see CHANGELOG.md)");
