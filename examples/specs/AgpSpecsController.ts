export type SpecsActionState =
  | "confirmation_required"
  | "authorization_required"
  | "ready"
  | "executed"
  | "cancelled"
  | "denied";

export interface SpecsSurface {
  showPanel(view: unknown): void;
  showPrompt(message: string, state: SpecsActionState): void;
  announce(message: string): void;
  setBusy(busy: boolean): void;
}

export interface AgpSpecsSession {
  /**
   * Parameters are validated and bound to the proposal here, at request
   * time — not supplied later at execute(). This is what makes
   * confirmation mean something: the thing a user confirms is the same
   * thing that runs, because there is nowhere else for the parameters to
   * come from by the time execute() is called.
   */
  request(objectId: string, actionId: string, parameters?: Record<string, unknown>): { status: SpecsActionState; message: string };
  confirm(accepted: boolean): { status: SpecsActionState; message: string };
  provideAuthorization(result: boolean): { status: SpecsActionState; message: string };
  /**
   * Runs the bound proposal. Does not take new parameters — an
   * implementation should reject (not silently accept) any attempt to
   * pass parameters that differ from what was bound at request().
   */
  execute(): Promise<{ status: SpecsActionState }>;
  cancel(): { status: SpecsActionState; message: string };
}

/**
 * Bind this controller to SPECS UI Kit callbacks. It contains no device APIs,
 * so authorization and physical execution stay in the platform/service layer.
 */
export class AgpSpecsController {
  constructor(
    private readonly surface: SpecsSurface,
    private readonly session: AgpSpecsSession
  ) {}

  selectAction(objectId: string, actionId: string, parameters: Record<string, unknown> = {}): void {
    const result = this.session.request(objectId, actionId, parameters);
    this.surface.showPrompt(result.message, result.status);
    this.surface.announce(result.message);
  }

  confirm(accepted: boolean): void {
    const result = this.session.confirm(accepted);
    this.surface.showPrompt(result.message, result.status);
    this.surface.announce(result.message);
  }

  authorizationFinished(granted: boolean): void {
    const result = this.session.provideAuthorization(granted);
    this.surface.showPrompt(result.message, result.status);
    this.surface.announce(result.message);
  }

  async execute(): Promise<void> {
    this.surface.setBusy(true);
    try {
      const result = await this.session.execute();
      this.surface.showPrompt("Action completed.", result.status);
      this.surface.announce("Action completed.");
    } finally {
      this.surface.setBusy(false);
    }
  }

  cancel(): void {
    const result = this.session.cancel();
    this.surface.showPrompt(result.message, result.status);
  }
}
