import type { ButtonConfig } from "../types";

export const createButton = ({
  id,
  text,
  onClick,
  styles = {},
  attributes = {},
}: ButtonConfig): HTMLButtonElement => {
  const button = document.createElement("button");
  button.id = id;
  button.type = "button";
  button.textContent = text;

  Object.entries(attributes).forEach(([k, v]) => button.setAttribute(k, v));

  Object.assign(button.style, {
    cursor: "pointer",
    padding: "8px 12px",
    borderRadius: "6px",
    border: "1px solid #0ea5a5",
    background: "#14b8a6",
    color: "white",
    fontSize: "14px",
    margin: "8px 8px 0 0",
    ...styles,
  });

  button.addEventListener("click", onClick as EventListener);

  return button;
};

export const createInputButton = ({
  id,
  text,
  onClick,
  styles = {},
  attributes = {},
}: ButtonConfig): HTMLInputElement => {
  const button = document.createElement("input");
  button.id = id;
  button.type = "button";
  button.value = text;

  Object.entries(attributes).forEach(([k, v]) => button.setAttribute(k, v));

  Object.assign(button.style, {
    ...styles,
  });

  button.addEventListener("click", onClick as EventListener);

  return button;
};

export const createCheckbox = ({
  id,
  text,
  onChange,
  checked,
  styles = {},
  attributes = {},
}: {
  id: string;
  text: string;
  onChange: (e: Event) => void;
  checked: boolean;
  styles?: Partial<CSSStyleDeclaration>;
  attributes?: Record<string, string>;
}): HTMLLabelElement => {
  // --- 1. Create Container Label ---
  const label = document.createElement("label");
  // Apply base styles and merge user-provided styles
  Object.assign(label.style, {
    display: "inline-flex",
    alignItems: "center",
    cursor: "pointer",
    gap: "10px", // Adds space between the checkbox and text
    ...styles,
  });
  label.htmlFor = id;

  // --- 2. Create the actual, hidden checkbox input ---
  const checkbox = document.createElement("input");
  checkbox.id = id;
  checkbox.type = "checkbox";
  checkbox.checked = checked;
  // Hide the default checkbox but keep it accessible
  Object.assign(checkbox.style, {
    position: "absolute",
    opacity: "0",
    width: "0",
    height: "0",
  });

  // --- 3. Create the custom-styled visual checkbox ---
  const customCheckbox = document.createElement("span");
  Object.assign(customCheckbox.style, {
    display: "inline-block",
    width: "24px", // Bigger size
    height: "24px", // Bigger size
    border: "2px solid #888",
    borderRadius: "6px",
    transition: "all 0.2s ease-in-out",
    backgroundColor: "#fff",
    flexShrink: "0", // Prevents shrinking in flex containers
  });

  // --- 4. Define the checked appearance (with an SVG checkmark) ---
  const checkmarkSvg = `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8'%3e%3cpath fill='%23fff' d='M6.564.75l-3.59 3.612-1.538-1.55L0 4.26 2.974 7.25 8 2.193z'/%3e%3c/svg%3e")`;

  const updateVisuals = () => {
    if (checkbox.checked) {
      customCheckbox.style.backgroundColor = "#007bff";
      customCheckbox.style.borderColor = "#007bff";
      customCheckbox.style.backgroundImage = checkmarkSvg;
      customCheckbox.style.backgroundRepeat = "no-repeat";
      customCheckbox.style.backgroundPosition = "center";
      customCheckbox.style.backgroundSize = "60%";
    } else {
      customCheckbox.style.backgroundColor = "#fff";
      customCheckbox.style.borderColor = "#888";
      customCheckbox.style.backgroundImage = "none";
    }
  };

  // --- 5. Add Event Listeners ---
  // Handle change event
  const handleChange = (e: Event) => {
    updateVisuals();
    onChange(e); // Forward the event to the original handler
  };
  checkbox.addEventListener("change", handleChange as EventListener);

  // Add focus styles for accessibility
  checkbox.addEventListener("focus", () => {
    customCheckbox.style.boxShadow = "0 0 0 3px rgba(0, 123, 255, 0.4)";
  });
  checkbox.addEventListener("blur", () => {
    customCheckbox.style.boxShadow = "none";
  });

  // Apply user attributes to the real checkbox
  Object.entries(attributes).forEach(([k, v]) => checkbox.setAttribute(k, v));

  // --- 6. Assemble and Return ---
  label.appendChild(checkbox);
  label.appendChild(customCheckbox);
  label.appendChild(document.createTextNode(text));

  // Set initial visual state
  updateVisuals();

  return label;
};

/**
 * Creates a custom checkbox and wraps it in a DevExtreme-style toolbar item.
 *
 * @param {object} options - The configuration options.
 * @param {string} options.id - The ID for the checkbox input and label 'for' attribute.
 * @param {string} options.text - The text to display next to the checkbox.
 * @param {(e: Event) => void} options.onChange - The callback for the change event.
 * @param {string} options.title - The title/tooltip for the toolbar button wrapper.
 * @param {boolean} [options.checked=false] - The initial checked state.
 * @param {Partial<CSSStyleDeclaration>} [options.styles={}] - Custom styles for the checkbox label.
 * @param {Record<string, string>} [options.attributes={}] - Custom attributes for the checkbox input.
 * @returns {HTMLDivElement} The outermost div element representing the toolbar item.
 */
export const createToolbarCheckbox = ({
  id,
  text,
  onChange,
  title,
  checked,
  styles = {},
  attributes = {},
}: {
  id: string;
  text: string;
  onChange: (e: Event) => void;
  title: string;
  checked: boolean;
  styles?: Partial<CSSStyleDeclaration>;
  attributes?: Record<string, string>;
}): HTMLDivElement => {
  // 1. Create the styled checkbox using our existing function
  const checkboxLabel = createCheckbox({
    id,
    text,
    onChange,
    checked,
    styles,
    attributes,
  });

  // 2. Create the DevExtreme wrapper structure
  const toolbarItemWrapper = document.createElement("div");
  toolbarItemWrapper.className = "dx-item dx-toolbar-item dx-toolbar-button";

  const itemContentWrapper = document.createElement("div");
  itemContentWrapper.className = "dx-item-content dx-toolbar-item-content";

  const buttonWrapper = document.createElement("div");
  buttonWrapper.className = "dx-button dx-button-normal dx-button-mode-text dx-widget";
  buttonWrapper.setAttribute("aria-label", title);
  buttonWrapper.title = title;
  // Note: DevExtreme handles focus, so tabindex and role might be managed by the framework.
  // We set them here to match your example structure.
  buttonWrapper.tabIndex = 0;
  buttonWrapper.setAttribute("role", "button");

  const contentWrapper = document.createElement("div");
  contentWrapper.className = "dx-button-content";
  // Ensure content inside is aligned, which helps the checkbox and text look good.
  Object.assign(contentWrapper.style, {
    display: "flex",
    alignItems: "center",
  });

  // 3. Assemble the hierarchy
  contentWrapper.appendChild(checkboxLabel);
  buttonWrapper.appendChild(contentWrapper);
  itemContentWrapper.appendChild(buttonWrapper);
  toolbarItemWrapper.appendChild(itemContentWrapper);

  // 4. Return the complete toolbar item
  return toolbarItemWrapper;
};