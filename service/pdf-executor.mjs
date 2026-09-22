// A generic ExecutionService executor for adapters/pdf-remediation/
// objects: calls Auto-Flow's already-deployed PDF remediation service
// (pdf.auto-flow.co by default) over real HTTP multipart requests, using
// only Node's built-in fetch/FormData/Blob (no new HTTP dependency,
// matching this repo's dependency-free-where-possible posture).
//
// check_accessibility and analyze both POST the file and return the
// service's JSON response as-is. remediate POSTs the file plus the
// manifest from a prior analyze() call and gets back the remediated PDF
// as binary data plus an X-Conformance header describing what changed;
// both are returned together as { pdf, conformance }.
export function createPdfExecutor({ baseUrl = process.env.AGP_PDF_SERVICE_URL || "https://pdf.auto-flow.co" } = {}) {
  return async function pdfExecutor(_objectId, actionId, parameters) {
    const pdfBuffer = decodeBase64(parameters?.pdf, "pdf");

    if (actionId === "check_accessibility") {
      const form = new FormData();
      form.append("file", new Blob([pdfBuffer]), "document.pdf");
      form.append("flavour", parameters?.flavour ?? "ua1");
      return postJson(baseUrl, "/validate", form);
    }

    if (actionId === "analyze") {
      const form = new FormData();
      form.append("file", new Blob([pdfBuffer]), "document.pdf");
      form.append("detect_headers", String(parameters?.detect_headers ?? true));
      return postJson(baseUrl, "/autotag", form);
    }

    if (actionId === "remediate") {
      if (!parameters?.manifest) throw new Error("remediate requires a manifest (from a prior analyze() call)");
      const form = new FormData();
      form.append("file", new Blob([pdfBuffer]), "document.pdf");
      form.append("manifest", new Blob([JSON.stringify(parameters.manifest)], { type: "application/json" }), "manifest.json");
      form.append("flavour", parameters?.flavour ?? "ua1");

      const response = await fetch(`${baseUrl}/remediate`, { method: "POST", body: form });
      if (!response.ok) throw new Error(`PDF remediation service returned HTTP ${response.status}: ${await response.text()}`);
      const remediatedBytes = Buffer.from(await response.arrayBuffer());
      let conformance = null;
      try {
        conformance = JSON.parse(response.headers.get("X-Conformance") ?? "null");
      } catch {
        conformance = null;
      }
      return { pdf: remediatedBytes.toString("base64"), conformance };
    }

    throw new Error(`Unsupported pdf-remediation action: ${actionId}`);
  };
}

function decodeBase64(value, label) {
  if (!value) throw new Error(`This action requires a ${label} (parameters.${label})`);
  return Buffer.from(value, "base64");
}

async function postJson(baseUrl, path, form) {
  const response = await fetch(`${baseUrl}${path}`, { method: "POST", body: form });
  if (!response.ok) throw new Error(`PDF remediation service returned HTTP ${response.status}: ${await response.text()}`);
  return response.json();
}
