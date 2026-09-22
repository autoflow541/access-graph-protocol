# Building the AGP Lens in Lens Studio

This folder is real, runnable Lens Studio source — the TypeScript that
executes on-device — organized the way Lens Studio expects a project's
`Assets/` folder to look. It is **not** a double-click-to-open `.esproj`
package. Lens Studio projects store scene composition (`.scene`), materials
(`.lsmat`), and prefabs (`.oprfb`) as binary, editor-authored data — even
Snap's own official sample repositories (e.g. `Snapchat/Spectacles-Sample`)
commit that data through Git LFS rather than hand-authoring it, because it
isn't meant to be text-edited. So the honest split is:

- **Everything here** (`Assets/Scripts/*.ts`, `Assets/Data/*.json`) is
  complete, tested-against-real-APIs source you import as-is.
- **Scene composition** — dragging prefabs into a hierarchy and wiring
  Inspector fields — is roughly 15 minutes of one-time editor work, listed
  step-by-step below. This is normal for any Lens Studio project, not a
  limitation specific to this one.

## Requirements

- [Lens Studio 5.22 or later](https://ar.snap.com/download) targeting **SPECS 27** hardware.
- [Spectacles Interaction Kit (SIK)](https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/get-started) — install via **Window > Asset Library > Spectacles > Spectacles Interaction Kit**.
- **Spectacles UI Kit** — install via the same Asset Library (search "Spectacles UI Kit").
- A Spectacles device or the Lens Studio Spectacles Preview Panel for testing hand and voice input (ASR is Spectacles-only; it does not run in the desktop-only preview).

Official references used to write the scripts in this folder:

- [Spectacles Lens Project Setup](https://developers.snap.com/spectacles/get-started/start-building/spectacles-lens-setup)
- [Get Started with Interaction Kit](https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/get-started)
- [ASR Module](https://developers.snap.com/spectacles/about-spectacles-features/apis/asr-module) (Spectacles speech-to-text; VoiceMLModule is no longer supported on Spectacles)
- [Text To Speech](https://developers.snap.com/lens-studio/4.55.1/references/templates/audio/text-to-speech)
- [TypeScript scripting](https://developers.snap.com/lens-studio/features/scripting/typescript)
- [Lens Studio project structure / source control](https://developers.snap.com/lens-studio/lens-studio-workflow/advanced/source-control)

## 1. Create the project

1. Open Lens Studio, choose **Spectacles > Base Template** (or Default Project, then enable Spectacles under **Project Settings > Lens Works On**).
2. Set the Preview Panel target to **SPECS 27**.
3. Install Spectacles Interaction Kit and Spectacles UI Kit from the Asset Library. Note the exact folder names Lens Studio gives them under `Assets/` (usually `SpectaclesInteractionKit.lspkg` and `SpectaclesUIKit.lspkg`) — if your installed version uses different names, update the two import paths noted below to match.
4. On the Camera object, add a **Device Tracking** component set to **World** tracking mode (required for SIK hand tracking and world-locked placement).
5. Drag `Assets/SpectaclesInteractionKit.lspkg/Prefabs/SpectaclesInteractionKit.prefab` into the scene root.

## 2. Import this repo's scripts

Copy this whole `Assets/` folder's contents (`Scripts/`, `Data/`) into your
Lens Studio project's `Assets/` folder — or point Lens Studio's Asset
Browser at this folder directly. `Assets/Scripts/AgpCore/` holds the
**unmodified** AGP SDK and adapters (`agp.js`, `AgpSpecsAdapter.js`,
`AgpWotAdapter.js`), copied byte-for-byte from `sdk/javascript/` and
`adapters/` by `npm run sync:lens` at the repo root — see
`tests/lens-assets-sync-test.mjs`, which fails the repo's test suite if
these ever drift from the source they're generated from. Do not hand-edit
files in `AgpCore/`; edit the source under `sdk/` or `adapters/` and re-run
the sync script instead.

Once Lens Studio compiles the scripts (check **Window > TypeScript Status**
for errors — the most common one is a wrong `.lspkg` folder name in the two
imports below), you're ready to build the scene.

## 3. Scene hierarchy and Inspector wiring

Build this hierarchy (indentation = parenting). Names are suggestions; what
matters is which component goes where and which fields you assign.

```
AgpApp                              (empty SceneObject)
├─ AgpDeviceSource                  <- AgpDeviceSource.ts
├─ AgpSpecsSessionController        <- AgpSpecsSessionController.ts
│    deviceSource: AgpApp/AgpDeviceSource
├─ VoiceInput                       <- AgpVoiceCommandBinding.ts
│    controller: AgpApp/AgpSpecsSessionController
│    gate: ActionPanel/ConfirmAuthGate (below)
│    listeningIndicator: optional SceneObject
├─ ActionPanel                      (world-locked, ~0.5-1m in front of camera)
│    Frame component (SpectaclesUIKit)
│    AgpSpecsPanelView.ts
│      controller: AgpApp/AgpSpecsSessionController
│      frame: this object's Frame component
│      titleText / summaryText / statusBanner: child Text objects
│      actionListContainer: child SceneObject actions attach under
│      actionButtonPrefab: see "Action button prefab" below
│      parameterSliderPrefab: see "Parameter slider prefab" below
│      busyIndicator: a small spinner/label SceneObject, disabled by default
│      highContrastOverlay: a bordered/high-contrast background SceneObject, disabled by default
│    └─ ConfirmAuthGate             (separate focused panel, hidden until needed)
│         Frame component (SpectaclesUIKit)
│         AgpConfirmationAuthorizationGate.ts
│           controller: AgpApp/AgpSpecsSessionController
│           frame: this object's Frame component
│           messageText: child Text object
│           primaryButtonPrefab / secondaryButtonPrefab: see below
│           buttonContainer: child SceneObject the two gate buttons attach under
│    └─ CaptionsAndSpeech
│         AgpCaptionsAndSpeechOutput.ts
│           controller: AgpApp/AgpSpecsSessionController
│           captionText: a Text object, large and high-contrast by default
│           ttsModule: a Text To Speech Module asset (Resources > Text To Speech Module)
│           speechAudio: an Audio Component to play synthesized speech through
```

`VoiceInput`'s `gate` field must point at the same `ConfirmAuthGate` object
used above — voice and hand input drive the identical gate instance, so
neither path can advance a state the other can't see.

### Action button prefab

Create one prefab (e.g. `AgpActionButton.prefab`) with:

- A visual (a SpectaclesUIKit `RoundButton`, or any button-shaped visual — the interaction logic below does not depend on which one you pick).
- A SIK `Interactable` component (drag in from SpectaclesInteractionKit, or use the one a RoundButton prefab already includes if your installed version wires one automatically).
- A child `Text` object for the label.
- `AgpActionButton.ts`, with `interactable` pointed at the Interactable above and `label` pointed at the child Text.

Use this same prefab for both `actionButtonPrefab` (on `AgpSpecsPanelView`)
and `primaryButtonPrefab` / `secondaryButtonPrefab` (on
`AgpConfirmationAuthorizationGate`) — one prefab, reused everywhere a
selectable control is needed.

### Parameter slider prefab

For an action whose only parameter is a single bounded numeric `value`
(e.g. the thermostat's `write_targettemperature`, `minimum: 16, maximum:
28`) — create one prefab (e.g. `AgpParameterSlider.prefab`) with:

- A SpectaclesUIKit `Slider` component (drag in from SpectaclesUIKit's
  Asset Library entry, or its own prefab if it ships one — check the
  Asset Browser for the exact name your installed version uses).
- A child `Text` object showing the current value while dragging.
- `AgpParameterSlider.ts`, with `slider` pointed at the Slider component
  and `valueLabel` at the child Text. Set `unitSuffix` (e.g. `"°C"`) if
  you want it appended to the displayed number.

`AgpSpecsPanelView` only uses this prefab for an action whose parameter
schema is exactly `{ value: { type: "number" | "integer", minimum, maximum } }`
— any other parameter shape (multiple properties, an array, no declared
bounds) is still shown as read-only state, not a slider; see
`isSliderParameter` in `AgpSpecsPanelView.ts`. The slider only proposes an
action (`selectAction`) once dragging finishes (`Slider.onFinished`), not
on every intermediate value, mirroring the browser demo's range input
(`examples/smart-device/app.js`, which requests on `"change"`, not
`"input"`).

### Import paths to double check

`AgpSpecsPanelView.ts` and `AgpConfirmationAuthorizationGate.ts` import
SpectaclesUIKit's `Frame` from:

```ts
import { Frame } from "SpectaclesUIKit.lspkg/Scripts/Components/Frame/Frame";
```

`AgpActionButton.ts` imports SIK's `Interactable` from:

```ts
import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable";
```

`AgpParameterSlider.ts` imports SpectaclesUIKit's `Slider` from:

```ts
import { Slider } from "SpectaclesUIKit.lspkg/Scripts/Components/Slider/Slider";
```

(SpectaclesInteractionKit also ships an older `Slider` class, at
`SpectaclesInteractionKit.lspkg/Components/UI/Slider/Slider` — its own
docs mark it deprecated in favor of SpectaclesUIKit's. `AgpParameterSlider.ts`
deliberately imports the SpectaclesUIKit one.)

If Lens Studio's TypeScript Status panel reports any of these as
unresolved, your installed package folder has a different name — open the
Asset Browser, find the actual folder, and update the import path to
match.

## 4. What each accessibility preference actually does

Nothing in the scripts decides accessibility behavior on its own — every
flag below is read from `toSpecsView(...)` (`adapters/specs/index.js`),
which already resolves it from the loaded Access Profile
(`Assets/Data/default-access-profile.json`, editable in
`AgpDeviceSource.accessProfileJson`):

| Access Profile input | `view.presentation` field | Applied in |
|---|---|---|
| `output.preferred: ["large_text"]` | `scale: "large"` | `AgpSpecsPanelView` — `Text.size` 72 instead of 48 |
| `output.preferred: ["high_contrast"]` | `highContrast` | `AgpSpecsPanelView` — enables `highContrastOverlay` |
| `output.preferred: ["reduced_motion"]` or `output.avoid: ["motion"]` | `reduceMotion` | `AgpSpecsPanelView` — disables `Frame.autoShowHide` tweening |
| `output.preferred: ["captions"]` or `output.avoid: ["audio_only"]` | `captions` | `AgpCaptionsAndSpeechOutput` — shows `captionText` |
| `output.preferred: ["speech"]` | `speech` | `AgpCaptionsAndSpeechOutput` — synthesizes via `ttsModule` |
| `interaction.one_step_at_a_time: true` | `layout: "focused"` | `AgpSpecsPanelView` — shows exactly one action button at a time |

## 5. Voice commands

`AgpVoiceCommandBinding` recognizes **exact phrases only** — it normalizes
case/whitespace but never fuzzy-matches, per `matchSpecsIntent` in
`adapters/specs/index.js` and `tests/specs-adapter-test.mjs` ("Free-form
voice input must not guess an action"):

- An AGP action's `id`, `label`, or a declared `metadata.voice_aliases`
  entry — selects that action (same gate as hand input).
- `"confirm"` / `"cancel"` — during the confirmation step.
- `"authorize"` / `"deny"` — during the authorization step.
- `"execute"` / `"cancel"` — during the ready step.

Anything else is ignored. An ambiguous match (two actions with the same
label) is also ignored, with a log line, rather than guessed.

## 6. Testing

- **Desktop Preview**: verify the panel renders, hand-pinch (simulated) trips `AgpActionButton`, and the confirmation → authorization → ready sequence runs for "Emergency shutdown". ASR does not run in desktop preview.
- **On-device (Spectacles)**: additionally verify the exact-phrase voice commands and real hand tracking.
- **Core logic**: `npm test` at the repo root runs the same `SpecsActionSession` / `toSpecsView` / `matchSpecsIntent` code this Lens imports (via `Assets/Scripts/AgpCore/`, kept in sync by `npm run sync:lens`), so the safety-gate behavior is already covered without a headset.

## Known gaps (see ROADMAP.md)

- The slider control (`AgpParameterSlider`) only handles a single bounded
  numeric parameter. An action with a multi-property object parameter, an
  array parameter, or an enum-only string parameter is still shown as
  read-only state, not an input control — there is no dial, text-entry, or
  multi-field form control yet.
- A slider has no voice-driven equivalent yet — `AgpVoiceCommandBinding`
  only selects zero-parameter actions and gate controls by exact phrase;
  setting a numeric value by voice (e.g. "set target temperature to
  twenty one") is not implemented.
- Not yet device-tested on physical Spectacles hardware — this source has
  not been verified running on-device. The `SpectaclesUIKit.Slider` API
  `AgpParameterSlider.ts` uses was verified against Snap's published
  scripting API reference, not against a running Lens.
