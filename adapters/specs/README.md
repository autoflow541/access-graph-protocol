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
