// Models a PDF document, and Auto-Flow's already-deployed AI-driven PDF
// remediation service (pdf.auto-flow.co), as an AGP object. Same reason
// as adapters/vision-assistant/: proving the execution model and
// negotiateCapabilities() generalize past IoT to a third, unrelated media
// type, this time a real, already-shipping production service rather
// than something built for this repo.
//
// Three actions map directly onto the service's real endpoints
// (POST /validate, POST /autotag, POST /remediate). No new capability is
// invented here: this adapter is a projection of an existing API, the
// same discipline adapters/wot/index.js applies to a Thing Description.
//
// check_accessibility and analyze are read-only (they never change the
// uploaded file), so both are risk:none/no confirmation, matching the
// same reasoning adapters/vision-assistant/ uses for informational
// actions. remediate is different: it is an AI making judgment calls
// (heading levels, alt text, reading order, table structure) that
// produce a new work product. It does not destroy or overwrite the
// original, but it is not purely informational either, so it carries
// risk "low" with confirmation required: a person should see that an AI
// made these calls before treating the output as final, not have it
// silently swapped in.
import { AGP_VERSION } from "../../sdk/javascript/agp.js";

const PDF_PARAMETER = {
  type: "string",
  description: "The PDF file, base64-encoded.",
  required: true
};

export function createPdfDocumentObject({ id, label = "PDF Document", description } = {}) {
  if (!id) throw new Error("createPdfDocumentObject requires an id");
  return {
    agp: AGP_VERSION,
    id,
    role: "document",
    label,
    description:
      description ??
      "Checks a PDF against PDF/UA and WCAG, analyzes its structure, and can remediate it into a tagged, accessible file, using Auto-Flow's already-deployed AI-driven remediation service.",
    state: {},
    actions: [
      {
        id: "check_accessibility",
        label: "Check accessibility",
        risk: "none",
        confirmation: false,
        category: "information",
        parameters: {
          pdf: PDF_PARAMETER,
          flavour: { type: "string", description: "veraPDF flavour, e.g. \"ua1\".", required: false }
        },
        authorization: { required: false }
      },
      {
        id: "analyze",
        label: "Analyze structure",
        risk: "none",
        confirmation: false,
        category: "information",
        parameters: {
          pdf: PDF_PARAMETER,
          detect_headers: { type: "boolean", description: "Detect headings from font size/weight.", required: false }
        },
        authorization: { required: false }
      },
      {
        id: "remediate",
        label: "Remediate into a tagged, accessible PDF",
        risk: "low",
        confirmation: true,
        category: "document_processing",
        parameters: {
          pdf: PDF_PARAMETER,
          // additionalProperties: true (sdk-level addition, adapters/specs/index.js):
          // the real manifest's shape is a large, variable, AI-generated
          // structure tree this adapter is not going to re-declare
          // field-by-field just to let it through validation.
          manifest: {
            type: "object",
            additionalProperties: true,
            description: "The structure manifest from a prior analyze() call.",
            required: true
          },
          flavour: { type: "string", description: "veraPDF flavour to remediate for, e.g. \"ua1\".", required: false }
        },
        authorization: { required: false }
      }
    ],
    inputs: ["file_upload"],
    outputs: ["text", "file_download"],
    source: { type: "ai_inference", confidence: 1, adapter: "pdf-remediation-0.1" },
    metadata: {
      privacy:
        "Each request sends the full PDF to the configured remediation backend. Do not use this on documents you are not permitted to send to a third-party service; see SECURITY.md."
    }
  };
}
