// @ts-ignore
import { get as levenshtein } from "fast-levenshtein";
import { normalize } from "./utils/text";
import {
  stripLabelMetadata,
} from "./utils/names";
import { performMemberSearch } from "./utils/session";

/* eslint-disable @typescript-eslint/no-explicit-any */

type SearchOption = { value: string; label: string };

type JQueryAjaxOptions = {
  url?: string;
  type?: string;
  data?: string | Record<string, unknown> | URLSearchParams;
  dataType?: string;
  success?: (data: any, textStatus: string, jqXHR: any) => void;
  error?: (jqXHR: any, textStatus: string, errorThrown: any) => void;
  complete?: (jqXHR: any, textStatus: string) => void;
};

/**
 * Defines the contract for an object that can intercept and handle a jQuery AJAX request.
 */
interface RequestInterceptor {
  /**
   * Determines if this interceptor should handle the given AJAX request.
   * @param options The options for the AJAX request.
   * @returns `true` if this interceptor should handle the request, otherwise `false`.
   */
  matches(options: JQueryAjaxOptions): boolean;

  /**
   * Executes the custom logic for the intercepted request.
   * @param options The options for the AJAX request.
   * @returns A promise that resolves with the new data to be passed to the success callback.
   */
  handle(options: JQueryAjaxOptions): Promise<any>;
}

/**
 * Defines the contract for an object that can intercept and handle a Fetch request.
 */
interface FetchRequestInterceptor {
  /**
   * Determines if this interceptor should handle the given Fetch request.
   * @param url The URL of the request.
   * @param options The options for the request.
   * @returns `true` if this interceptor should handle the request, otherwise `false`.
   */
  matches(url: string, options: RequestInit): boolean;

  /**
   * Executes the custom logic for the intercepted request.
   * @param url The URL of the request.
   * @param options The options for the request.
   * @returns A promise that resolves with the response to be returned to the caller.
   */
  handle(url: string, options: RequestInit): Promise<Response>;
}

// Callback handler type aliases used to correctly narrow function types
type SuccessHandler = (data: any, textStatus: string, jqXHR: any) => void;
type CompleteHandler = (jqXHR: any, textStatus: string) => void;
type ErrorHandler = (jqXHR: any, textStatus: string, errorThrown: any) => void;

const DEV_EXTREME_ENDPOINT_PATTERN = /\/_devextreme\.php/i;

const extractSearchTerm = (body: unknown): string | null => {
  try {
    if (typeof body === "string") {
      const params = new URLSearchParams(body);
      return params.get("find-value");
    }
    if (body && typeof body === "object") {
      const obj = body as Record<string, unknown>;
      if (obj["find-value"] != null) return String(obj["find-value"]);
      const params = new URLSearchParams();
      Object.keys(obj).forEach((k) => {
        const v = obj[k];
        if (Array.isArray(v)) v.forEach((x) => params.append(k, String(x)));
        else if (v != null) params.append(k, String(v));
      });
      return params.get("find-value");
    }
  } catch {}
  return null;
};

const interceptorManager = {
  jqInterceptors: [] as RequestInterceptor[],
  fetchInterceptors: [] as FetchRequestInterceptor[],

  register(interceptor: RequestInterceptor): void {
    this.jqInterceptors.push(interceptor);
  },

  registerFetch(interceptor: FetchRequestInterceptor): void {
    this.fetchInterceptors.push(interceptor);
  },

  findHandler(options: JQueryAjaxOptions): RequestInterceptor | undefined {
    return this.jqInterceptors.find((interceptor) => interceptor.matches(options));
  },

  findFetchHandler(url: string, options: RequestInit): FetchRequestInterceptor | undefined {
    return this.fetchInterceptors.find((interceptor) => interceptor.matches(url, options));
  },
};

/**
 * Fakes a successful jQuery XHR response, calling the original success and
 * complete handlers with the provided data.
 */
