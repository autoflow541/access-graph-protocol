import { AccessGraph } from "../sdk/javascript/agp.js";
import { matchSpecsIntent, SpecsActionSession, toSpecsView } from "../adapters/specs/index.js";

const profile = {
  output: { preferred: ["speech", "captions", "large_text", "high_contrast", "reduced_motion"] },
  language: { complexity: "plain", response_length: "short" },
  interaction: { one_step_at_a_time: true, confirmation_for: ["device_control"] }
};

const graph = new AccessGraph([{
  id: "hall-light",
  role: "light",
  label: "Hall light",
  state: { on: false },
  actions: [{
    id: "turn_on",
    label: "Turn on",
    risk: "medium",
    confirmation: true,
    category: "device_control",
    authorization: { required: true },
    metadata: { voice_aliases: ["lights on"] }
  }]
}]);

const object = graph.get("hall-light");
const view = toSpecsView(object, profile);
if (view.platform.target !== "SPECS" || view.presentation.layout !== "focused") throw new Error("SPECS presentation was not mapped");
if (!view.presentation.speech || !view.presentation.captions || !view.presentation.reduceMotion) throw new Error("Access Profile output was not preserved");

const intent = matchSpecsIntent("lights on", object);
if (intent.status !== "matched" || intent.actionId !== "turn_on") throw new Error("Exact voice alias did not match");
if (matchSpecsIntent("please turn it on", object).status !== "no_match") throw new Error("Free-form voice input must not guess an action");

let executions = 0;
const session = new SpecsActionSession(graph, profile, async () => ++executions);
if (session.request("hall-light", "turn_on").status !== "confirmation_required") throw new Error("Confirmation was bypassed");
if (session.confirm(true).status !== "authorization_required") throw new Error("Authorization was bypassed");
if (session.provideAuthorization(true).status !== "ready") throw new Error("Authorized action should be ready");
const result = await session.execute();
if (result.status !== "executed" || executions !== 1) throw new Error("Ready action did not execute exactly once");

console.log("SPECS adapter test passed");
