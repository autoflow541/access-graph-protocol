import assert from "node:assert/strict";
import { AccessGraph } from "../sdk/javascript/agp.js";
import { createPdfDocumentObject } from "../adapters/pdf-remediation/index.js";
import { createPdfExecutor } from "../service/pdf-executor.mjs";
import { ExecutionService } from "../service/execution-service.js";

// This suite stubs global.fetch rather than calling the real, live
// pdf.auto-flow.co service: that service makes real, billed Anthropic
// API calls on /remediate, which has no place running on every `npm
// test`. The real backend WAS exercised manually end to end (see
// CHANGELOG.md): propose -> confirm -> execute over real HTTP, a real
// AI-reviewed remediated PDF written to disk and confirmed as a valid
// PDF file, `conformance.compliant` true, real aiCost reported. This
// suite verifies the request/response plumbing and the AGP-level policy
// (confirmation gating, parameter validation), not the backend itself.

// --- The object is well-formed: check_accessibility/analyze are informational, remediate is gated
{
  const object = createPdfDocumentObject({ id: "doc-1" });
  const byId = Object.fromEntries(object.actions.map((a) => [a.id, a]));
  assert.equal(byId.check_accessibility.risk, "none");
  assert.equal(byId.check_accessibility.confirmation, false);
  assert.equal(byId.analyze.risk, "none");
  assert.equal(byId.analyze.confirmation, false);
  assert.equal(byId.remediate.risk, "low");
  assert.equal(byId.remediate.confirmation, true);
  assert.equal(byId.remediate.parameters.manifest.additionalProperties, true, "the manifest parameter must accept its real, variable shape");
}

assert.throws(() => createPdfDocumentObject({}));

// --- The executor builds the right multipart request per action and parses the response correctly
{
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url, hasBody: Boolean(init?.body) });
    if (url.endsWith("/validate")) return jsonResponse({ compliant: false, failures: [{ rule: "x" }] });
    if (url.endsWith("/autotag")) return jsonResponse({ source: { nodeCount: 2 }, nodes: [] });
    if (url.endsWith("/remediate")) {
      return new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), {
        status: 200,
        headers: { "X-Conformance": JSON.stringify({ compliant: true, aiCost: { costUsd: 0.01 } }) }
      });
    }
    throw new Error(`Unexpected URL in test: ${url}`);
  };

  const realFetch = globalThis.fetch;
  globalThis.fetch = fakeFetch;
  try {
    const executor = createPdfExecutor({ baseUrl: "https://pdf.example.test" });
    const fakePdf = Buffer.from("fake-pdf-bytes").toString("base64");

    const validated = await executor("doc-1", "check_accessibility", { pdf: fakePdf, flavour: "ua1" });
    assert.equal(validated.compliant, false);

    const analyzed = await executor("doc-1", "analyze", { pdf: fakePdf });
    assert.equal(analyzed.source.nodeCount, 2);

    const remediated = await executor("doc-1", "remediate", { pdf: fakePdf, manifest: analyzed });
    assert.equal(remediated.conformance.compliant, true);
    assert.equal(remediated.conformance.aiCost.costUsd, 0.01);
    assert.equal(Buffer.from(remediated.pdf, "base64").toString("utf8"), "%PDF");

    assert.equal(calls.length, 3);
    assert.ok(calls.every((c) => c.hasBody), "every call must send the file as a multipart body");

    await assert.rejects(() => executor("doc-1", "remediate", { pdf: fakePdf }), /requires a manifest/);
    await assert.rejects(() => executor("doc-1", "check_accessibility", {}), /requires a pdf/);
    await assert.rejects(() => executor("doc-1", "unknown_action", { pdf: fakePdf }), /Unsupported pdf-remediation action/);
  } finally {
    globalThis.fetch = realFetch;
  }
}

// --- End to end through the real ExecutionService (fetch still stubbed): remediate requires confirmation, the informational actions don't
{
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (url.endsWith("/validate")) return jsonResponse({ compliant: true, failures: [] });
    if (url.endsWith("/remediate")) {
      return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "X-Conformance": JSON.stringify({ compliant: true }) } });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  try {
    const object = createPdfDocumentObject({ id: "doc-1" });
    const graph = new AccessGraph([object]);
    const service = new ExecutionService({
      graph,
      profile: { interaction: { confirmation_for: ["document_processing"] } },
      allowedCallers: new Set(["good-token"]),
      executor: createPdfExecutor({ baseUrl: "https://pdf.example.test" })
    });
    const fakePdf = Buffer.from("x").toString("base64");

    const { stateVersion: v1 } = service.describe({ callerToken: "good-token", objectId: "doc-1" });
    const checkProposal = service.propose({ callerToken: "good-token", objectId: "doc-1", actionId: "check_accessibility", parameters: { pdf: fakePdf }, stateVersion: v1 });
    assert.equal(checkProposal.status, "ready", "an informational action must never require confirmation");

    const { stateVersion: v2 } = service.describe({ callerToken: "good-token", objectId: "doc-1" });
    const remediateProposal = service.propose({ callerToken: "good-token", objectId: "doc-1", actionId: "remediate", parameters: { pdf: fakePdf, manifest: { title: "x" } }, stateVersion: v2 });
    assert.equal(remediateProposal.status, "confirmation_required", "an AI-judgment action that produces a new document must require confirmation");
  } finally {
    globalThis.fetch = realFetch;
  }
}

function jsonResponse(body) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

console.log("PDF remediation test passed (object shape, executor request/response plumbing, confirmation gating; real backend verified manually, see CHANGELOG.md)");