const fulfillJqXhrSuccess = (
  jqXHR: any,
  options: JQueryAjaxOptions,
  originalOptions: JQueryAjaxOptions,
  responseData: any,
): void => {
  const payloadStr = JSON.stringify(responseData);
  const declaredType = String(options?.dataType || originalOptions?.dataType || "").toLowerCase().trim();
  const wantsJSON = declaredType === "json";
  const dataForCallback = wantsJSON ? responseData : payloadStr;

  try {
    jqXHR.status = 200;
    jqXHR.readyState = 4;
    jqXHR.statusText = "success";
    jqXHR.responseJSON = responseData;
    jqXHR.responseText = payloadStr;
    jqXHR.getResponseHeader = (name: string) =>
      String(name).toLowerCase() === "content-type" ? "application/json; charset=utf-8" : null;
    jqXHR.getAllResponseHeaders = () => "content-type: application/json; charset=utf-8\n";
  } catch {}

  const isSuccess = (f: unknown): f is SuccessHandler => typeof f === "function";
  const uniqueSuccess = new Set<SuccessHandler>(([originalOptions?.success, options?.success].filter(isSuccess) as SuccessHandler[]));
  uniqueSuccess.forEach((fn) => {
    try { fn(dataForCallback, "success", jqXHR); }
    catch (e) { console.error("[Better AllUnited] success handler error", e); }
  });

  const isComplete = (f: unknown): f is CompleteHandler => typeof f === "function";
  const uniqueComplete = new Set<CompleteHandler>(([originalOptions?.complete, options?.complete].filter(isComplete) as CompleteHandler[]));
  uniqueComplete.forEach((fn) => {
    try { fn(jqXHR, "success"); }
    catch (e) { console.error("[Better AllUnited] complete handler error", e); }
  });
};

/**
 * Fakes a failed jQuery XHR response, calling the original error handlers.
 */
const fulfillJqXhrError = (
  jqXHR: any,
  options: JQueryAjaxOptions,
  originalOptions: JQueryAjaxOptions,
  error: any,
): void => {
    console.error("[Better AllUnited] Error in request interceptor:", error);
  const isError = (f: unknown): f is ErrorHandler => typeof f === "function";
  const uniqueError = new Set<ErrorHandler>(([originalOptions?.error, options?.error].filter(isError) as ErrorHandler[]));
    uniqueError.forEach((fn) => {
      try { fn(jqXHR, "error", error); }
      catch (e) { console.error("[Better AllUnited] error handler error", e); }
    });
};


const multiWordSearchInterceptor: RequestInterceptor = {
  matches(options: JQueryAjaxOptions): boolean {
    const url = String(options?.url || "");
    const type = String(options?.type || "").toUpperCase();
    const dataStr = typeof options?.data === "string" ? options.data : "";

    const isSearchRequest = /\/_ajax\.php/.test(url) && (url.includes("find-field") || dataStr.includes("find-field")) && type === "POST";
    if (!isSearchRequest) return false;

    const searchTerm = extractSearchTerm(options.data);
    const wordCount = searchTerm?.trim().split(/\s+/).length ?? 0;
    return wordCount > 1;
  },

  async handle(options: JQueryAjaxOptions): Promise<{ options: SearchOption[] }> {
    const searchTerm = extractSearchTerm(options.data)!;
    const enhancedResults = await performMultiTermSearch(searchTerm);
    return { options: enhancedResults };
  },
};

