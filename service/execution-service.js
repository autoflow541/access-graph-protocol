import { AccessGraph } from "../sdk/javascript/agp.js";
import { validateParameters } from "../adapters/specs/index.js";

export const OUTCOME = Object.freeze({
  SUCCEEDED: "succeeded",
  FAILED: "failed",
  UNKNOWN: "unknown"
});

/**
 * Server-side authority for AGP actions.
 *
 * This is NOT SpecsActionSession running on a server: it is a genuinely
 * separate trust boundary. SpecsActionSession (adapters/specs/index.js)
 * is a client-side UX gate: it makes confirmation/authorization visible
 * and structured, but a client can only ever assert its own state to
 * itself. ExecutionService never trusts a caller's assertion that
 * something was confirmed or authorized: every mutating call re-derives
 * its own answer from state this class owns: the AccessGraph passed in
 * at construction (the reviewed device/action allowlist: if an
 * objectId/actionId isn't in this graph, AccessGraph.resolveAction()
 * throws, so there is no separate allowlist data structure to keep in
 * sync), a caller-token allowlist, and a per-device state version.
 *
 * Known gap, stated plainly rather than glossed over: `authorize()`
 * delegates to an injectable `authorizationProvider`, and the *default*
 * provider (`simulatedAuthorizationProvider`, exported below) just trusts
 * whatever `evidence.granted` the caller supplies: there is no real
 * authorization backend for it to call. This is a real architectural
 * improvement over the client-only model (authorization is now a
 * server-owned, pluggable decision point a real deployment swaps in one
 * place, not scattered across every client), but it does not by itself
 * close "device authorization is simulated": see docs/audit-2026-09-22.md
 * and SECURITY.md. Do not read the presence of this class as having
 * solved that.
 *
 * In-memory only: proposals, the caller allowlist, per-device state
 * versions, and the request-id dedup log all live in process memory and
 * are lost on restart. This is a stated limitation, not a claim of
 * restart-safe replay protection: see service/README.md.
 */
export class ExecutionService {
  constructor({
    graph,
    executor,
    allowedCallers,
    profile = {},
    authorizationProvider = simulatedAuthorizationProvider,
    now = Date.now,
    proposalTtlMs = 2 * 60_000,
    dispatchTimeoutMs = 10_000,
    requestRetentionMs = 5 * 60_000
  }) {
    if (!(graph instanceof AccessGraph)) throw new Error("ExecutionService requires an AccessGraph");
    if (typeof executor !== "function") throw new Error("ExecutionService requires an executor function");
    if (!(allowedCallers instanceof Set) || allowedCallers.size === 0) {
      throw new Error("ExecutionService requires a non-empty allowedCallers Set: there is no default-allow caller");
    }
    if (typeof authorizationProvider !== "function") throw new Error("ExecutionService requires an authorizationProvider function");
    if (!Number.isFinite(proposalTtlMs) || proposalTtlMs <= 0) throw new Error("Invalid proposalTtlMs");
    if (!Number.isFinite(dispatchTimeoutMs) || dispatchTimeoutMs <= 0) throw new Error("Invalid dispatchTimeoutMs");
    if (!Number.isFinite(requestRetentionMs) || requestRetentionMs <= 0) throw new Error("Invalid requestRetentionMs");

    this.graph = graph;
    this.executor = executor;
    this.profile = profile;
    this.authorizationProvider = authorizationProvider;
    this.now = now;
    this.proposalTtlMs = proposalTtlMs;
    this.dispatchTimeoutMs = dispatchTimeoutMs;
    this.requestRetentionMs = requestRetentionMs;

    this._allowedCallers = new Set(allowedCallers);
    this._proposals = new Map();
    this._stateVersions = new Map();
    this._requestLog = new Map();

    for (const object of this.graph.list()) this._stateVersions.set(object.id, 1);
  }

  /** The AGP object and the state version a caller must bind a proposal to. */
  describe({ callerToken, objectId }) {
    this._authenticate(callerToken);
    const object = this.graph.get(objectId);
    if (!object) throw serviceError("UNKNOWN_DEVICE", `Unknown device: ${objectId}`);
    return { object, stateVersion: this._stateVersions.get(objectId) };
  }

