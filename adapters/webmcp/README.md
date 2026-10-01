# WebMCP adapter

Exposes AGP actions as [WebMCP](https://github.com/webmachinelearning/webmcp) tools (`document.modelContext.registerTool()`), so a browser-integrated AI agent can discover and invoke them the same way it would any other tool a page registers.

```js
import { AccessGraph } from "../../sdk/javascript/agp.js";
import { SpecsActionSession } from "../specs/index.js";
import { agpGraphToWebMcpTools, registerAgpToolsWithWebMcp } from "./index.js";

const session = new SpecsActionSession(graph, profile, invokeDeviceAction);
const tools = agpGraphToWebMcpTools(session);

const controller = new AbortController();
await registerAgpToolsWithWebMcp(tools, { signal: controller.signal });
// controller.abort() later to unregister, per the WebMCP explainer's lifecycle pattern.
```

## The one rule that matters here

A WebMCP tool built by this adapter can **never** complete an action that requires confirmation or authorization — not on the first call, not on a retry, not ever, through the tool alone. It reports that status back to the agent and stops.

Completing a gated action requires a real person, on the same page, reading `session.pending` (populated by the tool's own first call) and calling `session.confirm()` / `session.provideAuthorization()` from an actual UI interaction — the same model `adapters/specs/` already uses for a SPECS Lens. Once that happens, the agent calling the same tool again resumes and completes the now-ready proposal; it does not need to, and cannot, drive the confirmation step itself.

This is deliberate, not a missing feature. See `docs/prior-art-and-positioning.md`'s MCP and Apple App Intents sections for why: an AI-supplied or device-supplied signal is not permission, and a confirmation step an input path can silently route around is worse than no confirmation step. v0.1 trades off a lower-friction path for gated actions in exchange for having no new bypass surface at all.

## What gets exposed

Only actions whose parameter schema `agpParametersToInputSchema()` can fully represent as JSON Schema become WebMCP tools — an action with an `unsupported` parameter shape is skipped, not registered with a guessed schema (same reasoning as `adapters/wot/index.js`'s audit finding D).

## Status

Built against the WebMCP explainer as of 2026 (`document.modelContext.registerTool()`, Chrome 146 Early Preview). No browser ships a stable implementation yet; this adapter has not been tested against a real `document.modelContext` — see `registerAgpToolsWithWebMcp`'s feature-detection, which is what every current environment actually exercises.
