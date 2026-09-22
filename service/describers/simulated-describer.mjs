// SIMULATION, not a real vision model: exists so the vision-assistant
// path is runnable and testable without any external AI service or API
// key, the same way simulatedAuthorizationProvider (execution-service.js)
// exists for authorization. Returns a fixed, clearly-labeled placeholder;
// never claims to have actually looked at the image.
export async function simulatedDescriber(image, mode) {
  const length = typeof image === "string" ? image.length : 0;
  const task = mode === "read_text" ? "read any visible text aloud" : "describe the scene";
  return `[Simulated description, no real vision model configured.] Received a ${length}-character image payload; a real describer would ${task} here.`;
}
