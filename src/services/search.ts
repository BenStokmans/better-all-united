import type { ContactSearchResult } from "../types";
import { performSearch } from "../utils/session";
import { parseName, pickBestOption, extractLabelLast, includesFirst } from "../utils/names";
import { normalize } from "../utils/text";

export const findContactForName = async (
  fullName: string,
  signal?: AbortSignal | null
): Promise<ContactSearchResult> => {
  const parsedName = parseName(fullName);

  if (!parsedName.lastName) {
    return { status: "notFound", reason: "No last name parsed" };
  }

  // Primary search by last name
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const lastNameOptions = await performSearch(parsedName.lastName, null, signal);

  if (!lastNameOptions.length) {
    return { status: "notFound", reason: "No matches for last name" };
  }

  let picked = pickBestOption(lastNameOptions, parsedName);
  if (picked) return { status: "found", data: picked };

  // Fallback search by first token of the first name
  let firstNameOptions: typeof lastNameOptions = [];
  if (parsedName.firstName) {
    const firstToken = parsedName.firstName.split(/\s+/)[0];
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    firstNameOptions = await performSearch(firstToken, null, signal);
  }

  // Merge and try again
  const allOptions = [...lastNameOptions, ...firstNameOptions];
  // Deduplicate by stable, normalized string of the option value to avoid
  // separate entries caused by Unicode composition differences.
  const uniqueOptions = [
    ...new Map(
      allOptions.map((o) => [String(o.value).normalize("NFC"), o])
    ).values(),
  ];

  picked = pickBestOption(uniqueOptions, parsedName);
  if (picked) return { status: "found", data: picked };

  // Report relevant candidates
  const both = uniqueOptions.filter(
    (o) =>
      extractLabelLast(o.label) === normalize(parsedName.lastName) &&
      includesFirst(o.label, parsedName.firstName)
  );

  if (both.length > 1) {
    return {
      status: "ambiguous",
      reason: "Multiple candidates match first and last name",
      candidates: both.map((o) => o.label),
    };
  }

  const sameLast = uniqueOptions.filter(
    (o) => extractLabelLast(o.label) === normalize(parsedName.lastName)
  );

  return {
    status: "ambiguous",
    reason: "No unique match found; candidates with same last name",
    candidates: sameLast.map((o) => o.label),
  };
};
