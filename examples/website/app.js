import { AccessGraph, renderControls, summarizeObject } from "../../sdk/javascript/agp.js";

const graph = new AccessGraph([
  {
    agp: "0.1",
    id: "front-door",
    role: "door",
    label: "Main entrance",
    state: { locked: true, open: false },
    actions: [
      { id: "unlock", label: "Unlock door", risk: "medium", category: "security", confirmation: true },
      { id: "open", label: "Open door", risk: "low" }
    ],
    source: { type: "native_agp", confidence: 1 }
  },
  {
    agp: "0.1",
    id: "lobby-light",
    role: "light",
    label: "Lobby light",
    state: { powered: false, brightness_percent: 0 },
    actions: [
      { id: "turn_on", label: "Turn on", risk: "none" },
      { id: "turn_off", label: "Turn off", risk: "none" }
    ],
    source: { type: "native_agp", confidence: 1 }
  }
]);

const app = document.querySelector("#app");
const status = document.querySelector("#status");
const graphJson = document.querySelector("#graphJson");
const inputs = ["largeText", "speech", "oneStep"].map((id) => document.getElementById(id));
inputs.forEach((input) => input.addEventListener("change", render));

function currentProfile() {
  return {
    agp_profile: "0.1",
    output: { preferred: [
      ...(document.querySelector("#speech").checked ? ["speech"] : []),
      ...(document.querySelector("#largeText").checked ? ["large_text"] : [])
    ] },
    language: { complexity: "plain", response_length: "short" },
    interaction: {
      one_step_at_a_time: document.querySelector("#oneStep").checked,
      confirmation_for: ["security", "physical_motion"]
    }
  };
}

function render() {
  const profile = currentProfile();
  app.replaceChildren();

  for (const object of graph.list()) {
    const model = renderControls(object, profile);
    const card = document.createElement("article");
    card.className = `card ${model.presentation.largeControls ? "large" : ""}`;
    card.innerHTML = `<h2>${escapeHtml(model.title)}</h2><p>${escapeHtml(summarizeObject(object, profile))}</p>`;

    const actions = document.createElement("div");
    actions.className = "actions";
    for (const action of model.actions) {
      const button = document.createElement("button");
      button.textContent = action.confirmation ? `${action.label} (confirm)` : action.label;
      button.className = `risk-${action.risk}`;
      button.addEventListener("click", () => execute(object.id, action.id));
      actions.append(button);
    }
    card.append(actions);
    app.append(card);
  }

  graphJson.textContent = JSON.stringify(graph.list(), null, 2);
}

function execute(objectId, actionId) {
  const profile = currentProfile();
  const resolved = graph.resolveAction(objectId, actionId, profile);
  if (resolved.requiresConfirmation && !confirm(`Confirm: ${resolved.action.label ?? actionId}?`)) return;

  if (objectId === "front-door" && actionId === "unlock") graph.updateState(objectId, { locked: false });
  if (objectId === "front-door" && actionId === "open") {
    if (graph.get(objectId).state.locked) {
      announce("The door is locked. Unlock it first.");
      return;
    }
    graph.updateState(objectId, { open: true });
  }
  if (objectId === "lobby-light" && actionId === "turn_on") graph.updateState(objectId, { powered: true, brightness_percent: 100 });
  if (objectId === "lobby-light" && actionId === "turn_off") graph.updateState(objectId, { powered: false, brightness_percent: 0 });

  announce(`${resolved.action.label ?? actionId} completed.`);
  render();
}

function announce(message) {
  status.textContent = message;
  if (document.querySelector("#speech").checked && "speechSynthesis" in window) {
    speechSynthesis.cancel();
    speechSynthesis.speak(new SpeechSynthesisUtterance(message));
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[character]);
}

render();
