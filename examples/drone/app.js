import { AccessGraph, renderControls, summarizeObject } from "../../sdk/javascript/agp.js";

const profile = {
  agp_profile: "0.1",
  input: { preferred: ["keyboard", "voice"], avoid: ["fine_motor"] },
  output: { preferred: ["speech", "large_text"] },
  language: { complexity: "plain", response_length: "short" },
  interaction: { confirmation_for: ["physical_motion"], one_step_at_a_time: true }
};

const graph = new AccessGraph([{
  agp: "0.1",
  id: "drone-01",
  role: "drone",
  label: "Inspection Drone",
  state: {
    battery_percent: 71,
    altitude_meters: 24,
    gps_lock: true,
    recording: false,
    mode: "hover"
  },
  actions: [
    { id: "start_recording", label: "Start recording", risk: "low" },
    { id: "stop_recording", label: "Stop recording", risk: "low" },
    { id: "return_home", label: "Return home", risk: "high", category: "physical_motion", confirmation: true },
    { id: "land", label: "Land", risk: "high", category: "physical_motion", confirmation: true }
  ],
  events: [
    { id: "battery_low", label: "Battery low", priority: "high" }
  ],
  source: { type: "native_agp", confidence: 1 }
}]);

const app = document.querySelector("#app");
const status = document.querySelector("#status");
const graphJson = document.querySelector("#graphJson");

function render() {
  const drone = graph.get("drone-01");
  const model = renderControls(drone, profile);
  app.replaceChildren();

  const card = document.createElement("article");
  card.className = "card large";
  card.innerHTML = `<h2>${model.title}</h2><p>${summarizeObject(drone, profile)}</p>`;

  const actions = document.createElement("div");
  actions.className = "actions";
  for (const action of model.actions) {
    const button = document.createElement("button");
    button.textContent = action.confirmation ? `${action.label} (confirm)` : action.label;
    button.addEventListener("click", () => execute(action.id));
    actions.append(button);
  }
  card.append(actions);
  app.append(card);
  graphJson.textContent = JSON.stringify(graph.list(), null, 2);
}

function execute(actionId) {
  const resolved = graph.resolveAction("drone-01", actionId, profile);
  if (resolved.requiresConfirmation && !confirm(`Confirm physical action: ${resolved.action.label}?`)) return;

  if (actionId === "start_recording") graph.updateState("drone-01", { recording: true });
  if (actionId === "stop_recording") graph.updateState("drone-01", { recording: false });
  if (actionId === "return_home") graph.updateState("drone-01", { mode: "returning_home", altitude_meters: 20 });
  if (actionId === "land") graph.updateState("drone-01", { mode: "landed", altitude_meters: 0 });

  announce(`${resolved.action.label} command accepted.`);
  render();
}

function announce(message) {
  status.textContent = message;
  if ("speechSynthesis" in window) {
    speechSynthesis.cancel();
    speechSynthesis.speak(new SpeechSynthesisUtterance(message));
  }
}

setInterval(() => {
  const drone = graph.get("drone-01");
  if (drone.state.mode === "landed") return;
  const nextBattery = Math.max(0, drone.state.battery_percent - 1);
  graph.updateState("drone-01", { battery_percent: nextBattery });
  if (nextBattery === 20) announce("Battery low. Twenty percent remaining.");
  render();
}, 10000);

render();
