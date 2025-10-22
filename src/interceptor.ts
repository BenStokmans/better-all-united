// @ts-ignore
import { get as levenshtein } from "fast-levenshtein";
import { decodeHtml } from "./utils/dom";
import { normalize } from "./utils/text";
import {
  stripLabelMetadata,
} from "./utils/names";

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

// Callback handler type aliases used to correctly narrow function types
type SuccessHandler = (data: any, textStatus: string, jqXHR: any) => void;
type CompleteHandler = (jqXHR: any, textStatus: string) => void;
type ErrorHandler = (jqXHR: any, textStatus: string, errorThrown: any) => void;

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

const buildFindPayload = (searchTerm: string): string => {
  const findData = "YTo0OntzOjU6ImZpZWxkIjtzOjk6ImNvbnRhY3RpZCI7czo1OiJxdWVyeSI7czo5OiJmX2NvbnRhY3QiO3M6NToibGltaXQiO3M6MjoiMTAiO3M6NjoiZmllbGRzIjtzOjQyOiJjb250YWN0aWQ7Y29tcGFueTtmaXJzdG5hbWU7bGFzdG5hbWU7ZW1haWwiO30=";
  const body = new URLSearchParams();
  body.set("find-data", findData);
  body.set("find-value", searchTerm);
  return body.toString();
};

const performSearchViaJQuery = async (
  url: string,
  searchTerm: string,
): Promise<SearchOption[]> => {
  return new Promise((resolve) => {
    const $ = window.jQuery || window.$;
    if (!$) return resolve([]);
    $.ajax({
      url, type: "POST", data: buildFindPayload(searchTerm), dataType: "json",
      contentType: "application/x-www-form-urlencoded; charset=UTF-8",
      headers: { "X-Requested-With": "XMLHttpRequest" },
      success: (data: any) => {
        const results = Array.isArray(data?.options)
          ? data.options.map((option: any) => ({
              value: String(option?.value ?? ""),
              label: decodeHtml(String(option?.label ?? "")),
            }))
          : [];
        resolve(results);
      },
      error: () => resolve([]),
    });
  });
};

const performMultiTermSearchViaJQuery = async (
  url: string,
  fullName: string,
): Promise<SearchOption[]> => {
  const terms = fullName.trim().split(/\s+/);
  if (terms.length < 2) {
    return performSearchViaJQuery(url, fullName);
  }

  const searchTasks = terms.map(term => performSearchViaJQuery(url, term));
  const searchResults = await Promise.all(searchTasks);
  
  const uniqueOptions = [...new Map(searchResults.flat().map((o) => [o.value, o])).values()];

  const scoredOptions = uniqueOptions.map(option => {
    const normalizedLabel = normalize(stripLabelMetadata(option.label));
    const distance = levenshtein(normalize(fullName), normalizedLabel);
    return { ...option, distance };
  });

  scoredOptions.sort((a, b) => a.distance - b.distance);

  return scoredOptions;
};


const interceptorManager = {
  interceptors: [] as RequestInterceptor[],

  register(interceptor: RequestInterceptor): void {
    this.interceptors.push(interceptor);
  },

  findHandler(options: JQueryAjaxOptions): RequestInterceptor | undefined {
    return this.interceptors.find((interceptor) => interceptor.matches(options));
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
    const enhancedResults = await performMultiTermSearchViaJQuery(options.url!, searchTerm);
    return { options: enhancedResults };
  },
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

  // Set up the generic prefilter
  setupRequestInterceptor();
} catch (e) {
  console.error("[Better AllUnited] Failed to set up interceptor", e);
}