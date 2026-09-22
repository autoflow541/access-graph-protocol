// A generic ExecutionService executor for adapters/web-scan/ objects:
// calls Auto-Flow's already-deployed scan service (scan.auto-flow.co by
// default) over real HTTP with a plain JSON body, the simplest
// integration of any leg in this repo since there is no file to encode:
// the scanner fetches and renders the URL itself.
export function createWebScanExecutor({ baseUrl = process.env.AGP_SCAN_SERVICE_URL || "https://scan.auto-flow.co" } = {}) {
  return async function webScanExecutor(_objectId, actionId, parameters) {
    if (actionId !== "check_accessibility") {
      throw new Error(`Unsupported web-scan action: ${actionId}`);
    }
    const url = parameters?.url;
    if (!url) throw new Error("This action requires a url (parameters.url)");

    const response = await fetch(`${baseUrl}/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url })
    });
    if (!response.ok) throw new Error(`Scan service returned HTTP ${response.status}: ${await response.text()}`);
    return response.json();
  };
}
