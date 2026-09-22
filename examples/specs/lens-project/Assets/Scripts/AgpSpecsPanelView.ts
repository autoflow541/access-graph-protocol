import { Frame } from "SpectaclesUIKit.lspkg/Scripts/Components/Frame/Frame";
import { AgpActionButton } from "./AgpActionButton";
import { AgpSpecsSessionController, AgpSpecsSurface, SpecsActionState } from "./AgpSpecsSessionController";

// Text.size is an em-square height (Lens Studio default is 48, range 2-800).
const STANDARD_TEXT_SIZE = 48;
const LARGE_TEXT_SIZE = 72;

/**
 * World-locked accessible control panel. One AGP action = one button,
 * built from adapters/specs/index.js `toSpecsView(...)` — the same view
 * model the browser demo (examples/smart-device/) renders as HTML. This
 * class only applies presentation flags the adapter already computed
 * (largeControls / highContrast / reduceMotion / oneStepAtATime); it makes
 * no accessibility decisions of its own.
 *
 * Only zero-parameter actions are shown as buttons (e.g. eco mode, emergency
 * shutdown). An action that needs an input value (e.g. the thermostat's
 * write_targettemperature) is shown as read-only state, not as a button —
 * this Lens does not yet ship a slider/dial input surface for it. See
 * ROADMAP.md, "Lens Studio SPECS project" follow-ups.
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

    const rawActions = this.controller.currentObject()?.actions ?? [];
    const parameterized = new Set(rawActions.filter((action: any) => action.parameters).map((action: any) => action.id));
    const selectable = view.actions.filter((action: any) => !action.id.startsWith("read_") && !parameterized.has(action.id));
    const visible = view.presentation.layout === "focused" ? this.oneAtATime(selectable) : selectable;
    this.renderActionButtons(visible);
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

  private renderActionButtons(actions: any[]): void {
    this.buttons.forEach((button) => button.destroy());
    this.buttons = [];

    for (const action of actions) {
      const instance = this.actionButtonPrefab.instantiate(this.actionListContainer);
      const button = instance.getComponent(AgpActionButton.getTypeName()) as AgpActionButton;
      const labelText = action.confirmation ? `${action.label} · confirm` : action.label;
      button.configure(action.id, labelText, () => this.controller.selectAction(action.id));
      this.buttons.push(instance);
    }
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
