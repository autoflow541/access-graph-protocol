// A real network client for service/ — every state below reflects an
// actual HTTP response (or the absence of one), not a local simulation.
// See service/README.md for what the service does and does not
// guarantee; this page's job is only to make each of those outcomes
// visible and distinct, not to invent new ones.

const SERVICE_URL = window.AGP_SERVICE_URL || "http://localhost:8787";
const TOKEN = window.AGP_SERVICE_TOKEN || "dev-token"; // matches service/run-local.mjs's default; dev-only.
const DEVICE_ID = "hall-thermostat";

const connectionStatus = document.querySelector("#connection-status");
const stateList = document.querySelector("#device-state");
const stateVersionLabel = document.querySelector("#state-version-label");
const target = document.querySelector("#target");
const targetValue = document.querySelector("#target-value");
const actionsEl = document.querySelector("#actions");
const gate = document.querySelector("#gate");
const gateMessage = document.querySelector("#gate-message");
const gateActions = document.querySelector("#gate-actions");
const outcomeEl = document.querySelector("#outcome");
const graphJson = document.querySelector("#graph-json");
const announcer = document.querySelector("#announcer");

let currentObject = null;
let currentStateVersion = null;
let pendingProposalId = null;
let requestedTarget = 21;

async function api(method, path, body) {
  let response;
  try {
    response = await fetch(`${SERVICE_URL}${path}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    });
  } catch (networkError) {
    // fetch() throws (not a rejected-with-a-response) when the request
    // never reached a server at all — refused connection, DNS failure,
    // the service isn't running. This is the "disconnected" state, and
    // it is NOT the same as any HTTP error status below.
    const error = new Error(`Cannot reach the execution service at ${SERVICE_URL}. Is "npm run service:dev" running?`);
    error.code = "DISCONNECTED";
    throw error;
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `Request failed (HTTP ${response.status})`);
    error.code = payload.code || "HTTP_ERROR";
    error.httpStatus = response.status;
    throw error;
  }
  return payload;
}

function setConnectionStatus(kind, message) {
  connectionStatus.textContent = message;
  connectionStatus.className = `status-banner ${kind}`;
}

async function loadDevice() {
  setConnectionStatus("warn", "Connecting to the execution service…");
  try {
    const described = await api("GET", `/devices/${DEVICE_ID}`);
    currentObject = described.object;
    currentStateVersion = described.stateVersion;
    setConnectionStatus("ok", `Connected to the execution service at ${SERVICE_URL}.`);
    render();
  } catch (error) {
    setConnectionStatus("error", error.message);
    actionsEl.replaceChildren();
  }
}

function render() {
  stateList.replaceChildren(
    ...Object.entries(currentObject.state).flatMap(([key, value]) => fragment(humanize(key), displayValue(value)))
  );
  stateVersionLabel.textContent = `State version: ${currentStateVersion} (advances only after a successful dispatch)`;
  graphJson.textContent = JSON.stringify({ object: currentObject, stateVersion: currentStateVersion }, null, 2);

  const selectable = currentObject.actions.filter((action) => !action.id.startsWith("read_"));
  actionsEl.replaceChildren();
  for (const action of selectable) {
    if (action.id === "write_targettemperature") {
      target.disabled = false;
      target.min = String(action.parameters.value.minimum);
      target.max = String(action.parameters.value.maximum);
      continue; // rendered as the slider above, not a button
    }
    actionsEl.append(actionButton(action));
  }
}

function actionButton(action) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = action.confirmation ? `${action.label} · confirm` : action.label;
  button.addEventListener("click", () => beginProposal(action.id, {}));
  return button;
}

target.addEventListener("input", () => {
  requestedTarget = Number(target.value);
  targetValue.value = `${requestedTarget}°C`;
});
target.addEventListener("change", () => beginProposal("write_targettemperature", { value: requestedTarget }));

async function beginProposal(actionId, parameters) {
  outcomeEl.textContent = "";
  outcomeEl.className = "outcome";
  try {
    const proposed = await api("POST", `/devices/${DEVICE_ID}/actions/${actionId}/propose`, {
      parameters,
      stateVersion: currentStateVersion
    });
    pendingProposalId = proposed.proposalId;
    showGate(proposed.status, describeStatus(proposed.status, proposed.action));
  } catch (error) {
    if (error.code === "STALE_STATE") {
      announce("The device state changed since this page last read it. Refreshing before you try again.");
      await loadDevice();
      return;
    }
    if (error.code === "DISCONNECTED") {
      setConnectionStatus("error", error.message);
      return;
    }
    showOutcome("failed", error.message);
  }
}

function showGate(status, message) {
  gate.hidden = false;
  gateMessage.textContent = message;
  announce(message);
  gateActions.replaceChildren();

  if (status === "confirmation_required") {
    gateActions.append(
      gateButton("Confirm", () => advanceGate("confirm", { accepted: true })),
      gateButton("Cancel", () => advanceGate("cancel", {}), true)
    );
  } else if (status === "authorization_required") {
    gateActions.append(
      gateButton("Simulate authorization", () => advanceGate("authorize", { evidence: { granted: true } })),
      gateButton("Deny", () => advanceGate("authorize", { evidence: { granted: false } }), true)
    );
  } else if (status === "ready") {
    gateActions.append(
      gateButton("Execute", executeProposal),
      gateButton("Cancel", () => advanceGate("cancel", {}), true)
    );
  } else {
    gateActions.append(gateButton("Close", closeGate, true));
  }
}

async function advanceGate(step, body) {
  try {
    const result = await api("POST", `/proposals/${pendingProposalId}/${step}`, body);
    if (result.status === "cancelled" || result.status === "denied") {
      pendingProposalId = null;
      showOutcome(result.status, result.status === "denied" ? "Authorization was denied." : "Cancelled.");
      closeGate();
      return;
    }
    showGate(result.status, describeStatus(result.status));
  } catch (error) {
    handleGateError(error);
  }
}

async function executeProposal() {
  gateActions.replaceChildren();
  gateMessage.textContent = "Dispatching…";
  try {
    const requestId = crypto.randomUUID();
    const result = await api("POST", `/proposals/${pendingProposalId}/execute`, { requestId });
    pendingProposalId = null;
    if (result.status === "succeeded") {
      showOutcome("succeeded", "Action completed.");
      await loadDevice();
    } else if (result.status === "unknown") {
      showOutcome("unknown", "The device did not respond in time. Its actual state is unknown — re-check before retrying, do not assume it failed.");
    } else {
      showOutcome("failed", result.reason || "The device reported a failure.");
    }
    closeGate();
  } catch (error) {
    handleGateError(error);
  }
}

function handleGateError(error) {
  if (error.code === "STALE_STATE") {
    announce("The device state changed since this proposal was made. It has been cancelled — refreshing.");
    pendingProposalId = null;
    closeGate();
    loadDevice();
    return;
  }
  if (error.code === "PROPOSAL_EXPIRED") {
    announce("This proposal expired before you finished reviewing it. Cancelled — nothing was sent to the device.");
    pendingProposalId = null;
    closeGate();
    return;
  }
  if (error.code === "DISCONNECTED") {
    setConnectionStatus("error", error.message);
    return;
  }
  showOutcome("failed", error.message);
}

function describeStatus(status, action) {
  if (status === "confirmation_required") return `Confirm ${action?.label ?? "this action"}?`;
  if (status === "authorization_required") return "Authorization required — complete it on the underlying service (simulated here).";
  if (status === "ready") return "Ready to execute.";
  return status;
}

function showOutcome(kind, message) {
  outcomeEl.textContent = message;
  outcomeEl.className = `outcome ${kind}`;
  announce(message);
}

function closeGate() {
  gate.hidden = true;
}

function gateButton(label, handler, secondary = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  if (secondary) button.className = "secondary";
  button.addEventListener("click", handler);
  return button;
}

function announce(message) {
  announcer.textContent = message;
}

function humanize(value) {
  return String(value).replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function displayValue(value) {
  return typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);
}

function fragment(label, value) {
  const dt = document.createElement("dt");
  dt.textContent = label;
  const dd = document.createElement("dd");
  dd.textContent = value;
  return [dt, dd];
}

loadDevice();
