import { AccessGraph } from "./AgpCore/agp.js";
import { thingDescriptionToAgp } from "./AgpCore/AgpWotAdapter.js";

// Mirrors the Access Profile in examples/smart-device/app.js: plain
// language, short responses, one action visible at a time, captions +
// large text + high contrast + reduced motion, and confirmation required
// for device control and physical-safety actions.
function builtInDefaultProfile(): Record<string, unknown> {
  return {
    agp_profile: "0.1",
    input: { preferred: ["voice", "hand_tracking"], avoid: ["fine_motor", "timed_input"] },
    output: { preferred: ["speech", "captions", "large_text", "high_contrast", "reduced_motion"] },
    language: { complexity: "plain", response_length: "short" },
    interaction: { confirmation_for: ["device_control", "physical_safety"], one_step_at_a_time: true }
  };
}

/**
 * Loads an AGP object and Access Profile for the Lens, and stands up the
 * first connected device: the same simulated WoT thermostat used in
 * examples/smart-device/app.js, reusing the identical Thing Description so
 * the browser demo and the Lens exercise the same AGP object shape.
 *
 * No network Thing is contacted. `propertyValues` are simulated in memory,
 * matching the "simulated WoT thermostat" scope of AGP 0.1.1: a real Thing
 * would plug into this same adapter without changing anything downstream.
 */
@component
export class AgpDeviceSource extends BaseScriptComponent {
  // A plain multi-line string input (not a typed asset reference) so the
  // Access Profile is editable directly in the Inspector without depending
  // on an unverified text-asset API. Must validate against
  // schema/access-profile.schema.json; falls back to a built-in default
  // profile (same shape as examples/smart-device/app.js) if empty or invalid.
  @input
  @hint("Access Profile JSON (agp_profile 0.1). Edit in place or paste from Assets/Data/default-access-profile.json.")
  accessProfileJson: string = JSON.stringify(builtInDefaultProfile(), null, 2);

  graph: AccessGraph;
  deviceObjectId: string = "hall-thermostat";
  profile: Record<string, unknown>;

  private simulatedValues = { temperature: 20.4, targetTemperature: 21 };

  onAwake() {
    this.profile = this.loadAccessProfile();
    const thingDescription = this.buildThermostatThingDescription();
    const object = thingDescriptionToAgp(thingDescription, {
      id: this.deviceObjectId,
      propertyValues: this.simulatedValues
    });
    this.graph = new AccessGraph([object]);
  }

  /** Applies a simulated write so the panel reflects device state changes. */
  applySimulatedWrite(actionId: string, parameters: Record<string, unknown>) {
    if (actionId === "write_targettemperature") {
      this.simulatedValues.targetTemperature = Number(parameters.value);
      this.graph.updateState(this.deviceObjectId, { targetTemperature: this.simulatedValues.targetTemperature });
    } else if (actionId === "ecomode") {
      this.graph.updateState(this.deviceObjectId, { mode: "eco" });
    } else if (actionId === "emergencyshutdown") {
      this.graph.updateState(this.deviceObjectId, { mode: "off" });
    }
    return this.graph.get(this.deviceObjectId).state;
  }

  private loadAccessProfile(): Record<string, unknown> {
    try {
      const parsed = JSON.parse(this.accessProfileJson);
      if (parsed && parsed.agp_profile) return parsed;
      print("AgpDeviceSource: accessProfileJson is missing agp_profile, using built-in default.");
    } catch (error) {
      print(`AgpDeviceSource: accessProfileJson is not valid JSON, using built-in default. ${error}`);
    }
    return builtInDefaultProfile();
  }

  private buildThermostatThingDescription() {
    return {
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
        emergencyShutdown: {
          title: "Emergency shutdown",
          "x-agp-risk": "critical",
          "x-agp-confirmation": true,
          "x-agp-category": "physical_safety"
        }
      },
      events: { overheating: { title: "Overheating", "x-agp-priority": "critical" } }
    };
  }
}
