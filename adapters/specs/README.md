# SPECS adapter

This adapter turns an AGP object and Access Profile into a deterministic view model for a SPECS Lens. It also provides a safety gate between voice/hand input and an underlying action executor.

It deliberately does not treat gaze, gestures, recognized speech, or possession of the glasses as authorization. Lens Studio remains responsible for rendering and device input; the connected service remains responsible for authentication, authorization, and physical safety.

```js
import { toSpecsView, SpecsActionSession } from "./index.js";

const view = toSpecsView(graph.get("hall-thermostat"), profile);
const session = new SpecsActionSession(graph, profile, invokeWotAction);

const request = session.request("hall-thermostat", "write_targettemperature");
// Render request.message in SPECS UI and speech, then collect confirmation.
```

See `examples/specs/` for the Lens Studio integration contract and current setup requirements.

## Validated proposals and expiry

Confirmation prompts include the target and bound parameter values. Validation
applies requiredness, numeric bounds and enum choices recursively. This reference
session rejects unknown fields and unsupported parameter shapes; it is not a
full JSON Schema validator. Set `sensitive: true` on a top-level parameter to
hide its entire value from confirmation text and speech.

An optional fourth constructor argument enables expiry:

```js
const session = new SpecsActionSession(graph, profile, executor, {
  proposalTtlMs: 120_000
});
```

Expiry rejects confirmation, authorization callbacks and execution with error
code `PROPOSAL_EXPIRED`. Offer an accessible fresh-review flow; do not renew
approval silently. Expiry defaults to disabled for existing clients and does
not replace authoritative server checks. Tests can supply `now: () => clock`.

See `docs/audit-2026-09-22.md` for remaining limitations and pilot criteria.
