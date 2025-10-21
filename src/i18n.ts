import nl from './locales/nl.json';

const LOCALES: Record<string, Record<string, string>> = {
  nl,
};

let current = 'nl';

export const t = (key: string, vars?: Record<string, string | number>): string => {
  const res = LOCALES[current]?.[key] ?? key;
  if (!vars) return res;
  return Object.keys(vars).reduce((s, k) => s.replace(`{${k}}`, String(vars[k])), res);
};

export const setLocale = (locale: string) => {
  if (LOCALES[locale]) current = locale;
};

export default { t, setLocale };
