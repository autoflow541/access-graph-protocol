# ARIA / HTML Adapter

This adapter projects common HTML and ARIA semantics into AGP 0.1 objects.

It is deliberately an **adapter**, not a replacement for ARIA or the browser accessibility tree.

```js
import { scanAria } from "./index.js";

const objects = scanAria(document);
```

Current coverage:

- buttons
- links
- text inputs and textareas
- checkboxes and radio buttons
- selects / combobox-like controls
- forms
- navigation landmarks
- audio/video
- explicit ARIA roles and common ARIA states

By default, form values are not serialized. `includeValues: true` can be used for non-password controls when a local application genuinely needs current values. Password values are never exposed by this adapter.