const fastSearchFetchInterceptor: FetchRequestInterceptor = {
  matches(url: string): boolean {
    if (!fastSearchEnabled) return false;
    return DEV_EXTREME_ENDPOINT_PATTERN.test(url);
  },

  async handle(url: string, options: RequestInit): Promise<Response> {

    // Try to extract DevExtreme search term from request body
    try {
      const body = options?.body;
      const searchTerm = extractDevExtremeSearchTerm(body);
      if (!searchTerm) {
        // nothing for us to do, fall back
        // @ts-ignore
        return (window as any).__betterAllUnitedOriginalFetch
          ? (window as any).__betterAllUnitedOriginalFetch(url, options)
          : fetch(url, options);
      }

      // Perform search(s) using performSearch (which uses the site's _ajax.php find-field endpoint)
      const rawOptions = await performMultiTermSearch(searchTerm);
      if (!rawOptions || rawOptions.length === 0) {
        // return empty devextreme shape
        const emptyPayload = { data: [], totalCount: 0 };
        return new Response(JSON.stringify(emptyPayload), {
          status: 200,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        });
      }

      // Parse incoming body to respect paging (skip/take)
      let skip = 0;
      let take = rawOptions.length;
      try {
        const parsed = typeof body === "string" ? JSON.parse(body) : (body as any) || {};
        if (typeof parsed?.skip === "number") skip = parsed.skip;
        if (typeof parsed?.take === "number") take = parsed.take;
        // devextreme sometimes nests skip/take or uses paging.pageSize; attempt both
        if (parsed?.pagination) {
          if (typeof parsed.pagination.skip === "number") skip = parsed.pagination.skip;
          if (typeof parsed.pagination.take === "number") take = parsed.pagination.take;
        }
      } catch (_) {}

      const mapped = rawOptions.map(opt => mapOptionToDevExtremeRecord(opt));
      const totalCount = mapped.length;
      const page = mapped.slice(skip, Math.max(skip + take, 0));

      const payload = { data: page, totalCount };
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    } catch (e) {
      console.error("[Better AllUnited] Fast search fetch handler error", e);
      // fallback to original fetch
      // @ts-ignore
      return (window as any).__betterAllUnitedOriginalFetch
        ? (window as any).__betterAllUnitedOriginalFetch(url, options)
        : fetch(url, options);
    }
  },
};

/**
 * Extract the search term from a DevExtreme request body. Supports string or object bodies.
 */
const extractDevExtremeSearchTerm = (body: unknown): string | null => {
  try {
    let obj: any = null;
    if (typeof body === "string") {
      // If body is raw JSON, parse it
      try { obj = JSON.parse(body); } catch {
        // Not raw JSON — maybe urlencoded like: search=%7B...%7D or form encoded
        try {
          const params = new URLSearchParams(body);
          if (params.has("search")) {
            const raw = params.get("search");
            if (raw) {
              try { obj = JSON.parse(raw); } catch { /* leave as string */ }
            }
          }
        } catch { /* ignore */ }
      }
    } else if (body && typeof body === "object") {
      obj = body;
    }

    // If it's a simple form-encoded string and we still don't have an object, try existing extractor
    if (!obj && typeof body === "string") return extractSearchTerm(body);

    // Look for filter arrays produced by DevExtreme
    const findInArray = (arr: any[]): string | null => {
      for (const item of arr) {
        if (Array.isArray(item)) {
          // [field, operator, value]
          if (item.length >= 3 && String(item[1]).toLowerCase() === "contains") {
            return String(item[2] ?? "");
          }
          // nested arrays
          const nested = findInArray(item);
          if (nested) return nested;
        }
      }
      return null;
    };

    // Some requests (DevExtreme) wrap the actual request in a 'search' key which contains JSON
    if (obj?.search) {
      if (typeof obj.search === "string") {
        try {
          const parsedInner = JSON.parse(obj.search);
          obj = parsedInner;
        } catch {
          // not JSON — continue and let other checks handle
        }
      } else if (typeof obj.search === "object") {
        obj = obj.search;
      }
    }

    if (obj?.filter) {
      if (Array.isArray(obj.filter)) return findInArray(obj.filter);
      if (typeof obj.filter === "string") return obj.filter;
    }

    // Some payloads include a 'searchValue' or 'searchKey' field
    if (obj?.searchValue) return String(obj.searchValue);
    if (obj?.findValue) return String(obj.findValue);
    if (obj?.find_value) return String(obj.find_value);

    return null;
  } catch {
    return null;
  }
};

const performMultiTermSearch = async (fullName: string): Promise<SearchOption[]> => {
  const terms = fullName.trim().split(/\s+/);
  if (terms.length < 2) {
    try {
      return await performMemberSearch(fullName, storedSessionId);
    } catch (e) {
      console.error("[Better AllUnited] performSearch error", e);
      return [];
    }
  }

  const tasks = terms.map(t => {
    return performMemberSearch(t, storedSessionId).catch(() => [] as SearchOption[]);
  });
  const results = await Promise.all(tasks);

  const unique = [...new Map(results.flat().map(o => [o.value, o])).values()];

  const scored = unique.map(option => {
    const normalizedLabel = normalize(stripLabelMetadata(option.label));
    const distance = levenshtein(normalize(fullName), normalizedLabel);
    return { ...option, distance } as SearchOption & { distance: number };
  });

  scored.sort((a: any, b: any) => (a.distance ?? 0) - (b.distance ?? 0));
  return scored.map(s => ({ value: s.value, label: s.label }));
};

