# Next milestone

Start with `docs/audit-2026-09-22.md`. Run `npm test`.

## Build an execution service before more adapters

- Keep device invocation simulated until service checks are independently tested.
- Authenticate a caller and enforce a reviewed allowlist server-side.
- Bind confirmation/authorization responses to proposal ID, target, action, parameters, expiry, and relevant state version.
- Recheck permissions at dispatch, record request IDs, and specify replay retention/restart behavior.
- Distinguish accepted, pending, succeeded, denied, failed, cancelled and unknown outcomes.
- Integrate a browser workflow that can explain denial/expiry and recover using keyboard controls.

## Still open

WoT schema coverage, cross-discovery stable IDs, UI versus executor confirmation consistency, service enforcement, and Lens Studio/hardware verification. See the audit for acceptance criteria and feature priorities.
