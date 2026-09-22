import { ariaElementToAgp, accessibleLabel } from "../adapters/aria/index.js";

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

console.log("ARIA adapter test passed");
