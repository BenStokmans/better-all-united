export const ready = (fn: () => void): void => {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn, { once: true });
  } else {
    fn();
  }
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
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v);
  });

  Object.assign(el.style, styles);

  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c == null) return;
    el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });

  return el;
};

export const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
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
  if (!value) return '';
  if (typeof document === 'undefined') return value;

  if (!decodeTextarea) decodeTextarea = document.createElement('textarea');
  decodeTextarea.innerHTML = value;
  return decodeTextarea.value;
};