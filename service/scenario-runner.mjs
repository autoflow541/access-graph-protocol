// The scenario runner docs/audit-2026-09-22.md item 5 asks for:
// reproducible fault injection against a real ExecutionService, with a
// machine-readable pass/fail report. This is implementation testing of
// this repo's own fault handling, not an accessibility certification
// (the same caveat the audit item states, repeated here so a report
// never gets read as more than that): a "pass" means ExecutionService
// behaved the way this codebase says it should when a specific fault
// happens, nothing about whether the underlying device/backend is
// actually accessible.
//
// Runs against any already-constructed ExecutionService plus one action
// on it a caller is allowed to invoke twice (once to consume, once to
// prove replay/staleness): no mock executor required for four of the
// five scenarios, since they are ExecutionService-level policy, not
// executor behavior. The timeout scenario is the one exception --
// forcing a REAL dispatch to hang requires a second service instance
// built with a hanging executor, so it is opt-in via `buildHangingService`
// and reported "skipped," not silently omitted, when not supplied.
const SKIP = Symbol("scenario-skip");

export async function runScenarios({
  service,
  callerToken,
  objectId,
  actionId,
  parameters,
  badParameters,
  buildHangingService
}) {
  const results = [];
  const skip = (reason) => ({ [SKIP]: true, reason });
  const run = async (name, fn) => {
    try {
      const detail = await fn();
      if (detail && detail[SKIP]) {
        results.push({ scenario: name, status: "skipped", detail: detail.reason });
      } else {
        results.push({ scenario: name, status: "pass", detail: detail ?? null });
      }
    } catch (error) {
      results.push({ scenario: name, status: "fail", detail: error.message });
    }
  };

  await run("authorization_denial", async () => {
    const { stateVersion } = service.describe({ callerToken, objectId });
    const proposal = service.propose({ callerToken, objectId, actionId, parameters, stateVersion });
    service.confirm({ callerToken, proposalId: proposal.proposalId, accepted: true });
    const authorized = await service.authorize({ callerToken, proposalId: proposal.proposalId, evidence: { granted: false } });
    assertEqual(authorized.status, "denied", "authorize() with denied evidence must return status \"denied\"");
    await assertRejects(
      () => service.execute({ callerToken, proposalId: proposal.proposalId, requestId: randomId() }),
      "UNKNOWN_PROPOSAL",
      "a denied proposal must never be executable"
    );
    return "denied proposal correctly could not be executed";
  });

  await run("stale_state_at_execute", async () => {
    const { stateVersion } = service.describe({ callerToken, objectId });
    const staleProposal = service.propose({ callerToken, objectId, actionId, parameters, stateVersion });

    // Complete one full, independent dispatch of the same action to
    // advance state out from under the first proposal.
    const bump = service.propose({ callerToken, objectId, actionId, parameters, stateVersion });
    service.confirm({ callerToken, proposalId: bump.proposalId, accepted: true });
    if (bump.status !== "ready") {
      await service.authorize({ callerToken, proposalId: bump.proposalId, evidence: { granted: true } });
    }
    await service.execute({ callerToken, proposalId: bump.proposalId, requestId: randomId() });

    service.confirm({ callerToken, proposalId: staleProposal.proposalId, accepted: true });
    if (staleProposal.status !== "ready") {
      try {
        await service.authorize({ callerToken, proposalId: staleProposal.proposalId, evidence: { granted: true } });
      } catch {
        // Some services may already invalidate the proposal by now; the real assertion is below.
      }
    }
    await assertRejects(
      () => service.execute({ callerToken, proposalId: staleProposal.proposalId, requestId: randomId() }),
      "STALE_STATE",
      "executing a proposal bound to state that has since changed must be rejected as STALE_STATE"
    );
    return "a proposal bound to since-changed state was correctly rejected at execute()";
  });

  await run("duplicate_request_replay", async () => {
    const { stateVersion } = service.describe({ callerToken, objectId });
    const proposal = service.propose({ callerToken, objectId, actionId, parameters, stateVersion });
    service.confirm({ callerToken, proposalId: proposal.proposalId, accepted: true });
    if (proposal.status !== "ready") {
      await service.authorize({ callerToken, proposalId: proposal.proposalId, evidence: { granted: true } });
    }
    const requestId = randomId();
    const first = await service.execute({ callerToken, proposalId: proposal.proposalId, requestId });
    const second = await service.execute({ callerToken, proposalId: proposal.proposalId, requestId });
    assertEqual(JSON.stringify(second), JSON.stringify(first), "replaying the same requestId must return the original outcome unchanged");
    return "a replayed requestId returned the original outcome, not a second dispatch";
  });

  await run("malformed_schema_rejected", async () => {
    if (badParameters === undefined) return skip("no badParameters supplied");
    const { stateVersion } = service.describe({ callerToken, objectId });
    let threw = false;
    try {
      service.propose({ callerToken, objectId, actionId, parameters: badParameters, stateVersion });
    } catch {
      threw = true;
    }
    assertEqual(threw, true, "propose() with malformed parameters must throw, never silently coerce or drop them");
    return "malformed parameters were rejected before reaching the executor";
  });

  if (buildHangingService) {
    await run("dispatch_timeout", async () => {
      const hanging = await buildHangingService();
      const { stateVersion } = hanging.service.describe({ callerToken: hanging.callerToken, objectId: hanging.objectId });
      const proposal = hanging.service.propose({
        callerToken: hanging.callerToken, objectId: hanging.objectId, actionId: hanging.actionId,
        parameters: hanging.parameters, stateVersion
      });
      hanging.service.confirm({ callerToken: hanging.callerToken, proposalId: proposal.proposalId, accepted: true });
      if (proposal.status !== "ready") {
        await hanging.service.authorize({ callerToken: hanging.callerToken, proposalId: proposal.proposalId, evidence: { granted: true } });
      }
      const result = await hanging.service.execute({ callerToken: hanging.callerToken, proposalId: proposal.proposalId, requestId: randomId() });
      assertEqual(result.status, "unknown", "a dispatch that outlasts dispatchTimeoutMs must resolve \"unknown,\" never \"failed\" or \"succeeded\"");
      return "a hung dispatch correctly resolved as unknown, not failed or succeeded";
    });
  } else {
    results.push({
      scenario: "dispatch_timeout",
      status: "skipped",
      detail: "no buildHangingService() provided: forcing a real dispatch to hang requires a service built with a hanging executor"
    });
  }

  const summary = results.reduce(
    (acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }),
    { pass: 0, fail: 0, skipped: 0 }
  );
  return { results, summary };
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message} (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`);
}

async function assertRejects(fn, expectedCode, message) {
  try {
    await fn();
  } catch (error) {
    if (error.code !== expectedCode) throw new Error(`${message} (got code ${error.code}, expected ${expectedCode})`);
    return;
  }
  throw new Error(`${message} (did not throw)`);
}

function randomId() {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
