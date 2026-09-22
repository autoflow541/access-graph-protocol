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
  request(objectId: string, actionId: string): { status: SpecsActionState; message: string };
  confirm(accepted: boolean): { status: SpecsActionState; message: string };
  provideAuthorization(result: boolean): { status: SpecsActionState; message: string };
  execute(parameters?: Record<string, unknown>): Promise<{ status: SpecsActionState }>;
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

  selectAction(objectId: string, actionId: string): void {
    const result = this.session.request(objectId, actionId);
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

  async execute(parameters: Record<string, unknown> = {}): Promise<void> {
    this.surface.setBusy(true);
    try {
      const result = await this.session.execute(parameters);
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
