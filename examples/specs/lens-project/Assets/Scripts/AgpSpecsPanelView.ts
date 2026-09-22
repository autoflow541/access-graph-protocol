import { Frame } from "SpectaclesUIKit.lspkg/Scripts/Components/Frame/Frame";
import { AgpActionButton } from "./AgpActionButton";
import { AgpParameterSlider } from "./AgpParameterSlider";
import { AgpSpecsSessionController, AgpSpecsSurface, SpecsActionState } from "./AgpSpecsSessionController";

// Text.size is an em-square height (Lens Studio default is 48, range 2-800).
const STANDARD_TEXT_SIZE = 48;
const LARGE_TEXT_SIZE = 72;

/**
 * World-locked accessible control panel. One AGP action = one control
 * (button or slider), built from adapters/specs/index.js
 * `toSpecsView(...)` — the same view model the browser demo
 * (examples/smart-device/) renders as HTML. This class only applies
 * presentation flags the adapter already computed (largeControls /
 * highContrast / reduceMotion / oneStepAtATime); it makes no accessibility
 * decisions of its own.
 *
 * A zero-parameter action (e.g. eco mode, emergency shutdown) renders as a
 * button. An action whose only parameter is a single numeric `value` with
 * both `minimum` and `maximum` declared (the shape a WoT property write
 * like write_targettemperature produces — adapters/wot/index.js
 * schemaParameter) renders as a slider (AgpParameterSlider), matching the
 * browser demo's range-input control. Any other parameterized shape (an
 * object with multiple properties, an array, an enum-only string, …) is
 * still shown as read-only state rather than a half-built input control —
 * this narrower slider support does not claim to handle every possible
 * parameter shape.
 */
@component
export class AgpSpecsPanelView extends BaseScriptComponent implements AgpSpecsSurface {
  @input
  controller: AgpSpecsSessionController;

  @input
  @hint("World-locked SpectaclesUIKit Frame that contains the panel content.")
  frame: Frame;

  @input
  titleText: Text;

  @input
  summaryText: Text;

  @input
  @hint("Parent SceneObject that action buttons are instantiated under.")
  actionListContainer: SceneObject;

  @input
  @hint("Prefab carrying an AgpActionButton component (SIK Interactable + a Text label).")
  actionButtonPrefab: ObjectPrefab;

  @input
  @hint("Prefab carrying an AgpParameterSlider component (SpectaclesUIKit Slider + a Text value label), for a single numeric bounded parameter.")
  parameterSliderPrefab: ObjectPrefab;

  @input
  statusBanner: Text;

  @input
  busyIndicator: SceneObject;

  @input
  @hint("High-contrast border/background swapped in for the Access Profile output.high_contrast preference. Build its material as a solid, saturated color against a dark or light field per your project's contrast guidelines.")
  highContrastOverlay: SceneObject;

  private buttons: SceneObject[] = [];
  private oneStepIndex = 0;

  onAwake() {
    this.controller.registerSurface(this);
  }

  showPanel(view: any): void {
    this.titleText.text = view.title;
    this.summaryText.text = view.summary;
    this.applyPresentation(view.presentation);

    const rawById = new Map((this.controller.currentObject()?.actions ?? []).map((action: any) => [action.id, action]));
    const items = view.actions
      .filter((action: any) => !action.id.startsWith("read_"))
      .map((action: any) => ({ action, raw: rawById.get(action.id) }))
      .filter(({ raw }: any) => !raw?.parameters || isSliderParameter(raw.parameters));

    const visible = view.presentation.layout === "focused" ? this.oneAtATime(items) : items;
    this.renderItems(visible, view.state);
  }

  showPrompt(message: string, status: SpecsActionState): void {
    this.statusBanner.text = message;
    this.statusBanner.sceneObject.enabled = status !== "executed" && status !== "cancelled" && status !== "denied";
  }

  announce(_message: string): void {
    // Visual panel does not speak; AgpCaptionsAndSpeechOutput owns that surface.
  }

  setBusy(busy: boolean): void {
    this.busyIndicator.enabled = busy;
    this.actionListContainer.enabled = !busy;
  }

  private oneAtATime(actions: any[]): any[] {
    if (actions.length === 0) return actions;
    this.oneStepIndex = Math.min(this.oneStepIndex, actions.length - 1);
    return [actions[this.oneStepIndex]];
  }

  advanceOneStep(): void {
    this.oneStepIndex += 1;
    this.showPanel(this.controller.currentView());
  }

  private renderItems(items: { action: any; raw: any }[], state: { key: string; label: string; value: unknown }[]): void {
    this.buttons.forEach((instance) => instance.destroy());
    this.buttons = [];

    for (const { action, raw } of items) {
      const instance = raw?.parameters ? this.renderSlider(action, raw, state) : this.renderButton(action);
      this.buttons.push(instance);
    }
  }

  private renderButton(action: any): SceneObject {
    const instance = this.actionButtonPrefab.instantiate(this.actionListContainer);
    const button = instance.getComponent(AgpActionButton.getTypeName()) as AgpActionButton;
    const labelText = action.confirmation ? `${action.label} · confirm` : action.label;
    button.configure(action.id, labelText, () => this.controller.selectAction(action.id));
    return instance;
  }

  private renderSlider(action: any, raw: any, state: { key: string; label: string; value: unknown }[]): SceneObject {
    const instance = this.parameterSliderPrefab.instantiate(this.actionListContainer);
    const slider = instance.getComponent(AgpParameterSlider.getTypeName()) as AgpParameterSlider;
    const valueParam = raw.parameters.value;
    const stateEntry = state.find((entry) => entry.key === raw.metadata?.wot_name);
    const initialValue = typeof stateEntry?.value === "number" ? stateEntry.value : valueParam.minimum;
    slider.configure(valueParam.minimum, valueParam.maximum, initialValue, undefined, (committed) => {
      this.controller.selectAction(action.id, { value: committed });
    });
    return instance;
  }

  private applyPresentation(presentation: any): void {
    const scale = presentation.scale === "large" ? LARGE_TEXT_SIZE : STANDARD_TEXT_SIZE;
    for (const text of [this.titleText, this.summaryText, this.statusBanner]) {
      if (text) text.size = scale;
    }

    if (this.highContrastOverlay) this.highContrastOverlay.enabled = Boolean(presentation.highContrast);

    // Reduced motion: skip the Frame's show/hide tween instead of playing it.
    this.frame.autoShowHide = !presentation.reduceMotion;
    if (presentation.reduceMotion) this.frame.showVisual();
  }
}

// Narrow, deliberate scope: only a single "value" parameter of type
// number/integer with both minimum and maximum declared gets a slider.
// Anything else (an object with multiple properties, an array, an
// enum-only string, a missing bound) is left as read-only state rather
// than guessing at a control for a shape this class doesn't handle.
function isSliderParameter(parameters: Record<string, any>): boolean {
  const names = Object.keys(parameters);
  if (names.length !== 1 || names[0] !== "value") return false;
  const value = parameters.value;
  return (value.type === "number" || value.type === "integer") && value.minimum !== undefined && value.maximum !== undefined;
}