  /**
   * Everything describe() returns, plus a per-action explanation: the
   * server-resolved confirmation/authorization verdict (not just the
   * action's own declared flags: `AccessGraph.resolveAction` also folds
   * in this service's Access Profile, e.g. a category-triggered
   * confirmation floor a raw action object wouldn't show on its own),
   * where its risk/category classification came from
   * (`metadata.category_trust`, "reviewed" vs "declared"; see the WoT
   * adapter's category-trust gap fix), and whether the action can be
   * proposed at all right now. The one thing this service can determine
   * without side effects is a permanently-unsupported parameter schema
   * (the same check `propose()` would fail on); it does not model
   * state-dependent "not applicable right now" blocking, because nothing
   * in this codebase computes that yet: see docs/audit-2026-09-22.md.
   * Exists for the accessible task inspector (examples/execution-client),
   * so it can explain "why" without having to create and discard a
   * proposal just to find out.
   */
  inspect({ callerToken, objectId }) {
    this._authenticate(callerToken);
    const object = this.graph.get(objectId);
    if (!object) throw serviceError("UNKNOWN_DEVICE", `Unknown device: ${objectId}`);

    const actions = object.actions.map((action) => {
      const resolved = this.graph.resolveAction(objectId, action.id, this.profile);
      const unsupportedPath = firstUnsupportedParameterPath(action.parameters);
      const blockedReason = unsupportedPath
        ? `Parameter "${unsupportedPath}" has a schema this adapter cannot validate, so this action cannot be proposed.`
        : null;
      return {
        id: action.id,
        label: action.label,
        risk: action.risk ?? "none",
        category: action.category ?? null,
        categoryTrust: action.metadata?.category_trust ?? null,
        parameters: action.parameters ?? null,
        confirmation: Boolean(action.confirmation),
        requiresConfirmation: resolved.requiresConfirmation,
        authorizationRequired: resolved.authorizationRequired,
        blocked: blockedReason !== null,
        blockedReason
      };
    });

    return { object, stateVersion: this._stateVersions.get(objectId), actions };
  }

  /**
   * Creates an immutable, server-issued proposal. `stateVersion` must
   * match what this service currently reports for the device (from
   * describe()): a stale value is rejected rather than silently
   * accepted, so a client can't propose against state it no longer
   * accurately observed.
   */
  propose({ callerToken, objectId, actionId, parameters = {}, stateVersion }) {
    this._authenticate(callerToken);

    const currentVersion = this._stateVersions.get(objectId);
    if (currentVersion === undefined) throw serviceError("UNKNOWN_DEVICE", `Unknown device: ${objectId}`);
    if (stateVersion !== currentVersion) {
      throw serviceError(
        "STALE_STATE",
        `State has changed since it was observed (observed version ${stateVersion}, current ${currentVersion}). Re-read state and submit a new proposal.`
      );
    }

    const resolved = this.graph.resolveAction(objectId, actionId, this.profile);
    const validatedParameters = validateParameters(resolved.action, parameters);

    const proposalId = randomId("proposal");
    const proposal = {
      proposalId,
      callerToken,
      objectId,
      actionId,
      parameters: validatedParameters,
      stateVersion: currentVersion,
      confirmed: !resolved.requiresConfirmation,
      authorized: !resolved.authorizationRequired,
      expiresAt: this.now() + this.proposalTtlMs
    };
    this._proposals.set(proposalId, proposal);

    return { proposalId, status: status(proposal), action: resolved.action, object: resolved.object };
  }

  /** A dedicated, separate confirmation step: see adapters/specs/index.js for why this must stay distinct from authorize(). */
  confirm({ callerToken, proposalId, accepted }) {
    const proposal = this._requireProposal(callerToken, proposalId);
    if (!accepted) {
      this._proposals.delete(proposalId);
      return { proposalId, status: "cancelled" };
    }
    proposal.confirmed = true;
    return { proposalId, status: status(proposal) };
  }

  /**
   * A dedicated, separate authorization step, resolved by
   * `this.authorizationProvider`: never by confirmation, never by the
   * caller having reached this call at all (that only proves it passed
   * `_authenticate`, not that this specific action is authorized).
   */
  async authorize({ callerToken, proposalId, evidence }) {
    const proposal = this._requireProposal(callerToken, proposalId);
    const granted = await this.authorizationProvider({ proposal: { ...proposal }, callerToken, evidence });
    if (!granted) {
      this._proposals.delete(proposalId);
      return { proposalId, status: "denied" };
    }
    proposal.authorized = true;
    return { proposalId, status: status(proposal) };
  }

  /**
   * Dispatches the proposal exactly once. `requestId` is a
   * caller-generated idempotency key: replaying the same requestId within
   * `requestRetentionMs` returns the original outcome without invoking
   * the executor again: verified in tests by asserting the executor's
   * call count, not just the returned status. A dispatch that exceeds
   * `dispatchTimeoutMs` resolves as `OUTCOME.UNKNOWN`: the executor may
   * still complete later, but this service does not know that, and does
   * not guess.
   */
  async execute({ callerToken, proposalId, requestId }) {
    if (!requestId) throw serviceError("MISSING_REQUEST_ID", "execute() requires a client-supplied requestId for duplicate-dispatch protection");
    this._sweepExpiredRequests();

    const cached = this._requestLog.get(requestId);
    if (cached) return cached.outcome;

    const proposal = this._requireProposal(callerToken, proposalId);
    const currentStatus = status(proposal);
    if (currentStatus !== "ready") throw serviceError("NOT_READY", `Proposal is not ready: ${currentStatus}`);
    if (proposal.stateVersion !== this._stateVersions.get(proposal.objectId)) {
      this._proposals.delete(proposalId);
      throw serviceError("STALE_STATE", "State changed since this proposal was made. Re-read state and submit a new proposal.");
    }

    // One proposal, one dispatch attempt: remove it before the
    // (possibly slow) dispatch so a second execute() call for the same
    // proposal (different requestId) can't race a second attempt in.
    this._proposals.delete(proposalId);

    const outcome = await this._dispatch(proposal);
    this._requestLog.set(requestId, { outcome, expiresAt: this.now() + this.requestRetentionMs });
    return outcome;
  }

