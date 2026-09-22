// A generic ExecutionService executor for adapters/vision-assistant/
// objects: sends the request's one image parameter through a pluggable
// `describer` function and returns its text as the result. Nothing here
// is camera-vendor- or model-specific, matching how wot-executor.mjs is
// generic over any WoT-sourced object rather than one device.
export function createVisionExecutor(describer) {
  return async function visionExecutor(_objectId, actionId, parameters) {
    if (actionId !== "describe_scene" && actionId !== "read_text") {
      throw new Error(`Unsupported vision-assistant action: ${actionId}`);
    }
    const image = parameters?.image;
    if (!image) throw new Error("This action requires a captured image (parameters.image)");
    const mode = actionId === "read_text" ? "read_text" : "describe_scene";
    const description = await describer(image, mode);
    return { description };
  };
}
