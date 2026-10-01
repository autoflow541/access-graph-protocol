import { AccessGraph, effectiveRisk, renderControls } from "../sdk/javascript/agp.js";

// Before this change, CATEGORY_RISK_FLOOR / CATEGORY_CONFIRMATION_FLOOR
// lived only inside adapters/wot/index.js: a natively-registered action
// (no adapter at all, the path every other adapter -- ARIA, future
// WebMCP -- also goes through) had NO floor protection, however
// dangerous its declared category. A source could self-declare
// `risk: "low", confirmation: false` on a "financial" action and nothing
// in AccessGraph would raise it. These tests exercise that gap directly,
// with no adapter involved.

const graph = new AccessGraph([{
  id: "wallet-01",
  role: "service",
  label: "Wallet",
  state: {},
  actions: [
    // Deliberately under-declared: low risk, no confirmation, but a
    // floored category. The floor must win.
    { id: "transfer_funds", label: "Transfer funds", risk: "low", confirmation: false, category: "financial" },
    // Same shape, but a category with no floor: declared values must be
    // left alone, not silently raised.
    { id: "read_balance", label: "Read balance", risk: "low", confirmation: false, category: "information" },
    // No category at all: must behave exactly as before this change.
    { id: "ping", label: "Ping", risk: "none" }
  ]
}]);

const transfer = graph.get("wallet-01").actions[0];
const balance = graph.get("wallet-01").actions[1];
const ping = graph.get("wallet-01").actions[2];

if (effectiveRisk(transfer) !== "high") throw new Error("A 'financial' category action must be floored to 'high' risk, regardless of its declared risk");
if (effectiveRisk(balance) !== "low") throw new Error("A category with no floor must not have its declared risk altered");
if (effectiveRisk(ping) !== "none") throw new Error("An action with no category must not have its declared risk altered");

const resolvedTransfer = graph.resolveAction("wallet-01", "transfer_funds");
if (!resolvedTransfer.requiresConfirmation) {
  throw new Error("A 'financial' category action must require confirmation even when self-declared confirmation: false");
}

const resolvedBalance = graph.resolveAction("wallet-01", "read_balance");
if (resolvedBalance.requiresConfirmation) {
  throw new Error("A low-risk, unfloored-category action with confirmation: false must not require confirmation");
}

// renderControls (what a client UI is built from) and resolveAction (the
// actual gate) must agree, the same invariant tests/smoke-test.mjs checks
// for the profile-driven confirmation_for path: a floor that's enforced
// but not shown in the UI is a UI honesty bug, not a safety bypass, but
// it's still a real bug this test should catch.
const rendered = renderControls(graph.get("wallet-01"));
const renderedTransfer = rendered.actions.find((action) => action.id === "transfer_funds");
if (renderedTransfer.risk !== "high") throw new Error("renderControls must reflect the floored risk, not the raw declared value");
if (renderedTransfer.confirmation !== resolvedTransfer.requiresConfirmation) {
  throw new Error("renderControls and resolveAction must agree on whether a category-floored action requires confirmation");
}

// Floors only ever raise. A HIGHER-than-floor declared risk must be left
// exactly as declared, not clamped down to the floor.
graph.register({
  id: "wallet-02",
  role: "service",
  label: "Wallet 2",
  state: {},
  actions: [{ id: "transfer_funds", label: "Transfer funds", risk: "critical", category: "financial" }]
});
if (effectiveRisk(graph.get("wallet-02").actions[0]) !== "critical") {
  throw new Error("A declared risk above the category floor must never be lowered to the floor");
}

console.log("Category risk/confirmation floor test passed");
