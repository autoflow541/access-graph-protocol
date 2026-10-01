import assert from "node:assert/strict";
import { negotiateActionCapabilities, negotiateCapabilities } from "../sdk/javascript/agp.js";

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

// --- negotiateActionCapabilities: a lock whose object-level channels are
// touch+voice, but whose safety-critical `unlock` action narrows that to
// touch only, while a `read_battery` action declares no override of its
// own and falls back to the object's channels unchanged. (NEXT.md: this
// was "object-level only, no per-action channels" before this change.)
{
  const lock = {
    id: "front-door",
    label: "Front door lock",
    inputs: ["touch", "voice"],
    outputs: ["visual", "audio"],
    actions: [
      { id: "unlock", label: "Unlock", risk: "high", inputs: ["touch"] },
      { id: "read_battery", label: "Read battery", risk: "none" }
    ]
  };

  const voiceOnlyClient = { inputs: ["voice"], outputs: ["visual", "audio"] };

  const unlockResult = negotiateActionCapabilities(lock, "unlock", voiceOnlyClient);
  assert.equal(unlockResult.canControl, false, "unlock narrows to touch only; a voice-only client cannot control it");
  assert.match(unlockResult.conflicts.find((c) => c.channel === "input").explanation, /Front door lock – Unlock/);

  const batteryResult = negotiateActionCapabilities(lock, "read_battery", voiceOnlyClient);
  assert.equal(batteryResult.canControl, true, "read_battery has no override and falls back to the object's touch+voice, which voice satisfies");

  // Object-level negotiateCapabilities must be completely unaffected by
  // an action declaring its own narrower channels: it still reports the
  // OBJECT's touch+voice, not unlock's touch-only override.
  const objectResult = negotiateCapabilities(lock, voiceOnlyClient);
  assert.equal(objectResult.canControl, true, "object-level negotiation must not be narrowed by one action's override");

  assert.throws(() => negotiateActionCapabilities(lock, "nonexistent", voiceOnlyClient), /Unknown action/);
}

// --- A declared-but-empty action-level `inputs: []` is a meaningful claim
// ("this action needs no input channel at all"), not "fall back to the
// object's": `??` (absent check), not `||` (falsy check), must be what
// decides the fallback.
{
  const sensor = {
    id: "sensor-01",
    label: "Sensor",
    inputs: ["touch", "voice"],
    actions: [{ id: "auto_log", label: "Auto log", risk: "none", inputs: [] }]
  };
  const noInputClient = { inputs: [] };
  const result = negotiateActionCapabilities(sensor, "auto_log", noInputClient);
  assert.equal(result.canControl, true, "an action declaring inputs: [] requires nothing, regardless of what the object itself requires");
  assert.deepEqual(result.missingInputs, []);
}

// --- Structural guard: same arity discipline as negotiateCapabilities --
// (object, actionId, clientCapabilities), never a profile.
assert.equal(negotiateActionCapabilities.length, 2);

// --- Structural guard: the function takes only (object, clientCapabilities) -- never a profile,
// so a capability gap can never be computed from (and therefore never read as) a person's stated
// preferences. (.length is 1, not 2: clientCapabilities has a default value, which JS excludes
// from a function's reported arity -- this still confirms no third, profile-shaped parameter
// exists.) If this ever grows a third parameter, that guarantee needs re-examining, not silently drifting.
assert.equal(negotiateCapabilities.length, 1);

console.log("Capability negotiation test passed (full/partial/no match on inputs and outputs, no invented alternatives, no profile coupling, per-action override with object-level fallback)");
