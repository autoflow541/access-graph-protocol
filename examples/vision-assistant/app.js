// A real network client for service/run-local-vision.mjs, same pattern
// as examples/execution-client/app.js: every state below reflects an
// actual HTTP response, not a local simulation. The camera capture and
// speech output are both real browser APIs (getUserMedia,
// SpeechSynthesis); only the description text itself may be simulated,
// depending on how the service was started (see its own log line).
import { negotiateCapabilities } from "../../sdk/javascript/agp.js";

const SERVICE_URL = window.AGP_SERVICE_URL || "http://localhost:8791";
const TOKEN = window.AGP_SERVICE_TOKEN || "dev-token";
const DEVICE_ID = "front-camera";

const connectionStatus = document.querySelector("#connection-status");
const cameraPreview = document.querySelector("#camera-preview");
const cameraStatus = document.querySelector("#camera-status");
const btnDescribe = document.querySelector("#btn-describe");
const btnReadText = document.querySelector("#btn-read-text");
const outcomeEl = document.querySelector("#outcome");
const capabilityResult = document.querySelector("#capability-result");
const announcer = document.querySelector("#announcer");

let currentObject = null;
let currentStateVersion = null;
let cameraAvailable = false;

async function api(method, path, body) {
  let response;
  try {
    response = await fetch(`${SERVICE_URL}${path}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    });
  } catch (networkError) {
    const error = new Error(`Cannot reach the vision-assistant service at ${SERVICE_URL}. Is "npm run service:dev:vision" running?`);
    error.code = "DISCONNECTED";
    throw error;
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `Request failed (HTTP ${response.status})`);
    error.code = payload.code || "HTTP_ERROR";
    throw error;
  }
  return payload;
}

function setConnectionStatus(kind, message) {
  connectionStatus.textContent = message;
  connectionStatus.className = `status-banner ${kind}`;
}

async function loadDevice() {
  setConnectionStatus("warn", "Connecting to the vision-assistant service…");
  try {
    const described = await api("GET", `/devices/${DEVICE_ID}`);
    currentObject = described.object;
    currentStateVersion = described.stateVersion;
    setConnectionStatus("ok", `Connected to the vision-assistant service at ${SERVICE_URL}.`);
    btnDescribe.disabled = !cameraAvailable;
    btnReadText.disabled = !cameraAvailable;
  } catch (error) {
    setConnectionStatus("error", error.message);
  }
  renderCapabilities();
}

async function setUpCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    cameraStatus.textContent = "This browser has no camera API available.";
    cameraAvailable = false;
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    cameraPreview.srcObject = stream;
    cameraAvailable = true;
    cameraStatus.textContent = "Camera connected.";
  } catch (error) {
    cameraAvailable = false;
    cameraStatus.textContent = `Camera not available: ${error.message}. Questions can't be asked without it.`;
  }
  btnDescribe.disabled = !cameraAvailable || !currentObject;
  btnReadText.disabled = !cameraAvailable || !currentObject;
  renderCapabilities();
}

function captureFrame() {
  const canvas = document.createElement("canvas");
  canvas.width = cameraPreview.videoWidth;
  canvas.height = cameraPreview.videoHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(cameraPreview, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
  return dataUrl.split(",")[1]; // strip the "data:image/jpeg;base64," prefix
}

async function ask(actionId, buttonLabel) {
  outcomeEl.textContent = "";
  outcomeEl.className = "outcome";
  announce(`Asking: ${buttonLabel}`);
  try {
    const image = captureFrame();
    const proposed = await api("POST", `/devices/${DEVICE_ID}/actions/${actionId}/propose`, {
      parameters: { image },
      stateVersion: currentStateVersion
    });
    // Both actions are risk:none with no confirmation/authorization
    // (adapters/vision-assistant/index.js), so this is always already
    // "ready": execute immediately, no gate UI to click through. That's
    // the point: a blind or low-vision person asking this repeatedly
    // cannot have every question interrupted by a confirmation dialog.
    if (proposed.status !== "ready") {
      showOutcome("failed", `Unexpected gate before dispatch: ${proposed.status}. This action was not supposed to require one.`);
      return;
    }
    const requestId = crypto.randomUUID();
    const result = await api("POST", `/proposals/${proposed.proposalId}/execute`, { requestId });
    if (result.status === "succeeded") {
      showOutcome("succeeded", result.result.description);
      speak(result.result.description);
    } else if (result.status === "unknown") {
      showOutcome("unknown", "The service did not respond in time. Try asking again.");
    } else {
      showOutcome("failed", result.reason || "The service reported a failure.");
    }
  } catch (error) {
    if (error.code === "STALE_STATE") {
      announce("State changed since this page last read it. Refreshing before you try again.");
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

function speak(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

function showOutcome(kind, message) {
  outcomeEl.textContent = message;
  outcomeEl.className = `outcome ${kind}`;
  announce(message);
}

function announce(message) {
  announcer.textContent = message;
}

function currentClientCapabilities() {
  return {
    inputs: cameraAvailable ? ["camera"] : [],
    outputs: window.speechSynthesis ? ["speech", "text"] : ["text"]
  };
}

function renderCapabilities() {
  if (!currentObject) return;
  const result = negotiateCapabilities(currentObject, currentClientCapabilities());
  if (result.conflicts.length === 0) {
    capabilityResult.textContent = "This session reports everything this capability needs.";
    capabilityResult.className = "capability-result ok";
    return;
  }
  capabilityResult.replaceChildren(
    ...result.conflicts.map((conflict) => {
      const p = document.createElement("p");
      p.textContent = conflict.explanation;
      return p;
    })
  );
  capabilityResult.className = `capability-result ${result.canControl && result.canPerceive ? "warn" : "error"}`;
}

btnDescribe.addEventListener("click", () => ask("describe_scene", "What am I looking at?"));
btnReadText.addEventListener("click", () => ask("read_text", "Read the text in view"));

loadDevice();
setUpCamera();
