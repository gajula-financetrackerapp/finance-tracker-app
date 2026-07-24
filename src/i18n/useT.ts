import { useCallback, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { categoryLabel } from './categoryLabels';
import { translate, type TranslationKey } from './translations';

/** Hook: `t('home.income')` follows the Language setting. */
export function useT() {
  const { config } = useApp();
  const lang = config.language;

  const t = useCallback(
    (key: TranslationKey) => translate(lang, key),
    [lang],
  );

  /** Built-in category display name; custom names pass through. */
  const catName = useCallback(
    (name: string) => categoryLabel(lang, name),
    [lang],
  );

  return useMemo(() => ({ t, lang, catName }), [t, lang, catName]);
}
