// Models "describe what a camera currently sees, on request" as an AGP
// object. This is the concrete shape of the "AI layer" the rest of AGP
// has been building toward: not a smart-glasses feature, a protocol
// object any camera source (phone, webcam, glasses, anything) can expose
// the same way. There is no external description format to read here
// (unlike adapters/wot/ or adapters/aria/), so this adapter constructs
// the object directly instead of projecting one from a native source.
//
// Both actions are informational, no-risk, no-confirmation,
// no-authorization by design: the real-world use case this exists for
// (a blind or low-vision person asking "what am I looking at?" or "read
// this to me," repeatedly, throughout the day) breaks if every question
// needs a confirmation dialog. AGP's risk model already distinguishes
// "reads information" from "changes something in the world"
// (adapters/wot/index.js's read_/write_ split predates this file); this
// adapter is that same distinction applied to a camera instead of a
// device property.
import { AGP_VERSION } from "../../sdk/javascript/agp.js";

const IMAGE_PARAMETER = {
  type: "string",
  description: "A single still frame from the camera, base64-encoded.",
  required: true
};

export function createVisionAssistantObject({ id, label = "Vision Assistant", description } = {}) {
  if (!id) throw new Error("createVisionAssistantObject requires an id");
  return {
    agp: AGP_VERSION,
    id,
    role: "vision_assistant",
    label,
    description:
      description ??
      "Describes what a camera currently sees or reads visible text aloud, on request. Works with any camera source, not one vendor's hardware.",
    state: {},
    actions: [
      {
        id: "describe_scene",
        label: "What am I looking at?",
        risk: "none",
        confirmation: false,
        category: "information",
        parameters: { image: IMAGE_PARAMETER },
        authorization: { required: false }
      },
      {
        id: "read_text",
        label: "Read the text in view",
        risk: "none",
        confirmation: false,
        category: "information",
        parameters: { image: IMAGE_PARAMETER },
        authorization: { required: false }
      }
    ],
    // "camera" is the one input this needs: negotiateCapabilities()
    // (sdk/javascript/agp.js) already knows how to compare that against
    // a client session and explain the gap if it's missing, with no
    // changes needed on that side for this new media type.
    inputs: ["camera"],
    outputs: ["speech", "text"],
    source: { type: "ai_inference", confidence: 1, adapter: "vision-assistant-0.1" },
    metadata: {
      privacy:
        "Each request sends one still frame to the configured describer. A frame can contain bystanders who never consented to being described; see SECURITY.md."
    }
  };
}
