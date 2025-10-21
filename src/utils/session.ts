import { decodeHtml } from './dom';

export const getSessionId = (): string | null => {
  const html = document.documentElement.innerHTML;
  const match = html.match(
    /function getSessionid\s*\(\)\s*\{\s*return\s*["']([a-f0-9]+)["'];\s*\}/
  );

  if (match && match[1]) return match[1];

  console.warn('Could not find sessionid in page HTML.');
  return null;
};

const buildFindPayload = (searchTerm: string): string => {
  const findData =
    'YTo0OntzOjU6ImZpZWxkIjtzOjk6ImNvbnRhY3RpZCI7czo1OiJxdWVyeSI7czo5OiJmX2NvbnRhY3QiO3M6NToibGltaXQiO3M6MjoiMTAiO3M6NjoiZmllbGRzIjtzOjQyOiJjb250YWN0aWQ7Y29tcGFueTtmaXJzdG5hbWU7bGFzdG5hbWU7ZW1haWwiO30=';
  const body = new URLSearchParams();
  body.set('find-data', findData);
  body.set('find-value', searchTerm);
  return body.toString();
};

export const performSearch = async (
  searchTerm: string,
  signal?: AbortSignal | null
): Promise<Array<{ value: string; label: string }>> => {
  const sessionId = getSessionId();
  if (!sessionId) throw new Error('Session ID not found.');

  const url = `${location.origin}/_ajax.php?sessionid=${encodeURIComponent(
    sessionId
  )}&find-field&time=${Date.now()}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'x-requested-with': 'XMLHttpRequest',
      accept: '*/*',
    },
    credentials: 'include',
    body: buildFindPayload(searchTerm),
    signal,
  });

  if (!res.ok) {
    throw new Error(
      `Search for "${searchTerm}" failed: ${res.status} ${res.statusText}`
    );
  }

  const data = await res.json();
  if (!Array.isArray(data?.options)) return [];

  return data.options.map((option: { value: unknown; label: unknown }) => ({
    value: String(option?.value ?? ''),
    label: decodeHtml(String(option?.label ?? '')),
  }));
};