let isString = (s: unknown): s is string => typeof s === 'string';

type Locale = string;

type WithLocaleOrLocales = {locale: Locale} | {locales: Locale[]};

/** Memoized cache */
let cache = new Map<string, unknown>();

let defaultLocale = 'en';

function normalizeLocales(options: WithLocaleOrLocales): string[] {
  if ('locale' in options) {
    return [options.locale, defaultLocale];
  }

  if ('locales' in options) {
    return [...options.locales, defaultLocale];
  }

  return [defaultLocale];
}

export type FormatDateTimeOptions = Intl.DateTimeFormatOptions & WithLocaleOrLocales;

export function formatDateTime(value: Date | string, options: FormatDateTimeOptions): string {
  let normalizedLocales = normalizeLocales(options);

  let formatter = getMemoized(
    () => cacheKey('date', normalizedLocales, options),
    () => new Intl.DateTimeFormat(normalizedLocales, options),
  );

  return formatter.format(isString(value) ? new Date(value) : value);
}

export type FormatNumberOptions = Intl.NumberFormatOptions & WithLocaleOrLocales;

export function formatNumber(value: number, options: FormatNumberOptions): string {
  let normalizedLocales = normalizeLocales(options);

  let formatter = getMemoized(
    () => cacheKey('number', normalizedLocales, options),
    () => new Intl.NumberFormat(normalizedLocales, options),
  );

  return formatter.format(value);
}

function getMemoized<T>(getKey: () => string, construct: () => T) {
  let key = getKey();

  let formatter = cache.get(key) as T;

  if (!formatter) {
    formatter = construct();
    cache.set(key, formatter);
  }

  return formatter;
}

function cacheKey(
  type: string,
  locales: readonly string[],
  options?: Intl.DateTimeFormatOptions | Intl.NumberFormatOptions,
) {
  let localeKey = locales.join('-');

  return `${type}-${localeKey}-${JSON.stringify(options)}`;
}
