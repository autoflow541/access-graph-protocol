// Models a website, and Auto-Flow's already-deployed WCAG scanner
// (scan.auto-flow.co, Playwright + axe-core), as an AGP object: a sixth
// media type, and the second (after adapters/pdf-remediation/) backed by
// real production infrastructure. Unlike adapters/web-vision/ (an AI
// vision model describing a screenshot regardless of markup quality),
// this is a deterministic, rule-based audit: axe-core against the
// rendered DOM, not a judgment call. `source.type` reflects that
// honestly ("structured_api", not "ai_inference") even though the real
// service's response also carries an AI-generated review alongside the
// rule results.
//
// One action, because that's what this service actually does: audit,
// not fix. adapters/pdf-remediation/ has a remediate step because its
// backend has one; this backend doesn't, so this adapter doesn't invent
// one either.
import { AGP_VERSION } from "../../sdk/javascript/agp.js";

export function createWebsiteObject({ id, label = "Website" } = {}) {
  if (!id) throw new Error("createWebsiteObject requires an id");
  return {
    agp: AGP_VERSION,
    id,
    role: "website",
    label,
    description:
      "Scans a URL for WCAG 2.2 issues using Auto-Flow's already-deployed scanner (Playwright + axe-core): a rule-based audit, not an AI guess, of a page the scanner fetches and renders itself.",
    state: {},
    actions: [
      {
        id: "check_accessibility",
        label: "Scan for accessibility issues",
        risk: "none",
        confirmation: false,
        category: "information",
        parameters: {
          url: { type: "string", description: "The page to scan.", required: true }
        },
        authorization: { required: false }
      }
    ],
    inputs: [],
    outputs: ["text"],
    source: { type: "structured_api", confidence: 1, adapter: "web-scan-0.1" },
    metadata: {
      privacy:
        "The URL is sent to the configured scan backend, which fetches and renders it server-side. Do not scan a URL behind authentication you are not permitted to expose to a third-party service; see SECURITY.md."
    }
  };
}
