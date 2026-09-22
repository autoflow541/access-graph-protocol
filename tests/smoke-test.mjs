import { AccessGraph, renderControls, summarizeObject } from "../sdk/javascript/agp.js";

const profile = {
  agp_profile: "0.1",
  output: { preferred: ["speech", "large_text"] },
  language: { complexity: "plain", response_length: "short" },
  interaction: { confirmation_for: ["physical_motion"] }
};

const graph = new AccessGraph();
graph.register({
  agp: "0.1",
  id: "drone-01",
  role: "drone",
  label: "Inspection Drone",
  state: { battery_percent: 71, recording: false },
  actions: [
    { id: "start_recording", label: "Start recording", risk: "low" },
    { id: "return_home", label: "Return home", risk: "high", category: "physical_motion" }
  ]
});

const summary = summarizeObject(graph.get("drone-01"), profile);
const controls = renderControls(graph.get("drone-01"), profile);
const returnHome = graph.resolveAction("drone-01", "return_home", profile);

if (!summary.includes("Inspection Drone")) throw new Error("Summary missing label");
if (!controls.presentation.largeControls) throw new Error("Profile not applied");
if (!returnHome.requiresConfirmation) throw new Error("High-risk action should require confirmation");

graph.updateState("drone-01", { recording: true });
if (graph.get("drone-01").state.recording !== true) throw new Error("State did not update");

// resolveAction() (the actual gate SpecsActionSession uses) and
// renderControls() (what a client's UI is built from) must agree on
// whether an action requires confirmation — they used to be two separate
// computations, and renderControls never checked a profile's
// interaction.confirmation_for category list, only risk. An action whose
// ONLY confirmation trigger is its category (not risk, not an explicit
// confirmation: true flag) exercises exactly the path that had drifted.
graph.register({
  id: "lamp-01",
  role: "light",
  label: "Lamp",
  state: {},
  actions: [{ id: "toggle", label: "Toggle", risk: "low", category: "device_control" }]
});
const categoryProfile = { interaction: { confirmation_for: ["device_control"] } };
const resolvedToggle = graph.resolveAction("lamp-01", "toggle", categoryProfile);
const renderedToggle = renderControls(graph.get("lamp-01"), categoryProfile);
if (!resolvedToggle.requiresConfirmation) throw new Error("A category-matched action should require confirmation");
if (renderedToggle.actions[0].confirmation !== resolvedToggle.requiresConfirmation) {
  throw new Error("renderControls and resolveAction must agree on whether an action requires confirmation");
}

console.log("AGP smoke test passed");
console.log(summary);