const mapOptionToDevExtremeRecord = (option: SearchOption): any => {
  const raw = option.label || "";
  // Extract type at end like " (Lid)"
  let type = "";
  let labelWithoutType = raw;
  const typeMatch = raw.match(/\(([^)]+)\)\s*$/);
  if (typeMatch) {
    type = typeMatch[1];
    labelWithoutType = raw.slice(0, typeMatch.index).trim();
  }

  const parts = labelWithoutType.split(",").map(p => p.trim()).filter(Boolean);
  const lastname = parts[0] ?? "";
  const firstname = parts.length > 0 ? parts[parts.length - 1] : "";
  let initials = "";
  if (parts.length >= 2) initials = parts[1];

  // attempt to find prefix (e.g., 'van den', 'de') in middle parts beyond initials
  let prefix = "";
  if (parts.length > 3) {
    prefix = parts.slice(2, parts.length - 1).join(" ");
  } else if (parts.length === 3) {
    // middle part might be prefix or initials; if it contains whitespace assume prefix
    const mid = parts[1];
    if (/\s/.test(mid)) {
      prefix = mid;
      initials = "";
    }
  }

  const name = `${lastname}${initials ? ", " + initials : ""}${prefix ? " " + prefix : ""}${firstname ? " (" + firstname + ")" : ""}`.trim();

  const avatarshort = (() => {
    if (firstname && lastname) return `${firstname.charAt(0)}${lastname.charAt(0)}`.toUpperCase();
    if (firstname) return firstname.slice(0, 2).toUpperCase();
    return initials.replace(/[^A-Z]/g, "").slice(0, 2).toUpperCase();
  })();

  return {
    photo: null,
    name,
    contactid: option.value,
    contacttype: type,
    contactlogin: null,
    leaguenumber: "",
    familycontactid: null,
    familycontactname: "",
    firstname: firstname || "",
    initials: initials || "",
    lastname: lastname || "",
    maidenname: null,
    birthdate: null,
    age: null,
    datefrom: null,
    dateto: null,
    sex: "",
    company: "",
    postalcode: "",
    email: "",
    iban: "",
    avatarshort,
    isactive: false,
  };
};

let fastSearchEnabled = true;
let storedSessionId: string | null = null;

window.addEventListener("better-all-united-fast-search-state", (event: any) => {
  fastSearchEnabled = event.detail.enabled;
});

// Receive session id broadcast from main script and store it for use by fetch-based searches
window.addEventListener("better-all-united-sessionid", (event: any) => {
  try {
    const sid = event?.detail?.sessionId;
    if (sid) {
      storedSessionId = String(sid);
    }
  } catch (e) {
    console.error("[Better AllUnited] Error receiving session id", e);
  }
});

const resolveRequestUrl = (input: RequestInfo | URL): string => {
  if (typeof input === "string") return input;
  if (typeof URL !== "undefined" && input instanceof URL) {
    return input.toString();
  }
  if (typeof Request !== "undefined" && input instanceof Request) {
    return input.url;
  }
  try {
    return String((input as { url?: string; href?: string }).url ?? (input as { href?: string }).href ?? input);
  } catch {
    return "";
  }
};

