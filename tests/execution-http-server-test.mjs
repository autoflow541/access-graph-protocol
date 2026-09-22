import assert from "node:assert/strict";
import { AccessGraph } from "../sdk/javascript/agp.js";
import { ExecutionService } from "../service/execution-service.js";
import { createExecutionHttpServer } from "../service/http-server.js";

const graph = new AccessGraph([
  { id: "lamp-01", role: "light", label: "Lamp", state: { on: false }, actions: [
    { id: "turn_on", label: "Turn on", risk: "low", confirmation: false, authorization: { required: true } }
  ] }
]);

let calls = 0;
const service = new ExecutionService({
  graph,
  executor: async (_objectId, actionId, parameters) => { calls += 1; return { actionId, parameters }; },
  allowedCallers: new Set(["good-token"]),
  proposalTtlMs: 5000,
  dispatchTimeoutMs: 2000,
  requestRetentionMs: 5000
});

const server = createExecutionHttpServer(service);
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;

function call(method, path, { token, body } = {}) {
  return fetch(`${base}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  }).then(async (response) => ({ status: response.status, body: await response.json() }));
}

// --- CORS: a preflight OPTIONS request gets a real 204 with the headers a
// browser needs to allow the follow-up request; a real response (not just
// the preflight) also carries Access-Control-Allow-Origin, since a
// browser enforces CORS on every response, not only the preflight.
{
  const preflight = await fetch(`${base}/devices/lamp-01`, {
    method: "OPTIONS",
    headers: { "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "Authorization" }
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), "*");
  assert.ok(preflight.headers.get("access-control-allow-headers")?.includes("Authorization"));

  const real = await fetch(`${base}/devices/lamp-01`, { headers: { Authorization: "Bearer good-token" } });
  assert.equal(real.headers.get("access-control-allow-origin"), "*");
}

// --- No/invalid token -> 401, real network round trip, not just in-process
{
  const noAuth = await call("GET", "/devices/lamp-01");
  assert.equal(noAuth.status, 401);
  const badToken = await call("GET", "/devices/lamp-01", { token: "wrong" });
  assert.equal(badToken.status, 401);
}

// --- Unknown route -> 404
{
  const missing = await call("GET", "/nope", { token: "good-token" });
  assert.equal(missing.status, 404);
}

// --- inspect() over real HTTP: resolved per-action policy, not just the raw object
{
  const inspected = await call("GET", "/devices/lamp-01/inspect", { token: "good-token" });
  assert.equal(inspected.status, 200);
  const turnOn = inspected.body.actions.find((a) => a.id === "turn_on");
  assert.equal(turnOn.authorizationRequired, true);
  assert.equal(turnOn.blocked, false);
  assert.equal(inspected.body.object.id, "lamp-01");
}

// --- Full lifecycle over real HTTP: describe -> propose -> confirm -> authorize -> execute
const described = await call("GET", "/devices/lamp-01", { token: "good-token" });
assert.equal(described.status, 200);
const stateVersion = described.body.stateVersion;

const proposed = await call("POST", "/devices/lamp-01/actions/turn_on/propose", {
  token: "good-token",
  body: { parameters: {}, stateVersion }
});
assert.equal(proposed.status, 200);
const proposalId = proposed.body.proposalId;

const confirmed = await call("POST", `/proposals/${proposalId}/confirm`, { token: "good-token", body: { accepted: true } });
assert.equal(confirmed.status, 200);
assert.equal(confirmed.body.status, "authorization_required");

const authorized = await call("POST", `/proposals/${proposalId}/authorize`, { token: "good-token", body: { evidence: { granted: true } } });
assert.equal(authorized.status, 200);
assert.equal(authorized.body.status, "ready");

const executed = await call("POST", `/proposals/${proposalId}/execute`, { token: "good-token", body: { requestId: "http-req-1" } });
assert.equal(executed.status, 200);
assert.equal(executed.body.status, "succeeded");
assert.equal(calls, 1);

// --- Duplicate requestId over a real second HTTP request does not dispatch twice
const replay = await call("POST", `/proposals/${proposalId}/execute`, { token: "good-token", body: { requestId: "http-req-1" } });
assert.equal(replay.status, 200);
assert.deepEqual(replay.body, executed.body);
assert.equal(calls, 1, "a replayed request id over a real second HTTP call must not dispatch twice");

// --- Stale state version -> 409 over real HTTP
const staleAttempt = await call("POST", "/devices/lamp-01/actions/turn_on/propose", {
  token: "good-token",
  body: { parameters: {}, stateVersion: stateVersion } // the version from BEFORE the successful execute above
});
assert.equal(staleAttempt.status, 409);
assert.equal(staleAttempt.body.code, "STALE_STATE");

// --- Malformed JSON body -> 400, not a crash
const malformed = await fetch(`${base}/devices/lamp-01/actions/turn_on/propose`, {
  method: "POST",
  headers: { Authorization: "Bearer good-token", "Content-Type": "application/json" },
  body: "{not json"
});
assert.equal(malformed.status, 400);

server.close();
console.log("Execution HTTP server test passed (real sockets: auth, lifecycle, dedup, staleness)");
