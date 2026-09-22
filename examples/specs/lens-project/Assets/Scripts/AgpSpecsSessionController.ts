import { SpecsActionSession, toSpecsView } from "./AgpCore/AgpSpecsAdapter.js";
import { AgpDeviceSource } from "./AgpDeviceSource";

export type SpecsActionState =
  | "confirmation_required"
  | "authorization_required"
  | "ready"
  | "executed"
  | "cancelled"
  | "denied";

export interface AgpSpecsSurface {
  showPanel(view: unknown): void;
  showPrompt(message: string, state: SpecsActionState): void;
  announce(message: string): void;
  setBusy(busy: boolean): void;
}

/**
 * Lens-side equivalent of examples/specs/AgpSpecsController.ts. It contains
 * no device APIs and no authorization logic of its own: confirmation and
 * authorization stay two separate gates enforced by SpecsActionSession, and
 * this controller never resolves either gate itself. Hand input, voice
 * input, and gaze/targeting all call the SAME selectAction/confirm/authorize
 * entry points below; none of them is treated as authorization on its own
 * (AGP-0.1 SECURITY.md).
 */
@component
export class AgpSpecsSessionController extends BaseScriptComponent {
  @input
  deviceSource: AgpDeviceSource;

  private session: SpecsActionSession;
  private surfaces: AgpSpecsSurface[] = [];

  onAwake() {
    this.createEvent("OnStartEvent").bind(() => this.start());
  }

  private start() {
    const graph = this.deviceSource.graph;
    const profile = this.deviceSource.profile;
    this.session = new SpecsActionSession(graph, profile, async (objectId, actionId, parameters) => {
      const state = this.deviceSource.applySimulatedWrite(actionId, parameters);
      this.renderPanel();
      return state;
    });
    this.renderPanel();
  }

  /** Panel/caption/speech/hand/voice surfaces register here to receive updates. */
  registerSurface(surface: AgpSpecsSurface) {
    this.surfaces.push(surface);
  }

  currentObject() {
    return this.deviceSource.graph.get(this.deviceSource.deviceObjectId);
  }

  currentView() {
    return toSpecsView(this.currentObject(), this.deviceSource.profile);
  }

  /**
   * Entry point for a hand-input trigger OR an exact-match voice command.
   * Neither is authorization. `parameters` (if the action needs any) are
   * validated and bound to the proposal here: AgpSpecsSessionController
   * never lets confirmation happen against one set of parameters and
   * execution happen against another.
   */
  selectAction(actionId: string, parameters: Record<string, unknown> = {}): void {
    const result = this.session.request(this.deviceSource.deviceObjectId, actionId, parameters);
    this.broadcastPrompt(result.message, result.status as SpecsActionState);
  }

  /** A dedicated, separate confirmation step. Must follow a distinct explicit input, never auto-advance from selectAction. */
  confirm(accepted: boolean): void {
    const result = this.session.confirm(accepted);
    this.broadcastPrompt(result.message, result.status as SpecsActionState);
  }

  /**
   * A dedicated, separate authorization step. This demo simulates the
   * underlying service's authorization decision: a real integration must
   * replace `granted` with the result of that service's own auth flow
   * (paired-device approval, account confirmation, PIN, etc.), never with
   * anything derived from voice/gaze/hand/possession-of-glasses signals.
   */
  authorizationFinished(granted: boolean): void {
    const result = this.session.provideAuthorization(granted);
    this.broadcastPrompt(result.message, result.status as SpecsActionState);
  }

  /** Runs the already-bound, already-confirmed, already-authorized proposal. Takes no new parameters. */
  async execute(): Promise<void> {
    this.setBusy(true);
    try {
      const result = await this.session.execute();
      this.broadcastPrompt("Action completed.", result.status as SpecsActionState);
      this.surfaces.forEach((surface) => surface.announce("Action completed."));
    } finally {
      this.setBusy(false);
    }
  }

  cancel(): void {
    const result = this.session.cancel();
    this.broadcastPrompt(result.message, result.status as SpecsActionState);
  }

  private renderPanel() {
    const view = this.currentView();
    this.surfaces.forEach((surface) => surface.showPanel(view));
  }

  private broadcastPrompt(message: string, status: SpecsActionState) {
    this.renderPanel();
    // adapters/specs/index.js's message text stays platform-neutral: it
    // doesn't know whether it's backed by a simulation or a real
    // device/account service. This reference project's authorization
    // executor IS a simulation (see authorizationFinished above), so the
    // disclosure is added here, once, so every surface (visual panel,
    // gate, captions, speech) gets the identical disclosed text rather
    // than only whichever surface happened to add its own label.
    const disclosed = status === "authorization_required" ? `(Simulated) ${message}` : message;
    this.surfaces.forEach((surface) => {
      surface.showPrompt(disclosed, status);
      surface.announce(disclosed);
    });
  }

  private setBusy(busy: boolean) {
    this.surfaces.forEach((surface) => surface.setBusy(busy));
  }
}
