import type { ContactSearchResult } from '../types';
import { performSearch } from '../utils/session';
import { parseName, pickBestOption } from '../utils/names';

const normalize = (s: string): string =>
  String(s || '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const stripLabelMetadata = (label: string): string =>
  label
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\s+-\s+.*$/, ' ');

const extractLabelLast = (label: string): string => {
  const raw = String(label || '');
  const normalized = normalize(raw);
  if (!normalized) return '';

  const commaIdx = normalized.indexOf(',');
  if (commaIdx !== -1) {
    return normalized.slice(0, commaIdx).trim();
  }

  const cleaned = normalize(stripLabelMetadata(raw));
  if (!cleaned) return '';

  const { lastName } = parseName(cleaned);
  return normalize(lastName);
};

const includesFirst = (label: string, firstName: string): boolean => {
  const normalizedLabel = normalize(label);
  const nameParts = normalize(firstName).split(/\s+/).filter(Boolean);
  if (nameParts.length === 0) return true;

  const labelTokens = normalizedLabel
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

  return nameParts.every((part) => labelTokens.some((t) => t === part));
};

export const findContactForName = async (
  fullName: string,
  signal?: AbortSignal | null
): Promise<ContactSearchResult> => {
  const parsedName = parseName(fullName);

  if (!parsedName.lastName) {
    return { status: 'notFound', reason: 'No last name parsed' };
  }

  // Primary search by last name
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const lastNameOptions = await performSearch(parsedName.lastName, signal);

  if (!lastNameOptions.length) {
    return { status: 'notFound', reason: 'No matches for last name' };
  }

  let picked = pickBestOption(lastNameOptions, parsedName);
  if (picked) return { status: 'found', data: picked };

  // Fallback search by first token of the first name
  let firstNameOptions: typeof lastNameOptions = [];
  if (parsedName.firstName) {
    const firstToken = parsedName.firstName.split(/\s+/)[0];
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    firstNameOptions = await performSearch(firstToken, signal);
  }

  // Merge and try again
  const allOptions = [...lastNameOptions, ...firstNameOptions];
  // Deduplicate by stable, normalized string of the option value to avoid
  // separate entries caused by Unicode composition differences.
  const uniqueOptions = [
    ...new Map(allOptions.map((o) => [String(o.value).normalize('NFC'), o])).values(),
  ];

  picked = pickBestOption(uniqueOptions, parsedName);
  if (picked) return { status: 'found', data: picked };

  // Report relevant candidates
  const both = uniqueOptions.filter(
    (o) =>
      extractLabelLast(o.label) === normalize(parsedName.lastName) &&
      includesFirst(o.label, parsedName.firstName)
  );

  if (both.length > 1) {
    return {
      status: 'ambiguous',
      reason: 'Multiple candidates match first and last name',
      candidates: both.map((o) => o.label),
    };
  }

  const sameLast = uniqueOptions.filter(
    (o) => extractLabelLast(o.label) === normalize(parsedName.lastName)
  );

  return {
    status: 'ambiguous',
    reason: 'No unique match found; candidates with same last name',
    candidates: sameLast.map((o) => o.label),
  };
};