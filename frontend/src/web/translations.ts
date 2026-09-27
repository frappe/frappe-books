import { frappeRequest } from 'frappe-ui';
import { setLanguageMapOnTranslationString } from 'fyo/utils/translation';
import type { LanguageMap } from 'utils/types';

export function useTranslations(messages: Record<string, string>): LanguageMap {
  const map: LanguageMap = {};
  for (const [source, translation] of Object.entries(messages)) {
    if (!translation?.trim()) continue;
    // Frappe numbers placeholders as {0}; Books uses ${0}.
    const convert = (text: string) => text.replace(/(?<!\$)\{(\d+)\}/g, '$$$&');
    map[convert(source)] = { translation: convert(translation) };
  }
  setLanguageMapOnTranslationString(map);
  return map;
}

export async function loadTranslations(language: string) {
  if (!language || language === 'en') return useTranslations({});
  const messages = await frappeRequest<Record<string, string> | null>({
    url: 'frappe.translate.get_boot_translations',
    method: 'GET',
    params: { lang: language },
  });
  return useTranslations(messages ?? {});
}
