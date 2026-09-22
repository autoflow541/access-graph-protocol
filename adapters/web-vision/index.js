// Models "describe or locate something on a webpage, from a screenshot"
// as an AGP object: adapters/vision-assistant/'s pattern applied to a
// browser tab instead of a camera. The deliberate point of this adapter
// is that it does NOT read the page's DOM, ARIA tree, or accessibility
// markup at all (that is adapters/aria/index.js's job, and it depends on
// the page having cooperated). This adapter works identically whether
// the underlying page has excellent ARIA or none at all, because it
// never looks at the markup, only a screenshot: the AI layer this repo
// keeps returning to, applied to a site that was never fixed and never
// will be, not only to ones that already comply.
import { AGP_VERSION } from "../../sdk/javascript/agp.js";

const IMAGE_PARAMETER = {
  type: "string",
  description: "A screenshot of the current page or viewport, base64-encoded.",
  required: true
};

export function createWebPageObject({ id, label = "Web Page", description } = {}) {
  if (!id) throw new Error("createWebPageObject requires an id");
  return {
    agp: AGP_VERSION,
    id,
    role: "web_page",
    label,
    description:
      description ??
      "Describes or locates elements on a webpage from a screenshot, regardless of whether the page itself has any accessibility markup. Uses Auto-Flow's AI layer, not the page's own ARIA tree.",
    state: {},
    actions: [
      {
        id: "describe_page",
        label: "What's on this page?",
        risk: "none",
        confirmation: false,
        category: "information",
        parameters: { image: IMAGE_PARAMETER },
        authorization: { required: false },
        metadata: { describerMode: "describe_page" }
      },
      {
        id: "find_element",
        label: "Find something on the page",
        risk: "none",
        confirmation: false,
        category: "information",
        parameters: {
          image: IMAGE_PARAMETER,
          query: { type: "string", description: "What to look for, e.g. \"the submit button\".", required: true }
        },
        authorization: { required: false },
        metadata: { describerMode: "find_element" }
      }
    ],
    // "screen_capture" is a distinct input channel from vision-assistant's
    // "camera": negotiateCapabilities() treats them as different
    // requirements without any change on its side, which is the point.
    inputs: ["screen_capture"],
    outputs: ["speech", "text"],
    source: { type: "ai_inference", confidence: 1, adapter: "web-vision-0.1" },
    metadata: {
      privacy:
        "Each request sends one screenshot to the configured describer. A page can contain a person's private account data, messages, or other content visible on screen; see SECURITY.md."
    }
  };
}
