# AGP on SPECS

This directory is the porting contract for an AGP-powered SPECS (Spectacles)
Lens — one client among several AGP already supports (see the ARIA and WoT
adapters, and the website/drone/smart-device demos at the repo root). The
tested adapter in `adapters/specs/` is platform-neutral so its safety
behavior can be validated without a headset. `AgpSpecsController.ts` is the
minimal, platform-agnostic controller contract; `lens-project/` is its real
Lens Studio realization.

## `lens-project/`

Real, runnable Lens Studio TypeScript source — targeting Lens Studio 5.22+,
SPECS 27, Spectacles UI Kit, and the Spectacles Interaction Kit — built on
top of the same `SpecsActionSession` / `toSpecsView` / `matchSpecsIntent`
logic already covered by `tests/specs-adapter-test.mjs`. It loads an AGP
object and Access Profile, renders world-locked controls, and connects the
simulated WoT thermostat (`examples/smart-device/`) as its first device.

See [`lens-project/SETUP.md`](lens-project/SETUP.md) for the full scene
hierarchy and Inspector wiring guide, including why scene composition still
needs ~15 minutes of one-time editor work (Lens Studio scenes are binary,
editor-authored data, the same as in Snap's own sample repositories — this
isn't a limitation specific to this project).

## Lens binding contract

- Render `toSpecsView(...)` as a world-locked or hand-accessible panel.
- Route button or exact voice-alias selection to `session.request(...)`.
- Show confirmation as a separate focused step.
- Delegate authorization to the underlying account/device service.
- Call `session.execute(...)` only after both gates report `ready`.
- Keep captions available for all speech and honor reduced-motion output preferences.

`lens-project/` is real source, not a packaged, double-click-to-open Lens
Studio project — see `lens-project/SETUP.md` for exactly what that means.
On-device testing requires Lens Studio and Spectacles device access and has
not been performed; see `ROADMAP.md`.
