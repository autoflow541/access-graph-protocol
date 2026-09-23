// Shared by every run-local-*.mjs dev entrypoint. AGP_DEV_TOKEN, when
// set, always wins (so a developer can pin a token across restarts or
// share one with a teammate on purpose). Without it, this used to fall
// back to the literal string "dev-token": a well-known default that
// works against any instance of this script, on any machine, forever,
// regardless of how the port is bound. A random token per process run
// means an unset AGP_DEV_TOKEN can never be guessed; the actual value is
// still printed to the console the caller needs it from.
export function resolveDevToken() {
  if (process.env.AGP_DEV_TOKEN) return process.env.AGP_DEV_TOKEN;
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}
