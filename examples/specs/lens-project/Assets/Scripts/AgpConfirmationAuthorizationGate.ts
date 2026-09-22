import { Frame } from "SpectaclesUIKit.lspkg/Scripts/Components/Frame/Frame";
import { AgpActionButton } from "./AgpActionButton";
import { AgpSpecsSessionController, AgpSpecsSurface, SpecsActionState } from "./AgpSpecsSessionController";

/**
 * A dedicated, focused world-locked panel for the confirmation and
 * authorization gates, and the final execute step once both have passed. It
 * is a SEPARATE scene object from AgpSpecsPanelView on purpose (AGP-0.1
 * requirement: confirmation and authorization stay two distinct steps,
 * never collapsed into the action panel or into each other). Only one pair
 * of buttons is ever visible at a time, and it always maps 1:1 to the
 * session's current gate:
 *
 *   confirmation_required -> Confirm / Cancel
 *   authorization_required -> Authorize / Deny   (delegates to the
 *       underlying service per SECURITY.md — see AgpSpecsSessionController
 *       .authorizationFinished. THIS REFERENCE PROJECT'S authorize(true)
 *       is a stand-in for that real decision — see the "(Simulated)"
 *       label below. A real integration replaces AgpDeviceSource's
 *       in-Lens executor with one that calls an actual account/device
 *       authorization flow; nothing in this gate changes when it does.)
 *   ready -> Execute / Cancel   (both gates already passed; this step only
 *       runs the action, it never grants confirmation or authorization)
 *   anything else -> hidden
 *
 * Hand pinch and exact voice commands both call confirm()/authorize() on
 * this class; neither path is treated as authorization by itself, and the
 * gate never advances except through one of these explicit calls.
 */
@component
export class AgpConfirmationAuthorizationGate extends BaseScriptComponent implements AgpSpecsSurface {
  @input
  controller: AgpSpecsSessionController;

  @input
  frame: Frame;

  @input
  messageText: Text;

  @input
  primaryButtonPrefab: ObjectPrefab;

  @input
  secondaryButtonPrefab: ObjectPrefab;

  @input
  buttonContainer: SceneObject;

  private status: SpecsActionState | null = null;
  private primaryInstance: SceneObject | null = null;
  private secondaryInstance: SceneObject | null = null;

  onAwake() {
    this.controller.registerSurface(this);
    this.setVisible(false);
  }

  showPanel(_view: unknown): void {
    // Not a device-state surface; it only reacts to gate status via showPrompt.
  }

  showPrompt(message: string, status: SpecsActionState): void {
    this.status = status;
    this.messageText.text = message;
    this.render();
  }

  announce(_message: string): void {
    // Speech/captions are owned by AgpCaptionsAndSpeechOutput.
  }

  setBusy(busy: boolean): void {
    this.buttonContainer.enabled = !busy;
  }

  /** Called by hand-input or an exact "confirm"/"cancel" voice command. */
  confirm(accepted: boolean): void {
    if (this.status !== "confirmation_required") return;
    this.controller.confirm(accepted);
  }

  /** Called by hand-input or an exact "authorize"/"deny" voice command. */
  authorize(granted: boolean): void {
    if (this.status !== "authorization_required") return;
    this.controller.authorizationFinished(granted);
  }

  /** Called by hand-input or an exact "execute" voice command, only once both gates read "ready". */
  runExecute(): void {
    if (this.status !== "ready") return;
    void this.controller.execute();
  }

  /** Called by hand-input or an exact "cancel" voice command, valid for any visible gate state. */
  cancel(): void {
    if (this.status === "confirmation_required") return this.confirm(false);
    if (this.status === "ready") return this.controller.cancel();
  }

  private render(): void {
    this.clearButtons();
    const visible = this.status === "confirmation_required" || this.status === "authorization_required" || this.status === "ready";
    this.setVisible(visible);
    if (!visible) return;

    if (this.status === "confirmation_required") {
      this.primaryInstance = this.spawnButton(this.primaryButtonPrefab, "confirm", "Confirm", () => this.confirm(true));
      this.secondaryInstance = this.spawnButton(this.secondaryButtonPrefab, "cancel", "Cancel", () => this.cancel());
    } else if (this.status === "authorization_required") {
      this.primaryInstance = this.spawnButton(
        this.primaryButtonPrefab,
        "authorize",
        "Simulate authorization on paired device",
        () => this.authorize(true)
      );
      this.secondaryInstance = this.spawnButton(this.secondaryButtonPrefab, "deny", "Deny", () => this.authorize(false));
    } else if (this.status === "ready") {
      this.primaryInstance = this.spawnButton(this.primaryButtonPrefab, "execute", "Execute", () => this.runExecute());
      this.secondaryInstance = this.spawnButton(this.secondaryButtonPrefab, "cancel", "Cancel", () => this.cancel());
    }
  }

  private spawnButton(prefab: ObjectPrefab, actionId: string, label: string, onSelect: () => void): SceneObject {
    const instance = prefab.instantiate(this.buttonContainer);
    const button = instance.getComponent(AgpActionButton.getTypeName()) as AgpActionButton;
    button.configure(actionId, label, onSelect);
    return instance;
  }

  private clearButtons(): void {
    this.primaryInstance?.destroy();
    this.secondaryInstance?.destroy();
    this.primaryInstance = null;
    this.secondaryInstance = null;
  }

  private setVisible(visible: boolean): void {
    if (!this.frame) return;
    if (visible) this.frame.showVisual();
    else this.frame.hideVisual();
  }
}
