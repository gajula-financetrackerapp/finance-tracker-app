import { useApp } from '../context/AppContext';
import { categoryLabel } from './categoryLabels';
import { translate, type TranslationKey } from './translations';

/** Hook: `t('home.income')` follows the Language setting. */
export function useT() {
  const { config } = useApp();
  const lang = config.language;

  // Recreate every render when lang changes — avoid stale memoized translators.
  const t = (key: TranslationKey, params?: Record<string, string | number>) => {
    const raw = translate(lang, key);
    if (!params) return raw;
    let out = raw;
    for (const [name, value] of Object.entries(params)) {
      out = out.split(`{${name}}`).join(String(value));
    }
    return out;
  };
  const catName = (name: string) => categoryLabel(lang, name);

  return { t, lang, catName };
}
