// A REAL describer: sends the captured frame to Claude's vision
// capability via the official Anthropic SDK and returns its actual
// description. Unlike every other describer/executor in this repo, this
// one makes a real, billed API call on every request. Only wired in by
// service/run-local-vision.mjs when ANTHROPIC_API_KEY is set; the
// default remains service/describers/simulated-describer.mjs.
import Anthropic from "@anthropic-ai/sdk";

const PROMPTS = {
  describe_scene:
    'You are an accessibility assistant for a blind or low-vision person who just asked "what am I looking at?". Describe this image in one or two clear, concrete sentences: what is in front of them, spatial layout if it matters, and anything that looks like it needs their attention (a step, an obstacle, a person). Do not mention that you are an AI or that this is a photo.',
  read_text:
    "You are an accessibility assistant for a blind or low-vision person who asked you to read what is in front of them. Read aloud, verbatim, any text visible in this image (a sign, label, document, screen). If there is no legible text, say so plainly.",
  describe_page:
    "You are an accessibility assistant reading a screenshot of a webpage for a blind or low-vision person, regardless of whether the page has any accessibility markup of its own. Describe, in a few clear sentences, what the page is and what a person could do on it: the main heading or purpose, the key interactive elements (search box, sign-in, primary buttons), and anything that looks broken or confusing visually. Do not mention that you are an AI or that this is a screenshot.",
  find_element:
    "You are an accessibility assistant reading a screenshot of a webpage for a blind or low-vision person who wants to find a specific thing on it, regardless of whether the page has any accessibility markup of its own. State plainly whether you can find it, and if so, describe where it is on the page (e.g. \"top right, next to the search box\") in a way that helps them locate or navigate to it. If you cannot find it, say so plainly rather than guessing."
};

export function createAnthropicDescriber({ apiKey = process.env.ANTHROPIC_API_KEY, model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5" } = {}) {
  if (!apiKey) throw new Error("createAnthropicDescriber requires an API key (ANTHROPIC_API_KEY)");
  const client = new Anthropic({ apiKey });

  return async function anthropicDescriber(imageBase64, mode, query) {
    const basePrompt = PROMPTS[mode] ?? PROMPTS.describe_scene;
    const prompt = query ? `${basePrompt}\n\nWhat to find: "${query}"` : basePrompt;
    const response = await client.messages.create({
      model,
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: imageBase64 } },
            { type: "text", text: prompt }
          ]
        }
      ]
    });
    const textBlock = response.content.find((block) => block.type === "text");
    return textBlock?.text ?? "No description was returned.";
  };
}
