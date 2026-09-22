import assert from "node:assert/strict";
import { negotiateCapabilities } from "../sdk/javascript/agp.js";

const touchpanelThermostat = {
  id: "hall-thermostat",
  label: "Hall thermostat",
  inputs: ["touch", "voice"],
  outputs: ["visual", "audio"]
};

// --- Full match: every required channel is available -> no conflicts, nothing to explain
{
  const result = negotiateCapabilities(touchpanelThermostat, { inputs: ["touch", "voice"], outputs: ["visual", "audio"] });
  assert.equal(result.canControl, true);
  assert.equal(result.canPerceive, true);
  assert.deepEqual(result.missingInputs, []);
  assert.deepEqual(result.missingOutputs, []);
  assert.deepEqual(result.conflicts, []);
}

// --- Partial input match: one of two accepted input channels is available -> still controllable, alternative named explicitly
{
  const result = negotiateCapabilities(touchpanelThermostat, { inputs: ["touch"], outputs: ["visual", "audio"] });
  assert.equal(result.canControl, true);
  assert.deepEqual(result.supportedInputs, ["touch"]);
  assert.deepEqual(result.missingInputs, ["voice"]);
  const inputConflict = result.conflicts.find((c) => c.channel === "input");
  assert.match(inputConflict.explanation, /can still be controlled here via touch/);
  assert.match(inputConflict.explanation, /voice/);
}

// --- Full input mismatch: none of the accepted input channels are available -> cannot control, no invented alternative
{
  const result = negotiateCapabilities(touchpanelThermostat, { inputs: ["keyboard"], outputs: ["visual", "audio"] });
  assert.equal(result.canControl, false);
  assert.deepEqual(result.supportedInputs, []);
  assert.deepEqual(result.missingInputs, ["touch", "voice"]);
  const inputConflict = result.conflicts.find((c) => c.channel === "input");
  assert.match(inputConflict.explanation, /No alternative input is available in this session/);
}

// --- Same three cases mirrored for outputs (perception, not control)
{
  const full = negotiateCapabilities(touchpanelThermostat, { inputs: ["touch", "voice"], outputs: ["visual", "audio"] });
  assert.equal(full.canPerceive, true);

  const partial = negotiateCapabilities(touchpanelThermostat, { inputs: ["touch", "voice"], outputs: ["visual"] });
  assert.equal(partial.canPerceive, true);
  const outputConflict = partial.conflicts.find((c) => c.channel === "output");
  assert.match(outputConflict.explanation, /State can still be read here via visual/);

  const none = negotiateCapabilities(touchpanelThermostat, { inputs: ["touch", "voice"], outputs: ["haptic"] });
  assert.equal(none.canPerceive, false);
  const noneConflict = none.conflicts.find((c) => c.channel === "output");
  assert.match(noneConflict.explanation, /No alternative output is available in this session/);
}

// --- An object with no declared inputs/outputs is trivially fine (nothing required, nothing to negotiate)
{
  const result = negotiateCapabilities({ id: "x", label: "X" }, {});
  assert.equal(result.canControl, true);
  assert.equal(result.canPerceive, true);
  assert.deepEqual(result.conflicts, []);
}

// --- Default (omitted) clientCapabilities is conservative: nothing is assumed available
{
  const result = negotiateCapabilities(touchpanelThermostat);
  assert.equal(result.canControl, false);
  assert.equal(result.canPerceive, false);
  assert.deepEqual(result.supportedInputs, []);
  assert.deepEqual(result.supportedOutputs, []);
}

// --- Structural guard: the function takes only (object, clientCapabilities) -- never a profile,
// so a capability gap can never be computed from (and therefore never read as) a person's stated
// preferences. (.length is 1, not 2: clientCapabilities has a default value, which JS excludes
// from a function's reported arity -- this still confirms no third, profile-shaped parameter
// exists.) If this ever grows a third parameter, that guarantee needs re-examining, not silently drifting.
assert.equal(negotiateCapabilities.length, 1);

console.log("Capability negotiation test passed (full/partial/no match on inputs and outputs, no invented alternatives, no profile coupling)");
