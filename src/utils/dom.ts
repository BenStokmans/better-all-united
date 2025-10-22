export const ready = (fn: () => void): void => {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fn, { once: true });
  } else {
    fn();
  }
};

/**
 * Observes the DOM and invokes a callback for every element that is created
 * matching a given CSS selector.
 *
 * @param selector The CSS selector of the elements to watch for.
 * @param callback The function to invoke with the matched element.
 * @returns A function that can be called to disconnect the observer.
 */
export const onElementCreated = (
  selector: string,
  callback: (el: Element) => void
): (() => void) => {
  // 1. First, run the callback for any elements that already exist
  document.querySelectorAll(selector).forEach(callback);

  // 2. Then, create an observer to watch for future additions
  const observer = new MutationObserver((mutationsList) => {
    for (const mutation of mutationsList) {
      if (mutation.type !== 'childList') continue;

      // @ts-ignore
      for (const node of mutation.addedNodes) {
        // We only care about Element nodes
        if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as Element;

          // Check if the added element itself matches the selector
          if (el.matches(selector)) {
            callback(el);
          }

          // Check if any descendants of the added element match the selector
          el.querySelectorAll(selector).forEach(callback);
        }
      }
    }
  });

  // 3. Start observing the entire document body for additions
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // 4. Return a cleanup function to allow the caller to stop observing
  return () => {
    observer.disconnect();
  };
};

export const onElementAvailable = (
  selector: string,
  callback: (el: Element) => void
): void => {
  const tryInvoke = (): boolean => {
    const el = document.querySelector(selector);
    if (!el) return false;
    callback(el);
    return true;
  };

  if (tryInvoke()) return;

  const obs = new MutationObserver(() => {
    if (tryInvoke()) obs.disconnect();
  });

  obs.observe(document.body, { childList: true, subtree: true });
};

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const makeEl = (
  tag: string,
  props: Record<string, string> = {},
  styles: Partial<CSSStyleDeclaration> = {},
  children: (HTMLElement | string | null)[] = []
): HTMLElement => {
  const el = document.createElement(tag);

  Object.entries(props).forEach(([k, v]) => {
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else el.setAttribute(k, v);
  });

  Object.assign(el.style, styles);

  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c == null) return;
    el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  });

  return el;
};

export const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      return true;
    } catch {
      return false;
    } finally {
      ta.remove();
    }
  }
};

let decodeTextarea: HTMLTextAreaElement | null = null;

export const decodeHtml = (value: string): string => {
  if (!value) return "";
  if (typeof document === "undefined") return value;

  if (!decodeTextarea) decodeTextarea = document.createElement("textarea");
  decodeTextarea.innerHTML = value;
  return decodeTextarea.value;
};
