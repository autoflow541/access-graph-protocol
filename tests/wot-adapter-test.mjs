import { AccessGraph } from "../sdk/javascript/agp.js";
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

console.log("WoT adapter test passed");
