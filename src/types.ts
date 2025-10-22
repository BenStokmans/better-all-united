export interface ParsedName {
  firstName: string;
  lastName: string;
}

export interface SearchOption {
  value: string;
  label: string;
}

export interface PriceCodeOption {
  value: string;
  label: string;
}

export interface ContactSearchResult {
  status: "found" | "notFound" | "ambiguous";
  data?: SearchOption;
  reason?: string;
  candidates?: string[];
}

export interface ImportSuccess {
  name: string;
  contactId: string;
  label: string;
}

export interface ImportNotFound {
  name: string;
  reason: string;
}

export interface ImportAmbiguous {
  name: string;
  reason: string;
  candidates: string[];
}

export interface ImportReport {
  successes: ImportSuccess[];
  notFound: ImportNotFound[];
  ambiguous: ImportAmbiguous[];
  aborted?: boolean;
}

export interface PriceCodeResolverContext {
  index: number;
  name: string;
  contact: SearchOption;
}

export interface ProgressUpdate {
  step: "start" | "complete" | "cancel";
  index: number;
  total: number;
  completed: number;
  name: string;
  outcome?: "found" | "notFound" | "ambiguous" | "error";
}

export interface ImportOptions {
  onProgress?: (update: ProgressUpdate) => void;
  signal?: AbortSignal | null;
  priceCodeResolver?: (
    ctx: PriceCodeResolverContext
  ) => string | null | undefined;
}

export interface ButtonConfig {
  id: string;
  text: string;
  onClick: (e: MouseEvent) => void;
  styles?: Partial<CSSStyleDeclaration>;
  attributes?: Record<string, string>;
}

export interface ModalConfig {
  title: string;
  bodyNodes: HTMLElement[];
  footerNodes: HTMLElement[];
  width?: number;
}

export interface ModalRef {
  overlay: HTMLElement;
  modal: HTMLElement;
}

// Allow access to jQuery globals on window in injected scripts
declare global {
  interface Window {
    jQuery?: any;
    $?: any;
  }
}

// Ambient globals for extension APIs (allow direct use of `chrome` / `browser`)
declare const chrome: any;
declare const browser: any;

export {};
