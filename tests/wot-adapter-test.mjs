import { AccessGraph, RISK_ORDER } from "../sdk/javascript/agp.js";
import { thingDescriptionToAgp, thingDescriptionToGraph } from "../adapters/wot/index.js";

const td = {
  "@context": "https://www.w3.org/2022/wot/td/v1.1",
  "@type": "Thermostat",
  id: "urn:dev:wot:thermostat-01",
  title: "Hall thermostat",
  security: "bearer_sc",
  securityDefinitions: { bearer_sc: { scheme: "bearer" } },
  properties: {
    temperature: { type: "number", unit: "celsius", readOnly: true },
    targetTemperature: { type: "number", unit: "celsius", minimum: 10, maximum: 30 }
  },
  actions: {
    emergencyStop: {
      title: "Emergency stop",
      "x-agp-risk": "critical",
      "x-agp-confirmation": true,
      "x-agp-category": "physical_safety"
    }
  },
  events: { overheating: { title: "Overheating", "x-agp-priority": "critical" } }
};

const object = thingDescriptionToAgp(td, { propertyValues: { temperature: 21.5, targetTemperature: 22 } });
const graph = new AccessGraph([object]);
const target = object.actions.find((action) => action.id === "write_targettemperature");
const stop = graph.resolveAction(object.id, "emergencystop");

if (object.role !== "thermostat") throw new Error("WoT type was not mapped to role");
if (object.state.temperature !== 21.5) throw new Error("Property state was not mapped");
if (!target.confirmation || target.risk !== "medium") throw new Error("Writable property must fail safe");
if (!target.authorization.required) throw new Error("WoT security must be preserved");
if (stop.action.risk !== "critical" || !stop.requiresConfirmation) throw new Error("AGP safety extension was not preserved");

const expanded = thingDescriptionToGraph(td, { propertyValues: { temperature: 21.5 } });
if (expanded.length !== 3) throw new Error("Expanded graph should include the Thing and its properties");
if (!expanded[0].relationships.every((edge) => edge.type === "contains")) throw new Error("Graph relationships missing");

// --- Finding C: observed values, not defaults; write-only excluded ----
const stateTd = {
  title: "State fidelity test",
  properties: {
    liveTemp: { type: "number", default: 999 }, // no const, no supplied value: only a default
    fixedZone: { type: "string", const: "north" }, // const is definitionally known
    secretCode: { type: "string", writeOnly: true }
  }
};
const stateObject = thingDescriptionToAgp(stateTd, { propertyValues: { secretCode: "1234" } });
if ("liveTemp" in stateObject.state) throw new Error("A schema default must not be presented as observed state");
if (stateObject.state.fixedZone !== "north") throw new Error("A WoT const value should still be represented as known state");
if ("secretCode" in stateObject.state) throw new Error("A write-only property must never appear in state");

// --- Finding D: parameter schema fidelity ------------------------------
const schemaTd = {
  title: "Schema fidelity test",
  actions: {
    configure: {
      title: "Configure",
      input: {
        type: "object",
        properties: {
          mode: { type: "string", enum: ["eco", "boost"] },
          schedule: { type: "array", items: { type: "string" } },
          nickname: { type: "string" }
        },
        required: ["mode"]
      }
    },
    calibrate: {
      title: "Calibrate",
      input: { oneOf: [{ type: "string" }, { type: "number" }] } // no `type`: genuinely unsupported
    }
  }
};
const schemaObject = thingDescriptionToAgp(schemaTd);
const configure = schemaObject.actions.find((action) => action.metadata.wot_name === "configure");
if (configure.parameters.mode.required !== true) throw new Error("An explicitly required parameter must stay required");
if (configure.parameters.nickname.required !== false) {
  throw new Error("Per-property requiredness must be read from the input schema, not hardcoded true for every property");
}
if (configure.parameters.schedule.type !== "array" || !configure.parameters.schedule.items) {
  throw new Error("Array parameter structure must be preserved, not coerced to string");
}
const calibrate = schemaObject.actions.find((action) => action.metadata.wot_name === "calibrate");
if (calibrate.parameters.value.type !== "unsupported" || !calibrate.parameters.value.unsupported) {
  throw new Error("An unrepresentable parameter schema must be flagged, not silently coerced to string");
}

// --- Finding E: collision-safe identifiers -----------------------------
const collisionTd = {
  title: "Collision test",
  properties: {
    "Target Temperature": { type: "number" },
    "Target-Temperature": { type: "number" }
  }
};
const collisionObject = thingDescriptionToAgp(collisionTd);
const writes = collisionObject.actions.filter((action) => action.id.startsWith("write_"));
if (writes.length !== 2) throw new Error("Both colliding properties must still produce an action");
if (new Set(writes.map((action) => action.id)).size !== 2) {
  throw new Error("Colliding property names must not silently overwrite each other's action ids");
}
const originalNames = writes.map((action) => action.metadata.wot_name);
if (!originalNames.includes("Target Temperature") || !originalNames.includes("Target-Temperature")) {
  throw new Error("The original source name must be preserved on each action despite the id collision");
}

// --- Finding F: per-form security overrides ----------------------------
const formTd = {
  title: "Form security override test",
  security: "nosec_sc",
  securityDefinitions: { nosec_sc: { scheme: "nosec" }, bearer_sc: { scheme: "bearer" } },
  actions: {
    dangerousAction: { title: "Dangerous action", forms: [{ href: "/dangerous", security: "bearer_sc" }] },
    safeAction: { title: "Safe action" }
  }
};
const formObject = thingDescriptionToAgp(formTd);
const dangerous = formObject.actions.find((action) => action.metadata.wot_name === "dangerousAction");
const safe = formObject.actions.find((action) => action.metadata.wot_name === "safeAction");
if (!dangerous.authorization.required) throw new Error("A form-level security override must be honored over the Thing-level default");
if (safe.authorization.required) throw new Error("An action without a form override should still inherit the Thing-level nosec default");

// --- Finding G: source-declared risk/confirmation cannot undercut policy
const policyTd = {
  title: "Policy floor test",
  security: "nosec_sc",
  securityDefinitions: { nosec_sc: { scheme: "nosec" } },
  actions: {
    unlockDoor: {
      title: "Unlock door",
      "x-agp-risk": "none",
      "x-agp-confirmation": false,
      "x-agp-category": "physical_safety"
    }
  }
};
const policyObject = thingDescriptionToAgp(policyTd);
const unlock = policyObject.actions.find((action) => action.metadata.wot_name === "unlockDoor");
if (RISK_ORDER.indexOf(unlock.risk) < RISK_ORDER.indexOf("high")) {
  throw new Error("A source-declared low risk must not undercut the physical_safety policy floor");
}
if (!unlock.confirmation) throw new Error("A source-declared confirmation:false must not undercut the physical_safety policy floor");

console.log("WoT adapter test passed");