  /** Cancellation before dispatch: distinct from stopping an operation already underway, which this service does not attempt. */
  cancel({ callerToken, proposalId }) {
    const proposal = this._requireProposal(callerToken, proposalId);
    this._proposals.delete(proposalId);
    return { proposalId, status: "cancelled" };
  }

  async _dispatch(proposal) {
    let timeoutHandle;
    const timeout = new Promise((resolve) => {
      timeoutHandle = setTimeout(
        () => resolve({ status: OUTCOME.UNKNOWN, proposalId: proposal.proposalId, reason: "Dispatch timed out; the device outcome is unknown, not failed." }),
        this.dispatchTimeoutMs
      );
    });
    const attempt = (async () => {
      try {
        const result = await this.executor(proposal.objectId, proposal.actionId, proposal.parameters);
        this._stateVersions.set(proposal.objectId, (this._stateVersions.get(proposal.objectId) ?? 0) + 1);
        return { status: OUTCOME.SUCCEEDED, proposalId: proposal.proposalId, result };
      } catch (error) {
        return { status: OUTCOME.FAILED, proposalId: proposal.proposalId, reason: error.message };
      }
    })();
    const outcome = await Promise.race([attempt, timeout]);
    clearTimeout(timeoutHandle);
    return outcome;
  }

  _sweepExpiredRequests() {
    const nowMs = this.now();
    for (const [id, entry] of this._requestLog) {
      if (entry.expiresAt <= nowMs) this._requestLog.delete(id);
    }
  }

  _authenticate(callerToken) {
    if (!this._allowedCallers.has(callerToken)) throw serviceError("UNAUTHENTICATED", "Caller is not authorized to use this execution service");
  }

  _requireProposal(callerToken, proposalId) {
    this._authenticate(callerToken);
    const proposal = this._proposals.get(proposalId);
    if (!proposal) throw serviceError("UNKNOWN_PROPOSAL", "Unknown or already-resolved proposal");
    if (proposal.callerToken !== callerToken) throw serviceError("FORBIDDEN", "This proposal belongs to a different caller");
    if (this.now() >= proposal.expiresAt) {
      this._proposals.delete(proposalId);
      throw serviceError("PROPOSAL_EXPIRED", "Proposal expired. Review and submit a new request.");
    }
    return proposal;
  }
}

// SIMULATION, not a real authorization check: exists so this service is
// runnable and testable without a real authorization backend, the same
// way the browser/Lens demo executors are simulated devices. It trusts
// evidence.granted from the caller, which provides no real security. A
// real deployment MUST supply its own authorizationProvider that calls an
// actual account/device authorization system (paired-device approval,
// OAuth introspection, a PIN check against a real backend, ...): see
// docs/audit-2026-09-22.md and SECURITY.md, which both name this as the
// primary remaining gap between this service and a real deployment.
export async function simulatedAuthorizationProvider({ evidence }) {
  return evidence?.granted === true;
}

function status(proposal) {
  if (!proposal.confirmed) return "confirmation_required";
  if (!proposal.authorized) return "authorization_required";
  return "ready";
}

function serviceError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

// Recursively walks a resolved action's parameter schema looking for a
// node adapters/specs/index.js's validateValue would reject outright
// (`type: "unsupported"`, or a schema object explicitly marked
// `unsupported`): the one structural reason an action can never be
// proposed, independent of what parameters a caller supplies. Returns a
// dotted/bracketed path to the first such node, or null.
function firstUnsupportedParameterPath(parameters, prefix = "") {
  if (!parameters) return null;
  for (const [name, schema] of Object.entries(parameters)) {
    const found = unsupportedInSchema(schema, prefix ? `${prefix}.${name}` : name);
    if (found) return found;
  }
  return null;
}

function unsupportedInSchema(schema, path) {
  if (!schema || schema.unsupported || schema.type === "unsupported") return path;
  if (schema.type === "object" && schema.properties) {
    for (const [key, sub] of Object.entries(schema.properties)) {
      const found = unsupportedInSchema(sub, `${path}.${key}`);
      if (found) return found;
    }
  }
  if (schema.type === "array" && schema.items) {
    return unsupportedInSchema(schema.items, `${path}[]`);
  }
  return null;
}

function randomId(prefix) {
  const random = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${random}`;
}
