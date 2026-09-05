import React, { useRef } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useApp } from '../context/AppContext';
import { useKeyboardScroll } from './KeyboardScrollContext';
import { useT } from '../i18n/useT';
import { choiceSurface } from './ui';
import { buildSharesForMode, splitModeInputLabel } from '../lib/splitExpense';
import { SPLIT_MODE_OPTIONS } from '../lib/splitTypes';
import type { SplitMode } from '../lib/splitTypes';

export function SplitShareOptionsEditor({
  mode,
  onModeChange,
  participantIds,
  nameOf,
  sym,
  total,
  custom,
  onCustomChange,
  fieldBg,
}: {
  mode: Exclude<SplitMode, 'custom'>;
  onModeChange: (m: Exclude<SplitMode, 'custom'>) => void;
  participantIds: string[];
  nameOf: (id: string) => string;
  sym: string;
  total: number;
  custom: Record<string, string>;
  onCustomChange: (id: string, text: string) => void;
  fieldBg: string;
}) {
  const { theme } = useApp();
  const { t } = useT();
  const { registerFocus } = useKeyboardScroll();
  const rowRefs = useRef<Record<string, View | null>>({});

  const icons: Record<Exclude<SplitMode, 'custom'>, string> = {
    equal: '=',
    exact: '1.23',
    percentage: '%',
    shares: '▮|',
    adjustment: '+/−',
  };

  const titleKey = {
    equal: 'split.modeEqualTitle',
    exact: 'split.modeExactTitle',
    percentage: 'split.modePercentageTitle',
    shares: 'split.modeSharesTitle',
    adjustment: 'split.modeAdjustmentTitle',
  } as const;
  const bodyKey = {
    equal: 'split.modeEqualBody',
    exact: 'split.modeExactBody',
    percentage: 'split.modePercentageBody',
    shares: 'split.modeSharesBody',
    adjustment: 'split.modeAdjustmentBody',
  } as const;

  const inputs: Record<string, number> = {};
  for (const id of participantIds) {
    const raw = (custom[id] || '').replace(/,/g, '');
    inputs[id] = parseFloat(raw) || 0;
  }
  const preview = buildSharesForMode(mode, total, participantIds, inputs);
  const moneySum = preview.reduce((a, s) => a + s.shareAmount, 0);
  const pctUsed = participantIds.reduce((a, id) => a + (inputs[id] || 0), 0);
  const shareWeights = participantIds.reduce((a, id) => a + (inputs[id] || 0), 0);
  const adjSum = participantIds.reduce((a, id) => a + (inputs[id] || 0), 0);
  const suffix = splitModeInputLabel(mode, sym);

  return (
    <View style={{ marginTop: 12 }}>
      <Text style={{ color: theme.muted, fontSize: 12, fontWeight: '700', marginBottom: 6 }}>
        {t('split.splitType')}
      </Text>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 6, marginBottom: 10 }}>
        {SPLIT_MODE_OPTIONS.map((m) => {
          const on = mode === m;
          return (
            <Pressable
              key={m}
              onPress={() => onModeChange(m)}
              style={[
                {
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 44,
                },
                choiceSurface(theme, on),
              ]}
            >
              <Text
                style={{
                  color: on ? theme.onInk : theme.ink,
                  fontWeight: '900',
                  fontSize: m === 'exact' ? 11 : 16,
                }}
              >
                {icons[m]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={{ color: theme.ink, fontWeight: '800', fontSize: 14 }}>{t(titleKey[mode])}</Text>
      <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2, marginBottom: 10, lineHeight: 16 }}>
        {t(bodyKey[mode])}
      </Text>

      {mode !== 'equal'
        ? participantIds.map((id) => (
            <View
              key={id}
              ref={(node) => {
                rowRefs.current[id] = node;
              }}
              collapsable={false}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                marginBottom: 10,
                minHeight: 48,
              }}
            >
              <Text style={{ color: theme.ink, fontWeight: '700', flex: 1 }} numberOfLines={1}>
                {nameOf(id)}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 120 }}>
                <TextInput
                  value={custom[id] || ''}
                  onChangeText={(text) => onCustomChange(id, text)}
                  onFocus={() => {
                    const row = rowRefs.current[id];
                    registerFocus(row);
                    setTimeout(() => registerFocus(rowRefs.current[id]), 80);
                    setTimeout(() => registerFocus(rowRefs.current[id]), 260);
                  }}
                  keyboardType={
                    mode === 'shares'
                      ? 'number-pad'
                      : mode === 'adjustment'
                        ? 'numbers-and-punctuation'
                        : 'decimal-pad'
                  }
                  placeholder="0"
                  placeholderTextColor={theme.muted}
                  style={{
                    flex: 1,
                    borderWidth: 1.5,
                    borderColor: theme.line,
                    backgroundColor: fieldBg,
                    borderRadius: 10,
                    color: theme.ink,
                    fontWeight: '700',
                    fontSize: 16,
                    textAlign: 'right',
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    minWidth: 72,
                  }}
                />
                <Text style={{ color: theme.muted, fontWeight: '700', fontSize: 12, minWidth: 28 }}>
                  {suffix}
                </Text>
              </View>
            </View>
          ))
        : null}

      {mode === 'percentage' ? (
        <Text style={{ color: theme.muted, fontSize: 12, marginTop: 4 }}>
          {t('split.pctOf').replace('{used}', pctUsed.toFixed(pctUsed % 1 ? 1 : 0))}
          {' · '}
          {t('split.pctLeft').replace(
            '{left}',
            Math.max(0, 100 - pctUsed).toFixed((100 - pctUsed) % 1 ? 1 : 0),
          )}
        </Text>
      ) : null}
      {mode === 'shares' ? (
        <Text style={{ color: theme.muted, fontSize: 12, marginTop: 4 }}>
          {t('split.sharesTotal').replace('{n}', String(shareWeights))}
        </Text>
      ) : null}
      {mode === 'adjustment' ? (
        <Text style={{ color: theme.muted, fontSize: 12, marginTop: 4 }}>
          {t('split.adjHint')}
          {Math.abs(adjSum) > 0.009 ? ` · Σ ${adjSum > 0 ? '+' : ''}${adjSum.toFixed(2)}` : ''}
        </Text>
      ) : null}

      {total > 0 && participantIds.length > 1 ? (
        <Text style={{ color: theme.muted, fontSize: 12, marginTop: 8, marginBottom: 4 }}>
          {preview
            .map((s) => `${nameOf(s.userId)}: ${sym}${s.shareAmount.toFixed(2)}`)
            .join(' · ')}
          {mode !== 'equal' && Math.abs(moneySum - total) > 0.02
            ? ` · Σ ${sym}${moneySum.toFixed(2)}`
            : ''}
        </Text>
      ) : null}
    </View>
  );
}
