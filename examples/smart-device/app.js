import { AccessGraph } from "../../sdk/javascript/agp.js";
import { thingDescriptionToAgp } from "../../adapters/wot/index.js";
import { SpecsActionSession, toSpecsView } from "../../adapters/specs/index.js";

const profile = {
  agp_profile: "0.1",
  input: { preferred: ["voice", "hand_tracking"], avoid: ["fine_motor", "timed_input"] },
  output: { preferred: ["speech", "captions", "large_text", "high_contrast", "reduced_motion"] },
  language: { complexity: "plain", response_length: "short" },
  interaction: { confirmation_for: ["device_control", "physical_safety"], one_step_at_a_time: true }
};

const td = {
  "@context": "https://www.w3.org/2022/wot/td/v1.1",
  "@type": "Thermostat",
  id: "urn:agp:demo:hall-thermostat",
  title: "Hall thermostat",
  description: "A simulated smart thermostat exposed through a WoT Thing Description.",
  security: "oauth2_sc",
  securityDefinitions: { oauth2_sc: { scheme: "oauth2" } },
  properties: {
    temperature: { title: "Room temperature", type: "number", unit: "celsius", readOnly: true },
    targetTemperature: { title: "Target temperature", type: "number", unit: "celsius", minimum: 16, maximum: 28 }
  },
  actions: {
    ecoMode: { title: "Turn on eco mode", "x-agp-risk": "low", "x-agp-confirmation": false, "x-agp-category": "device_control" },
    emergencyShutdown: { title: "Emergency shutdown", "x-agp-risk": "critical", "x-agp-confirmation": true, "x-agp-category": "physical_safety" }
  },
  events: { overheating: { title: "Overheating", "x-agp-priority": "critical" } }
};

const values = { temperature: 20.4, targetTemperature: 21 };
const object = thingDescriptionToAgp(td, { propertyValues: values });
const graph = new AccessGraph([object]);
let requestedTarget = values.targetTemperature;

const session = new SpecsActionSession(graph, profile, async (_objectId, actionId, parameters) => {
  if (actionId === "write_targettemperature") {
    values.targetTemperature = Number(parameters.value);
    graph.updateState(object.id, { targetTemperature: values.targetTemperature });
  }
  if (actionId === "ecomode") graph.updateState(object.id, { mode: "eco" });
  if (actionId === "emergencyshutdown") graph.updateState(object.id, { mode: "off" });
  render();
  return graph.get(object.id).state;
});

const state = document.querySelector("#device-state");
const title = document.querySelector("#specs-title");
const summary = document.querySelector("#summary");
const actions = document.querySelector("#actions");
const target = document.querySelector("#target");
const targetValue = document.querySelector("#target-value");
const gate = document.querySelector("#gate");
const gateMessage = document.querySelector("#gate-message");
const gateActions = document.querySelector("#gate-actions");
const graphJson = document.querySelector("#graph-json");
const announcer = document.querySelector("#announcer");

target.addEventListener("input", () => {
  requestedTarget = Number(target.value);
  targetValue.value = `${requestedTarget}°C`;
});
target.addEventListener("change", () => begin("write_targettemperature", { value: requestedTarget }));

function render() {
  const current = graph.get(object.id);
  const view = toSpecsView(current, profile);
  title.textContent = view.title;
  summary.textContent = view.summary;
  state.replaceChildren(...view.state.map((item) => fragment("dt", item.label, "dd", displayValue(item.value))));
  actions.replaceChildren(...view.actions.filter((action) => !action.id.startsWith("read_")).map(actionButton));
  graphJson.textContent = JSON.stringify(current, null, 2);
}

function actionButton(action) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = action.confirmation ? `${action.label} · confirm` : action.label;
  button.addEventListener("click", () => begin(action.id));
  return button;
}

function begin(actionId, parameters = {}) {
  const result = session.request(object.id, actionId, parameters);
  showGate(result.status, result.message);
}

function showGate(status, message) {
  // adapters/specs/index.js's message text stays platform-neutral: this
  // demo's authorization step is a local simulation, so the disclosure is
  // added here, once, so both the visible gate text and the screen-reader
  // announcer get the identical disclosed text.
  const disclosed = status === "authorization_required" ? `(Simulated) ${message}` : message;
  gate.hidden = false;
  gateMessage.textContent = disclosed;
  announcer.textContent = disclosed;
  gateActions.replaceChildren();

  if (status === "confirmation_required") {
    gateActions.append(gateButton("Confirm", () => advance(session.confirm(true))), gateButton("Cancel", () => advance(session.confirm(false)), true));
  } else if (status === "authorization_required") {
    gateActions.append(gateButton("Simulate device authorization", () => advance(session.provideAuthorization(true))), gateButton("Deny", () => advance(session.provideAuthorization(false)), true));
  } else if (status === "ready") {
    gateActions.append(gateButton("Execute", execute), gateButton("Cancel", () => advance(session.cancel()), true));
  } else {
    gateActions.append(gateButton("Close", closeGate, true));
  }
}

function advance(result) {
  if (["cancelled", "denied"].includes(result.status)) return showGate(result.status, result.message);
  showGate(result.status, result.message);
}

async function execute() {
  // Parameters are already bound to the proposal from begin() and were
  // carried through confirmation/authorization: execute() does not
  // accept a new value here, so a dragged-but-not-resubmitted slider
  // change can never silently swap in for what was actually confirmed.
  await session.execute();
  showGate("executed", "Action completed.");
}

function gateButton(label, handler, secondary = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  if (secondary) button.className = "secondary";
  button.addEventListener("click", handler);
  return button;
}

function closeGate() { gate.hidden = true; }
function displayValue(value) { return typeof value === "boolean" ? (value ? "Yes" : "No") : String(value); }
function fragment(firstTag, firstText, secondTag, secondText) {
  const fragment = document.createDocumentFragment();
  for (const [tag, text] of [[firstTag, firstText], [secondTag, secondText]]) {
    const element = document.createElement(tag);
    element.textContent = text;
    fragment.append(element);
  }
  return fragment;
}

render();
