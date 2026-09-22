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

// --- Confirmation binds to parameters (audit finding B) ---------------
// A parameterized action, matching the shape adapters/wot/index.js
// produces for a WoT property write (e.g. write_targettemperature).
graph.register({
  id: "hall-thermostat",
  role: "thermostat",
  label: "Hall thermostat",
  state: { targetTemperature: 21 },
  actions: [{
    id: "write_targettemperature",
    label: "Set target temperature",
    risk: "medium",
    confirmation: true,
    category: "device_control",
    authorization: { required: true },
    parameters: { value: { type: "number", minimum: 16, maximum: 28, required: true } }
  }]
});

const thermostatSession = new SpecsActionSession(graph, profile, async (_objectId, _actionId, parameters) => parameters);

if (!throws(() => thermostatSession.request("hall-thermostat", "write_targettemperature", {}))) {
  throw new Error("A missing required parameter must be rejected at request time");
}
if (!throws(() => thermostatSession.request("hall-thermostat", "write_targettemperature", { value: 99 }))) {
  throw new Error("An out-of-range parameter must be rejected at request time");
}
if (!throws(() => thermostatSession.request("hall-thermostat", "write_targettemperature", { value: "warm" }))) {
  throw new Error("A wrongly-typed parameter must be rejected at request time");
}

if (thermostatSession.request("hall-thermostat", "write_targettemperature", { value: 19 }).status !== "confirmation_required") {
  throw new Error("Confirmation was bypassed for a parameterized action");
}
thermostatSession.confirm(true);
thermostatSession.provideAuthorization(true);

if (!(await throwsAsync(() => thermostatSession.execute({ value: 25 })))) {
  throw new Error("execute() must reject parameters that differ from what was confirmed — changed parameters cannot reuse confirmation");
}
if (!thermostatSession.pending || thermostatSession.pending.parameters.value !== 19) {
  throw new Error("A rejected execute() attempt must not consume or alter the confirmed proposal");
}

const thermostatResult = await thermostatSession.execute();
if (thermostatResult.status !== "executed" || thermostatResult.result.value !== 19) {
  throw new Error("execute() must run with the parameters bound at request time, not any value supplied later");
}

function throws(fn) {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}

async function throwsAsync(fn) {
  try {
    await fn();
    return false;
  } catch {
    return true;
  }
}

console.log("SPECS adapter test passed");
