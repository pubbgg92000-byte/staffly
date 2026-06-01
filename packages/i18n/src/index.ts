/**
 * @staffly/i18n — translation key registry and lookup.
 *
 * Phase 1 is English-only, but every UI string flows through `t(key)` so a translation
 * pass becomes mechanical. Replace this stub with a full i18next/next-intl integration
 * when adding the first non-English locale.
 */
import en from "./locales/en.json" with { type: "json" };

const dictionaries = { en } as const;

export type Locale = keyof typeof dictionaries;
export type TranslationKey = keyof typeof en;

export function t(key: TranslationKey, locale: Locale = "en"): string {
  const dict = dictionaries[locale] ?? dictionaries.en;
  return dict[key] ?? key;
}

export { en };
