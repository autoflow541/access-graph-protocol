import { createServer } from "node:http";

// Maps ExecutionService's error codes to HTTP status codes. An error with
// no .code (e.g. a raw validation error from adapters/specs/index.js's
// validateParameters, or AccessGraph.resolveAction's "Unknown action")
// is treated as a 400: the request itself was malformed, not a
// state/authorization problem.
const STATUS_BY_CODE = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  UNKNOWN_DEVICE: 404,
  UNKNOWN_PROPOSAL: 404,
  STALE_STATE: 409,
  NOT_READY: 409,
  PROPOSAL_EXPIRED: 410,
  MISSING_REQUEST_ID: 400,
  PAYLOAD_TOO_LARGE: 413
};

/**
 * A thin, dependency-free HTTP surface over ExecutionService: no
 * framework, only Node's built-in `http` module, matching this repo's
 * dependency-free SDK/adapters. It does no policy of its own: every
 * request is translated into exactly one ExecutionService call, and every
 * thrown error is translated back into an HTTP status from its `.code`.
 * The service instance is authoritative; this file is just transport.
 *
 * CORS is permissive by default (`corsOrigin: "*"`) so a browser example
 * on a different local port can call it directly: this is a local
 * development convenience, not a production posture. A real deployment
 * MUST set `corsOrigin` to its actual client origin(s); it is a
 * constructor option specifically so that choice is explicit, not an
 * accident of the default. This never widens who can act: CORS only
 * controls which *browser* origins may read the response: authentication
 * (the `allowedCallers` check in ExecutionService) still runs on every
 * request regardless of origin, so a wildcard CORS origin does not by
 * itself grant a browser any capability it doesn't already have from a
 * valid caller token.
 */
const DEFAULT_MAX_BODY_BYTES = 25 * 1024 * 1024; // 25MB: generous enough for a base64-encoded PDF or photo, still bounded.

export function createExecutionHttpServer(service, { corsOrigin = "*", maxBodyBytes = DEFAULT_MAX_BODY_BYTES } = {}) {
  return createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", corsOrigin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      const url = new URL(req.url, "http://localhost");
      const token = bearerToken(req);
      const body = await readJsonBody(req, maxBodyBytes);

      let result;
      let deviceMatch;
      let proposalMatch;

      if (req.method === "GET" && (deviceMatch = url.pathname.match(/^\/devices\/([^/]+)\/inspect$/))) {
        result = service.inspect({ callerToken: token, objectId: decodeURIComponent(deviceMatch[1]) });
      } else if (req.method === "GET" && (deviceMatch = url.pathname.match(/^\/devices\/([^/]+)$/))) {
        result = service.describe({ callerToken: token, objectId: decodeURIComponent(deviceMatch[1]) });
      } else if (req.method === "POST" && (deviceMatch = url.pathname.match(/^\/devices\/([^/]+)\/actions\/([^/]+)\/propose$/))) {
        result = service.propose({
          callerToken: token,
          objectId: decodeURIComponent(deviceMatch[1]),
          actionId: decodeURIComponent(deviceMatch[2]),
          parameters: body.parameters,
          stateVersion: body.stateVersion
        });
      } else if (req.method === "POST" && (proposalMatch = url.pathname.match(/^\/proposals\/([^/]+)\/confirm$/))) {
        result = service.confirm({ callerToken: token, proposalId: decodeURIComponent(proposalMatch[1]), accepted: body.accepted });
      } else if (req.method === "POST" && (proposalMatch = url.pathname.match(/^\/proposals\/([^/]+)\/authorize$/))) {
        result = await service.authorize({ callerToken: token, proposalId: decodeURIComponent(proposalMatch[1]), evidence: body.evidence });
      } else if (req.method === "POST" && (proposalMatch = url.pathname.match(/^\/proposals\/([^/]+)\/execute$/))) {
        result = await service.execute({ callerToken: token, proposalId: decodeURIComponent(proposalMatch[1]), requestId: body.requestId });
      } else if (req.method === "POST" && (proposalMatch = url.pathname.match(/^\/proposals\/([^/]+)\/cancel$/))) {
        result = service.cancel({ callerToken: token, proposalId: decodeURIComponent(proposalMatch[1]) });
      } else {
        sendJson(res, 404, { error: "Not found" });
        return;
      }

      sendJson(res, 200, result);
    } catch (error) {
      if (error instanceof SyntaxError) {
        sendJson(res, 400, { error: "Malformed JSON body" });
        return;
      }
      const httpStatus = STATUS_BY_CODE[error.code] ?? 400;
      sendJson(res, httpStatus, { error: error.message, code: error.code ?? null });
    }
  });
}

function bearerToken(req) {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer (.+)$/);
  return match ? match[1] : null;
}

// Bounded by maxBodyBytes: an unbounded `Buffer.concat` over every
// chunk a client cares to send is an unauthenticated memory-exhaustion
// vector, since this runs before bearerToken()/service auth reject
// anything. Tracks cumulative length as chunks arrive (not just the
// final size), so buffering stops the moment the limit is crossed
// instead of only being caught after the whole oversized body has
// already been held in memory. Deliberately does NOT destroy the
// socket: doing so mid-request tears down the connection before a
// proper 413 response can be written, so the client sees a raw
// connection reset instead of an HTTP error. The remainder of an
// oversized body is still received off the wire (so the socket drains
// normally) but is no longer appended to `chunks`, which is what
// actually closes the memory-exhaustion vector.
function readJsonBody(req, maxBodyBytes) {
  return new Promise((resolve, reject) => {
    if (req.method !== "POST") {
      resolve({});
      return;
    }
    const chunks = [];
    let received = 0;
    let rejected = false;
    req.on("data", (chunk) => {
      if (rejected) return;
      received += chunk.length;
      if (received > maxBodyBytes) {
        rejected = true;
        const error = new Error(`Request body exceeds the ${maxBodyBytes}-byte limit`);
        error.code = "PAYLOAD_TOO_LARGE";
        reject(error);
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (rejected) return;
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) });
  res.end(body);
}
