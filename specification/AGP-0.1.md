# Access Graph Protocol (AGP) 0.1

## Purpose

AGP lets a system expose **what exists, what state it is in, what can be done, and how risky an action is** without prescribing how the user must interact with it.

An Access Engine can combine an AGP graph with a user-controlled Access Profile and the current context to render speech, text, large controls, switch access, haptics, or another modality.

## Minimum object

```json
{
  "agp": "0.1",
  "id": "menu-button",
  "role": "button",
  "label": "Open menu",
  "state": { "enabled": true },
  "actions": [
    { "id": "activate", "label": "Activate", "risk": "none" }
  ]
}
```

## Core fields

- `agp` — protocol version.
- `id` — stable object identifier inside a graph.
- `role` — semantic role such as `button`, `door`, `sensor`, `drone`, or a custom role.
- `label` — human-readable name.
- `description` — optional concise description.
- `state` — current machine-readable values.
- `actions` — operations the object exposes.
- `inputs` / `outputs` — supported interaction modalities.
- `relationships` — edges to other objects.
- `events` — events that can be emitted.
- `source` — provenance/trust information.

## Actions

Every action has an `id`. It may include a label, parameters, risk, confirmation requirement, and authorization requirement.

Risk values:

- `none`
- `low`
- `medium`
- `high`
- `critical`

Accessibility preferences MUST NOT bypass authentication, authorization, interlocks, geofencing, emergency stops, or other safety controls.

Input recognition is not authorization. A gesture, gaze selection, switch event, voice match, AI interpretation, or possession of an interface device MUST NOT be treated as proof that an action is authorized. An adapter MUST preserve the underlying platform's authorization boundary.

## Access Profile

Profiles express **functional preferences**, not diagnoses. The user should control disclosure, and a client should disclose only what is needed for the current interaction.

Example:

```json
{
  "agp_profile": "0.1",
  "input": {
    "preferred": ["voice", "keyboard"],
    "avoid": ["fine_motor", "timed_input"]
  },
  "output": {
    "preferred": ["speech", "large_text"],
    "avoid": ["visual_only"]
  },
  "language": {
    "complexity": "plain",
    "response_length": "short"
  },
  "interaction": {
    "confirmation_for": ["financial", "physical_motion", "security"]
  }
}
```

## Trust

Clients SHOULD prefer sources in this order:

1. Native AGP
2. Trusted platform accessibility API
3. Structured device API
4. DOM/metadata
5. AI inference

Inferred information should carry provenance and confidence.

## Discovery

A web service MAY advertise AGP at:

`/.well-known/agp`

Local discovery may be transported over other systems such as Bluetooth, Matter, NFC, QR, or local network discovery. AGP defines semantics, not a mandatory transport.

## Platform adapters

An adapter translates an existing structured source into AGP and records its provenance in `source`. It does not replace the source standard.

- A W3C Web of Things adapter maps Thing Description affordances to AGP state, actions, and events. WoT remains responsible for forms, protocols, credentials, and invocation.
- A SPECS adapter maps AGP semantics and Access Profile preferences to XR presentation and interaction. SPECS/Lens Studio remains responsible for rendering, tracking, input, and platform permissions.

Adapters SHOULD use conservative risk defaults when a source action has no explicit safety classification. They MUST NOT silently classify an unknown physical or device-control action as harmless.

## Design principle

**Products expose meaning and capability. Users choose how to interact with that capability.**
