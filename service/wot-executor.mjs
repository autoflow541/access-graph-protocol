// A generic ExecutionService executor for WoT-sourced devices: dispatches
// through a real node-wot ConsumedThing instead of a hand-rolled
// per-device switch statement (service/run-local.mjs's thermostat
// simulation). This is what ADR-0001 point 4 (docs/adr-0001-wot-reuse.md)
// asked for once a real execution service existed: "should be able to use
// Eclipse Thingweb node-wot ... directly for the dispatch step of a
// WoT-sourced action, rather than AGP reimplementing WoT protocol
// bindings." AGP still never reads a Thing's `forms` itself
// (adapters/wot/index.js stays read-only, per SECURITY.md); this file is
// the one place that does, and only because it *is* the execution layer,
// not the adapter.
//
// Driven entirely by the action metadata adapters/wot/index.js already
// attaches (`metadata.affordance`: "property" | "action",
// `metadata.wot_name`: the TD's own property/action name), so nothing
// here is thermostat-specific: this same function works for any WoT-sourced
// AGP object without modification.
export function createWotExecutor(graph, thing) {
  return async function wotExecutor(objectId, actionId, parameters) {
    const object = graph.get(objectId);
    if (!object) throw new Error(`Unknown AGP object: ${objectId}`);
    const action = object.actions.find((candidate) => candidate.id === actionId);
    if (!action) throw new Error(`Unknown action ${actionId} for ${objectId}`);

    const affordance = action.metadata?.affordance;
    const wotName = action.metadata?.wot_name;
    if (!affordance || !wotName) {
      throw new Error(`Action ${actionId} has no WoT affordance metadata to dispatch through`);
    }

    let result;
    if (affordance === "property") {
      if (actionId.startsWith("write_")) {
        // AGP's WoT adapter represents a writable property as a
        // single-parameter pseudo-action (schemaParameter, adapters/wot/index.js)
        // whose one declared parameter is always named "value": this is
        // the one place that convention has to be un-done to
        // call the real Scripting API.
        await thing.writeProperty(wotName, parameters?.value);
      }
      const output = await thing.readProperty(wotName);
      result = { [wotName]: await output.value() };
    } else if (affordance === "action") {
      const hasInput = parameters && Object.keys(parameters).length > 0;
      const output = await thing.invokeAction(wotName, hasInput ? parameters : undefined);
      result = output && typeof output.value === "function" ? { result: await output.value() } : { result: null };
    } else {
      throw new Error(`Unsupported WoT affordance "${affordance}" for action ${actionId}`);
    }

    // AGP's local graph is a mirror, not the source of truth -- the real
    // Thing is. Re-read every distinct property this object declares
    // (deduplicated by wot_name, since one read-write property produces
    // separate read_/write_ AGP actions for the same underlying name) so
    // describe()/inspect() reflect what actually happened, including any
    // side effect this dispatch had beyond the one property/action
    // touched (e.g. an "ecoMode" action changing more than one reading).
    const propertyNames = new Set(
      object.actions.filter((a) => a.metadata?.affordance === "property").map((a) => a.metadata.wot_name)
    );
    const freshState = {};
    for (const name of propertyNames) {
      freshState[name] = await thing.readProperty(name).then((output) => output.value());
    }
    graph.updateState(objectId, freshState);

    return result;
  };
}
