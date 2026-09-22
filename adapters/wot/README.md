# W3C Web of Things adapter

This adapter maps a Web of Things Thing Description (TD) into AGP semantics. WoT continues to own discovery, forms, protocols, credentials, and invocation. AGP adds an accessibility-oriented view of the Thing.

```js
import { thingDescriptionToAgp } from "./index.js";

const object = thingDescriptionToAgp(thingDescription, {
  propertyValues: { temperature: 21 }
});
```

## Safety defaults

- Read operations default to `risk: none`.
- Property writes and WoT actions default to `risk: medium` and require confirmation.
- Any TD security scheme other than `nosec` maps to `authorization.required: true`.
- The adapter never invokes a WoT form or handles credentials.
- A TD may declare `x-agp-risk`, `x-agp-confirmation`, `x-agp-category`, `x-agp-role`, `x-agp-inputs`, and `x-agp-outputs` extensions.

Unknown device actions are deliberately not assumed safe. Implementations must still enforce the underlying Thing's authorization and safety rules.
