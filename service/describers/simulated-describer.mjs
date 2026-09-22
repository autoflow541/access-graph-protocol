// SIMULATION, not a real vision model: exists so the vision-assistant
// path is runnable and testable without any external AI service or API
// key, the same way simulatedAuthorizationProvider (execution-service.js)
// exists for authorization. Returns a fixed, clearly-labeled placeholder;
// never claims to have actually looked at the image.
const TASKS = {
  describe_scene: "describe the scene",
  read_text: "read any visible text aloud",
  describe_page: "describe what's on the page",
  find_element: "locate the requested element and describe where it is"
};

export async function simulatedDescriber(image, mode, query) {
  const length = typeof image === "string" ? image.length : 0;
  const task = TASKS[mode] ?? "describe the image";
  const queryNote = query ? ` (asked to find: "${query}")` : "";
  return `[Simulated description, no real vision model configured.] Received a ${length}-character image payload; a real describer would ${task}${queryNote} here.`;
}
