import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../context/AppContext';
import { useT } from '../i18n/useT';
import type { SplitPaySource } from '../lib/splitTypes';
import {
  accountChipLabel,
  accountIdForSplitPaySource,
  isCoreCardAccount,
} from '../cashBooks';
import { DropdownSelect } from './DropdownSelect';

type Props = {
  paySource: SplitPaySource;
  accountId: string;
  onChange: (source: SplitPaySource, accountId: string) => void;
};

export function SplitPaySourcePicker({ paySource, accountId, onChange }: Props) {
  const { theme, finance } = useApp();
  const { t } = useT();
  const styles = useMemo(() => makeStyles(), []);

  const cards = useMemo(
    () => (finance.accounts || []).filter((a) => !a.excluded && isCoreCardAccount(a)),
    [finance.accounts],
  );

  const pick = (source: SplitPaySource) => {
    const nextId =
      accountIdForSplitPaySource(finance.accounts, source, source === paySource ? accountId : null) ||
      '';
    onChange(source, nextId);
  };

  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ color: theme.muted, fontSize: 12, fontWeight: '700', marginBottom: 6 }}>
        {t('split.paidFrom')}
      </Text>
      <View style={[styles.tabs, { borderColor: theme.ink }]}>
        <Pressable
          style={[
            styles.tab,
            { backgroundColor: theme.accentSoft },
            paySource === 'bank' && { backgroundColor: theme.header },
          ]}
          onPress={() => pick('bank')}
        >
          <Text
            style={[
              styles.tabText,
              { color: theme.ink },
              paySource === 'bank' && styles.tabTextOn,
            ]}
          >
            {t('split.paidFromBank')}
          </Text>
        </Pressable>
        <Pressable
          style={[
            styles.tab,
            { backgroundColor: theme.accentSoft },
            paySource === 'card' && { backgroundColor: theme.header },
          ]}
          onPress={() => pick('card')}
        >
          <Text
            style={[
              styles.tabText,
              { color: theme.ink },
              paySource === 'card' && styles.tabTextOn,
            ]}
            numberOfLines={1}
          >
            {t('split.paidFromCard')}
          </Text>
        </Pressable>
      </View>
      <Text style={{ color: theme.muted, fontSize: 11, marginTop: 6, marginBottom: 4, lineHeight: 15 }}>
        {t('split.paidFromHint')}
      </Text>
      {paySource === 'card' && cards.length > 1 ? (
        <DropdownSelect
          label={t('split.paidFromCardPick')}
          value={accountId}
          placeholder={t('add.cardPick')}
          options={cards.map((a) => ({
            value: a.id,
            label: accountChipLabel(a),
          }))}
          onChange={(id) => onChange('card', id)}
          overlay
        />
      ) : null}
    </View>
  );
}

function makeStyles() {
  return StyleSheet.create({
    tabs: {
      flexDirection: 'row',
      borderWidth: 1.5,
      borderRadius: 10,
      overflow: 'hidden',
    },
    tab: {
      flex: 1,
      paddingVertical: 10,
      alignItems: 'center',
    },
    tabText: { fontWeight: '700', fontSize: 13.5 },
    tabTextOn: { color: '#fff' },
  });
}
