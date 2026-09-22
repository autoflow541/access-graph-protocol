# Security

AGP may describe actions that affect physical devices, accounts, finances, security systems, or other consequential systems.

The current prototype is **not** a security boundary. Implementations must preserve the underlying platform's authentication, authorization, safety interlocks, rate limits, and audit controls.

Do not treat an Access Profile as permission to perform an action. Do not allow accessibility adaptation to weaken authorization requirements.

Do not treat recognized speech, gaze, hand tracking, a switch event, an AI-generated intent, or possession of an XR device as authentication or authorization. Platform adapters must keep confirmation and authorization as separate gates and must delegate actual permission checks to the underlying service.

The WoT adapter never invokes forms or accepts credentials. Its default classification for unknown writes and device actions is medium risk with confirmation required. Implementers should replace that default only from trusted, explicit device metadata or a reviewed policy.

For the `physical_safety`, `security`, `financial`, and `destructive` action categories, the WoT adapter enforces a policy floor (`adapters/wot/index.js`, `CATEGORY_RISK_FLOOR` / `CATEGORY_CONFIRMATION_FLOOR`): a source-declared `x-agp-risk` or `x-agp-confirmation` can raise the effective requirement, but can never lower it below the floor for that category. A device cannot self-declare a physical-safety action as low-risk or no-confirmation. This does not extend to the category label itself — `x-agp-category` remains source-declared, so a device that mislabels a dangerous action as `device_control` currently evades the floor. Closing that requires category classification from a reviewed or allowlisted source rather than the device itself; see `docs/capability-matrix.md` (Finding G) and `ROADMAP.md`.

For the prototype, report security concerns privately to the project maintainer rather than publishing exploit details in a public issue.
