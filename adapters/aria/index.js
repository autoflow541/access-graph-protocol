import { AGP_VERSION } from "../../sdk/javascript/agp.js";

const TAG_ROLE = {
  BUTTON: "button",
  A: "link",
  INPUT: "input",
  SELECT: "input",
  TEXTAREA: "input",
  NAV: "navigation",
  FORM: "form",
  VIDEO: "media",
  AUDIO: "media"
};

const INTERACTIVE_ROLES = new Set([
  "button", "link", "checkbox", "radio", "switch", "textbox", "combobox",
  "listbox", "option", "menuitem", "slider", "spinbutton", "tab"
]);

/**
 * Scan a DOM root and return AGP objects for semantic interactive elements.
 * This adapter complements ARIA; it does not replace browser accessibility trees.
 */
export function scanAria(root = document, options = {}) {
  const selector = [
    "button", "a[href]", "input", "select", "textarea", "form", "nav",
    "video", "audio", "[role]", "[aria-label]", "[aria-labelledby]"
  ].join(",");
  const elements = [...root.querySelectorAll(selector)];
  return elements
    .map((element, index) => ariaElementToAgp(element, { ...options, index, root }))
    .filter(Boolean);
}

export function ariaElementToAgp(element, options = {}) {
  if (!element || typeof element !== "object") return null;
  const tag = String(element.tagName || "").toUpperCase();
  const explicitRole = attr(element, "role");
  const role = normalizeRole(explicitRole || inferRole(element, tag));
  if (!role) return null;

  const label = accessibleLabel(element, options.root || element.ownerDocument);
  if (!label && !options.includeUnlabeled) return null;

  const id = stableId(element, role, options.index ?? 0);
  const state = extractState(element, tag, options);
  const actions = inferActions(element, role, tag);

  return {
    agp: AGP_VERSION,
    id,
    role,
    label: label || id,
    state,
    actions,
    inputs: inferInputs(element, role),
    outputs: ["visual"],
    source: {
      type: "platform_accessibility_api",
      confidence: explicitRole ? 1 : 0.95,
      adapter: "aria-html-0.1"
    },
    metadata: {
      html_tag: tag.toLowerCase(),
      ...(explicitRole ? { aria_role: explicitRole } : {})
    }
  };
}

export function accessibleLabel(element, root = element?.ownerDocument) {
  const direct = attr(element, "aria-label");
  if (direct) return clean(direct);

  const labelledBy = attr(element, "aria-labelledby");
  if (labelledBy && root?.getElementById) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => root.getElementById(id)?.textContent || "")
      .join(" ");
    if (clean(text)) return clean(text);
  }

  if (String(element?.tagName || "").toUpperCase() === "IMG") {
    const alt = attr(element, "alt");
    if (alt) return clean(alt);
  }

  if (["INPUT", "SELECT", "TEXTAREA"].includes(String(element?.tagName || "").toUpperCase())) {
    const id = attr(element, "id");
    if (id && root?.querySelector) {
      const label = root.querySelector(`label[for="${cssEscape(id)}"]`);
      if (label?.textContent) return clean(label.textContent);
    }
    if (element.labels?.length) {
      const text = [...element.labels].map((label) => label.textContent || "").join(" ");
      if (clean(text)) return clean(text);
    }
    const placeholder = attr(element, "placeholder");
    if (placeholder) return clean(placeholder);
  }

  const title = attr(element, "title");
  if (title) return clean(title);

  const text = clean(element?.textContent || "");
  return text || null;
}

function inferRole(element, tag) {
  if (tag === "INPUT") {
    const type = String(attr(element, "type") || "text").toLowerCase();
    if (["button", "submit", "reset"].includes(type)) return "button";
    if (type === "checkbox") return "checkbox";
    if (type === "radio") return "radio";
    if (type === "range") return "slider";
    return "input";
  }
  if (tag === "A" && !attr(element, "href")) return null;
  return TAG_ROLE[tag] || null;
}

function normalizeRole(role) {
  if (!role) return null;
  const value = String(role).trim().split(/\s+/)[0].toLowerCase();
  return value || null;
}

function extractState(element, tag, options) {
  const state = {};
  const disabled = boolAttr(element, "disabled") || attr(element, "aria-disabled") === "true";
  if (disabled) state.disabled = true;

  for (const [ariaName, stateName] of [
    ["aria-expanded", "expanded"],
    ["aria-pressed", "pressed"],
    ["aria-selected", "selected"],
    ["aria-checked", "checked"],
    ["aria-busy", "busy"],
    ["aria-invalid", "invalid"]
  ]) {
    const value = attr(element, ariaName);
    if (value != null && value !== "") state[stateName] = parseAriaValue(value);
  }

  if (typeof element.checked === "boolean" && ["INPUT"].includes(tag)) state.checked = element.checked;
  if (typeof element.selectedIndex === "number" && tag === "SELECT") state.selected_index = element.selectedIndex;

  const type = String(attr(element, "type") || "").toLowerCase();
  const canExposeValue = options.includeValues && type !== "password";
  if (canExposeValue && ["INPUT", "SELECT", "TEXTAREA"].includes(tag) && element.value != null) {
    state.value = String(element.value);
  }

  return state;
}

function inferActions(element, role, tag) {
  const disabled = boolAttr(element, "disabled") || attr(element, "aria-disabled") === "true";
  if (disabled) return [];

  if (role === "link" || (tag === "A" && attr(element, "href"))) {
    return [{ id: "navigate", label: "Open link", risk: "low" }];
  }
  if (["checkbox", "radio", "switch"].includes(role)) {
    return [{ id: "toggle", label: "Toggle", risk: "none" }];
  }
  if (["input", "textbox", "combobox", "listbox", "slider", "spinbutton"].includes(role) || ["INPUT", "SELECT", "TEXTAREA"].includes(tag)) {
    return [{ id: "set_value", label: "Set value", risk: "none" }];
  }
  if (role === "form") return [{ id: "submit", label: "Submit form", risk: "medium", confirmation: false }];
  if (role === "media") return [
    { id: "play", label: "Play", risk: "none" },
    { id: "pause", label: "Pause", risk: "none" }
  ];
  if (INTERACTIVE_ROLES.has(role) || role === "button") {
    return [{ id: "activate", label: "Activate", risk: "none" }];
  }
  return [];
}

function inferInputs(element, role) {
  const inputs = ["keyboard"];
  if (INTERACTIVE_ROLES.has(role) || ["button", "link", "input"].includes(role)) inputs.push("pointer");
  return inputs;
}

function stableId(element, role, index) {
  const nativeId = attr(element, "id");
  if (nativeId) return `web-${slug(nativeId)}`;
  const name = attr(element, "name");
  if (name) return `web-${role}-${slug(name)}`;
  return `web-${role}-${index + 1}`;
}

function attr(element, name) {
  if (typeof element?.getAttribute === "function") return element.getAttribute(name);
  const attrs = element?.attributes || {};
  const value = attrs[name];
  return value == null ? null : String(value);
}

function boolAttr(element, name) {
  if (typeof element?.hasAttribute === "function") return element.hasAttribute(name);
  return Boolean(element?.[name]);
}

function parseAriaValue(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "item";
}

function cssEscape(value) {
  if (globalThis.CSS?.escape) return globalThis.CSS.escape(value);
  return String(value).replace(/["\\]/g, "\\$&");
}
