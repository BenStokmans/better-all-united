import type { ParsedName, SearchOption } from "../types";
import { decodeHtml } from "./dom";

export const parseName = (full: string): ParsedName => {
  const parts = String(full || "")
    .trim()
    .split(/\s+/);

  if (parts.length < 2) {
    return { firstName: "", lastName: parts[0] || "" };
  }

  const lastName = parts.pop()!;
  const firstName = parts.join(" ");

  return { firstName, lastName };
};

const normalizeDecoded = (s: string): string =>
  s.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();

const normalize = (s: string): string =>
  normalizeDecoded(decodeHtml(String(s || "")));

const stripLabelMetadata = (label: string): string =>
  label
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\s+-\s+.*$/, " ");

const extractLabelLast = (label: string): string => {
  const raw = String(label || "");
  const normalized = normalize(raw);
  if (!normalized) return "";

  const commaIdx = normalized.indexOf(",");
  if (commaIdx !== -1) {
    return normalized.slice(0, commaIdx).trim();
  }

  const cleaned = normalize(stripLabelMetadata(raw));
  if (!cleaned) return "";

  const { lastName } = parseName(cleaned);
  return normalize(lastName);
};

const includesFirst = (label: string, firstName: string): boolean => {
  const normalizedLabel = normalize(label);
  const nameParts = normalize(firstName).split(/\s+/).filter(Boolean);

  if (nameParts.length === 0) return true;

  // Tokenize the label using Unicode-aware character classes so letters
  // with accents (e.g. è, ü) are treated as part of words. We split on any
  // run of non-letter/non-number characters. The `u` flag enables Unicode
  // property escapes when available.
  const labelTokens = normalizedLabel.split(/[^\p{L}\p{N}]+/u).filter(Boolean);

  return nameParts.every((part) => labelTokens.some((t) => t === part));
};

export const pickBestOption = (
  options: SearchOption[],
  { firstName, lastName }: ParsedName
): SearchOption | null => {
  const targetLast = normalize(lastName);

  // Perfect: last equals, and label contains every token of firstName
  const perfect = options.filter(
    (o) =>
      extractLabelLast(o.label) === targetLast &&
      includesFirst(o.label, firstName)
  );
  if (perfect.length === 1) return perfect[0];

  // Unique last-name match
  const lastOnly = options.filter(
    (o) => extractLabelLast(o.label) === targetLast
  );
  if (lastOnly.length === 1) return lastOnly[0];

  return null;
};

export const parseBySeparator = (
  text: string,
  sep: "auto" | "tab" | "comma" | "enter"
): string[] => {
  const trimmed = String(text || "").trim();
  if (!trimmed) return [];

  let parts: string[] = [];

  if (sep === "tab") {
    parts = trimmed.split(/\t+/);
  } else if (sep === "comma") {
    parts = trimmed.split(/\s*,\s*/);
  } else if (sep === "enter") {
    parts = trimmed.split(/\r?\n+/);
  } else {
    // auto-detect: pick the separator with the highest count
    const counts = {
      enter: (trimmed.match(/\r?\n/g) || []).length,
      tab: (trimmed.match(/\t/g) || []).length,
      comma: (trimmed.match(/,/g) || []).length,
    };

    const chosen = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] ||
      "enter") as "enter" | "tab" | "comma";

    return parseBySeparator(trimmed, chosen);
  }

  const names = parts.map((s) => s.trim()).filter(Boolean);

  // de-duplicate keep order
  const seen = new Set<string>();
  const out: string[] = [];

  for (const n of names) {
    const decoded = decodeHtml(String(n || ""));
    // Normalize Unicode and case for deduplication to avoid losing
    // different composed/decomposed forms or case-only differences.
    const k = normalizeDecoded(decoded);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(decoded);
  }

  return out;
};
