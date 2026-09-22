// A generic ExecutionService executor for any AGP object whose actions
// send an image through a pluggable `describer` function: not just
// adapters/vision-assistant/'s camera, also adapters/web-vision/'s page
// screenshots, and anything else this pattern fits later. Driven by
// `metadata.describerMode` on the action (set by the adapter, read here,
// exactly the same discipline wot-executor.mjs uses
// `metadata.affordance`/`wot_name` instead of hardcoding action ids) so
// this file needed zero changes to add the second media type.
//
// `query` is optional, separate from `image`: most modes (describe a
// scene, read text) need nothing but the picture, but a targeted mode
// like web-vision's find_element ("find the submit button") needs to
// know what to look for. Passed through as a third argument only when
// present, so a describer that ignores it is unaffected.
export function createVisionExecutor(graph, describer) {
  return async function visionExecutor(objectId, actionId, parameters) {
    const object = graph.get(objectId);
    if (!object) throw new Error(`Unknown AGP object: ${objectId}`);
    const action = object.actions.find((candidate) => candidate.id === actionId);
    if (!action) throw new Error(`Unknown action ${actionId} for ${objectId}`);

    const mode = action.metadata?.describerMode;
    if (!mode) throw new Error(`Action ${actionId} has no describerMode metadata to dispatch through`);

    const image = parameters?.image;
    if (!image) throw new Error("This action requires a captured image (parameters.image)");

    const description = await describer(image, mode, parameters?.query);
    return { description };
  };
}