const setupFetchInterceptor = (): void => {
  const anyWindow = window as typeof window & {
    __betterAllUnitedFetchPatched?: boolean;
    __betterAllUnitedOriginalFetch?: typeof fetch;
  };

  if (anyWindow.__betterAllUnitedFetchPatched) return;
  if (typeof window.fetch !== "function") {
    console.warn("[Better AllUnited] fetch not available; fast select interceptor disabled");
    return;
  }

  const originalFetch = window.fetch.bind(window);

  const patchedFetch: typeof fetch = async (input, init) => {
    const url = resolveRequestUrl(input);
    // Normalize input so interceptors can read the request body reliably.
    // We build a shallow copy of init (handlerInit) and, when possible, convert
    // the body to a string (text or urlencoded form) so handlers can inspect it.
    const handlerInit: RequestInit = Object.assign({}, init || {});
    try {
      // If input is a Request, clone and read text() safely.
      if (typeof Request !== "undefined" && input instanceof Request) {
        try {
          const cloned = input.clone();
          const text = await cloned.text();
          if (text != null) handlerInit.body = text;
        } catch (e) {
          // ignore read errors and leave handlerInit.body as-is
        }
      } else {
        // input is a URL string; inspect init.body for common types
        const b = init && (init as any).body;
        if (typeof b === "string") {
          handlerInit.body = b;
        } else if (typeof URLSearchParams !== "undefined" && b instanceof URLSearchParams) {
          handlerInit.body = b.toString();
        } else if (typeof FormData !== "undefined" && b instanceof FormData) {
          try {
            const params = new URLSearchParams();
            // FormData.entries() yields (name, value) where value may be File/Blob
            for (const pair of (b as any)) {
              const k = pair[0];
              const v = pair[1];
              params.append(String(k), String(v));
            }
            handlerInit.body = params.toString();
          } catch (_) {
            // ignore
          }
        } else if (b && typeof b === "object") {
          try { handlerInit.body = JSON.stringify(b); } catch (_) {}
        }
      }

      // First try to find a fetch-level interceptor using the normalized init
      try {
        const handler = interceptorManager.findFetchHandler(url, handlerInit || {});
        if (handler) {
          try {
            const resp = await handler.handle(url, handlerInit || {});
            if (resp instanceof Response) return resp;
            // If handler returned something else, fall back to original fetch
            console.warn("[Better AllUnited] Fetch interceptor returned non-Response; falling back to original fetch", resp);
          } catch (e) {
            console.error("[Better AllUnited] Fetch interceptor error", e);
          }
        }
      } catch (e) {
        console.error("[Better AllUnited] Error while running fetch interceptors", e);
      }
    } catch (e) {
      console.error("[Better AllUnited] Error normalizing fetch input for interceptors", e);
    }

    // No handler or handler didn't produce a Response — proceed with original fetch
    return originalFetch(input, init);
  };

  anyWindow.__betterAllUnitedOriginalFetch = originalFetch;
  anyWindow.__betterAllUnitedFetchPatched = true;
  window.fetch = patchedFetch;
  console.log("[Better AllUnited] Fetch interceptor installed");
};

const setupRequestInterceptor = (): void => {
  const tryInstall = (): boolean => {
    const $ = window.jQuery || window.$;
    if (!$) return false;

    $.ajaxPrefilter((options: any, originalOptions: any, jqXHR: any): void => {
      const handler = interceptorManager.findHandler(options);
      if (!handler) return;

      try { jqXHR.abort(); } catch {}

      handler.handle(options)
        .then((responseData) => {
          fulfillJqXhrSuccess(jqXHR, options, originalOptions, responseData);
        })
        .catch((error) => {
          fulfillJqXhrError(jqXHR, options, originalOptions, error);
        });
    });

    console.log("[Better AllUnited] jQuery AJAX interceptor installed");
    return true;
  };

  if (tryInstall()) return;

  console.log("[Better AllUnited] Waiting for jQuery to load...");
  let attempts = 0;
  const maxAttempts = 200; // up to ~20s
  const interval = setInterval(() => {
    attempts++;
    if (tryInstall() || attempts >= maxAttempts) {
      clearInterval(interval);
      if (attempts >= maxAttempts) {
        console.warn("[Better AllUnited] jQuery not found; interceptor not installed");
      }
    }
  }, 100);
};

// Run immediately in page context
try {
  // Register all desired interceptors
  interceptorManager.register(multiWordSearchInterceptor);
  interceptorManager.registerFetch(fastSearchFetchInterceptor);

  // Set up the generic prefilter
  setupRequestInterceptor();
  setupFetchInterceptor();
} catch (e) {
  console.error("[Better AllUnited] Failed to set up interceptor", e);
}