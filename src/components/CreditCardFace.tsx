import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { fmt } from '../theme';
import { formatCardDueShort, skinForIssuer, type CreditCardView } from '../lib/cardFaces';

type Props = {
  card: CreditCardView;
  holder?: string | null;
  currency: string;
  compact?: boolean;
  dueLabel: string;
  paidLabel: string;
  noStatementLabel: string;
  onPress?: () => void;
};

export function CreditCardFace({
  card,
  holder,
  currency,
  compact,
  dueLabel,
  paidLabel,
  noStatementLabel,
  onPress,
}: Props) {
  const skin = skinForIssuer(card.issuer);
  const due = formatCardDueShort(card.dueDate);
  const amount =
    card.remaining != null && card.remaining > 0
      ? fmt(Math.round(card.remaining), currency)
      : card.paid
        ? paidLabel
        : card.dueDate && card.totalDue != null && card.totalDue > 0
          ? fmt(Math.round(card.remaining ?? 0), currency)
          : null;

  return (
    <Pressable onPress={onPress} disabled={!onPress} style={compact ? styles.compactWrap : styles.wrap}>
      <LinearGradient
        colors={[skin.from, skin.to]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.face, compact && styles.faceCompact]}
      >
        <View style={styles.top}>
          <View>
            <Text style={[styles.issuer, { color: skin.ink }]} numberOfLines={1}>
              {card.issuer}
            </Text>
            <Text style={[styles.network, { color: skin.muted }]}>CREDIT CARD</Text>
          </View>
          <View style={styles.dueBlock}>
            {amount ? (
              <Text style={[styles.amount, { color: skin.ink }]} numberOfLines={1}>
                {amount}
              </Text>
            ) : (
              <Text style={[styles.noBill, { color: skin.muted }]}>{noStatementLabel}</Text>
            )}
            {due && !card.paid ? (
              <Text style={[styles.due, { color: skin.muted }]}>
                {dueLabel.replace('{date}', due)}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.mid}>
          <View style={styles.chip} />
          <Text style={[styles.pan, { color: skin.ink }]}>
            {card.last4 ? `••••  ${card.last4}` : '••••  ••••'}
          </Text>
        </View>

        <Text style={[styles.holder, { color: skin.ink }]} numberOfLines={1}>
          {(holder || '').trim().toUpperCase() || card.issuer.toUpperCase()}
        </Text>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  compactWrap: { width: 260 },
  face: {
    borderRadius: 18,
    padding: 18,
    minHeight: 168,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  faceCompact: {
    minHeight: 148,
    padding: 14,
  },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  issuer: { fontSize: 15, fontWeight: '800', letterSpacing: 0.4 },
  network: { marginTop: 3, fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  dueBlock: { alignItems: 'flex-end', maxWidth: '55%' },
  amount: { fontSize: 18, fontWeight: '800' },
  noBill: { fontSize: 11, fontWeight: '700' },
  due: { marginTop: 3, fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
  mid: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 18 },
  chip: {
    width: 34,
    height: 26,
    borderRadius: 5,
    backgroundColor: '#E6C36A',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  pan: { fontSize: 18, fontWeight: '700', letterSpacing: 2 },
  holder: { marginTop: 16, fontSize: 12, fontWeight: '800', letterSpacing: 1.2 },
});
