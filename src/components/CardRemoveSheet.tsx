import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../context/AppContext';
import { BottomSheet } from './BottomSheet';
import { PrimaryButton, choiceLabel, choiceSurface } from './ui';
import { showAppInfo } from '../appDialog';
import { requireAuthToSave } from '../authGate';
import type { CreditCardView } from '../lib/cardFaces';
import type { ThemeTokens } from '../types';
import { useT } from '../i18n/useT';

type Props = {
  card: CreditCardView | null;
  onClose: () => void;
  onRemove: (last4s: string[]) => void;
};

function pansOnCard(card: CreditCardView | null): string[] {
  if (!card) return [];
  if (card.last4s?.length) return [...new Set(card.last4s.filter(Boolean))];
  return card.last4 ? [card.last4] : [];
}

export function CardRemoveSheet({ card, onClose, onRemove }: Props) {
  const { theme } = useApp();
  const { t } = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const pans = pansOnCard(card);
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => {
    setPicked([]);
  }, [card?.id]);

  if (!card) return null;

  const allOn = pans.length > 0 && pans.every((p) => picked.includes(p));
  const toggle = (last4: string) => {
    setPicked((cur) => (cur.includes(last4) ? cur.filter((x) => x !== last4) : [...cur, last4]));
  };

  const save = () => {
    if (!requireAuthToSave('remove a credit card')) return;
    if (!picked.length) {
      showAppInfo(t('cards.removePickTitle'), t('cards.removeNeedPick'), '💳');
      return;
    }
    onRemove(picked);
  };

  return (
    <BottomSheet visible={!!card} onClose={onClose}>
      <Text style={styles.title}>{t('cards.removePickTitle')}</Text>
      <Text style={styles.lead}>{t('cards.removePickLead').replace('{issuer}', card.issuer)}</Text>
      <Pressable
        onPress={() => setPicked(allOn ? [] : [...pans])}
        style={[styles.row, choiceSurface(theme, allOn)]}
      >
        <Text style={[styles.rowText, choiceLabel(theme, allOn)]}>
          {allOn ? t('cards.removePickNone') : t('cards.removePickAll')}
        </Text>
      </Pressable>
      <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
        {pans.map((last4) => {
          const on = picked.includes(last4);
          return (
            <Pressable
              key={last4}
              onPress={() => toggle(last4)}
              style={[styles.row, choiceSurface(theme, on)]}
            >
              <Text style={[styles.rowText, choiceLabel(theme, on)]}>
                {t('cards.removePickCard').replace('{issuer}', card.issuer).replace('{last4}', last4)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <PrimaryButton title={t('cards.removePickCta')} onPress={save} danger />
      <Pressable onPress={onClose} style={styles.later}>
        <Text style={styles.laterText}>{t('common.cancel')}</Text>
      </Pressable>
    </BottomSheet>
  );
}

function makeStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    title: { color: theme.ink, fontSize: 18, fontWeight: '800', marginBottom: 8 },
    lead: { color: theme.muted, fontSize: 13, fontWeight: '600', lineHeight: 18, marginBottom: 12 },
    list: { maxHeight: 280, marginBottom: 8 },
    row: {
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 8,
    },
    rowText: { fontSize: 15, fontWeight: '700' },
    later: { alignItems: 'center', paddingVertical: 12 },
    laterText: { color: theme.muted, fontWeight: '800', fontSize: 14 },
  });
}
