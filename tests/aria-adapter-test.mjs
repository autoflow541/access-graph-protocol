import { ariaElementToAgp, accessibleLabel, scanAria } from "../adapters/aria/index.js";

function fakeElement({ tagName, textContent = "", attrs = {}, checked, value, selectedIndex }) {
  return {
    tagName,
    textContent,
    attributes: attrs,
    checked,
    value,
    selectedIndex,
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null; },
    hasAttribute(name) { return Object.prototype.hasOwnProperty.call(attrs, name); }
  };
}

const button = fakeElement({ tagName: "BUTTON", textContent: "Save" });
const buttonAgp = ariaElementToAgp(button, { index: 0 });
if (buttonAgp.role !== "button") throw new Error("Button role mapping failed");
if (buttonAgp.label !== "Save") throw new Error("Button label mapping failed");
if (buttonAgp.actions[0].id !== "activate") throw new Error("Button action mapping failed");

const checkbox = fakeElement({
  tagName: "INPUT",
  attrs: { type: "checkbox", "aria-label": "Email alerts" },
  checked: true
});
const checkboxAgp = ariaElementToAgp(checkbox, { index: 1 });
if (checkboxAgp.role !== "checkbox") throw new Error("Checkbox role mapping failed");
if (checkboxAgp.state.checked !== true) throw new Error("Checkbox state mapping failed");
if (checkboxAgp.actions[0].id !== "toggle") throw new Error("Checkbox action mapping failed");

const password = fakeElement({
  tagName: "INPUT",
  attrs: { type: "password", "aria-label": "Password" },
  value: "do-not-leak"
});
const passwordAgp = ariaElementToAgp(password, { index: 2, includeValues: true });
if ("value" in passwordAgp.state) throw new Error("Password value leaked into AGP state");

const explicit = fakeElement({
  tagName: "DIV",
  textContent: "More options",
  attrs: { role: "button", "aria-expanded": "false" }
});
const explicitAgp = ariaElementToAgp(explicit, { index: 3 });
if (explicitAgp.source.confidence !== 1) throw new Error("Explicit role confidence should be 1");
if (explicitAgp.state.expanded !== false) throw new Error("ARIA state mapping failed");

// --- Collision-safe identifiers across a scan (same class as the WoT
// adapter's finding E; scanAria() must disambiguate ids the same way) ---
function fakeRootOf(elements) {
  return { querySelectorAll: () => elements };
}

// Two native ids differing only by case fold to the same slug.
const caseCollision = scanAria(
  fakeRootOf([
    fakeElement({ tagName: "BUTTON", textContent: "Save", attrs: { id: "Save-Button" } }),
    fakeElement({ tagName: "BUTTON", textContent: "Save other", attrs: { id: "SAVE-BUTTON" } })
  ])
);
if (new Set(caseCollision.map((o) => o.id)).size !== 2) {
  throw new Error("Two ids differing only by case must not silently overwrite each other in a scan");
}

// A native id can also collide with ANOTHER element's index-based
// fallback id (no id/name of its own), not just with another native id.
const crossBranchCollision = scanAria(
  fakeRootOf([
    fakeElement({ tagName: "BUTTON", textContent: "First", attrs: { id: "button-2" } }),
    fakeElement({ tagName: "BUTTON", textContent: "Second" }) // falls back to web-button-2, same as above
  ])
);
if (new Set(crossBranchCollision.map((o) => o.id)).size !== 2) {
  throw new Error("A native id must not silently collide with another element's index-based fallback id");
}

// A direct ariaElementToAgp() call (not through scanAria) has no
// allocator to disambiguate against — this is expected, since collision
// detection needs visibility across multiple elements that only a scan
// has, and this is documented behavior, not a fallback bug.
const direct = ariaElementToAgp(fakeElement({ tagName: "BUTTON", textContent: "Solo", attrs: { id: "solo-button" } }), { index: 0 });
if (direct.id !== "web-solo-button") throw new Error("A standalone ariaElementToAgp() call should produce the plain (undisambiguated) id");

// --- Form submission fails safe (was confirmation: false with no way for
// an Access Profile to require confirmation for it) -------------------
const form = fakeElement({ tagName: "FORM", attrs: { "aria-label": "Checkout" } });
const formAgp = ariaElementToAgp(form, { index: 4 });
const submitAction = formAgp.actions.find((action) => action.id === "submit");
if (!submitAction.confirmation) throw new Error("Form submission must default to requiring confirmation, not opt out of it");
if (submitAction.category !== "form_submission") throw new Error("Form submission must carry a category an Access Profile can target");

console.log("ARIA adapter test passed");
