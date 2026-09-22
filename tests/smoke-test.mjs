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

console.log("AGP smoke test passed");
console.log(summary);
