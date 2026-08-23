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
  statementOnLabel: string;
  expensesLabel: string;
  markPaidLabel: string;
  addStatementLabel: string;
  addDueLabel: string;
  addBothLabel: string;
  addAmountLabel: string;
  onPress?: () => void;
  onMarkPaid?: () => void;
  onAddDates?: () => void;
  onPressStatementAmount?: () => void;
  onPressExpenses?: () => void;
};

export function CreditCardFace({
  card,
  holder,
  currency,
  compact,
  dueLabel,
  paidLabel,
  noStatementLabel,
  statementOnLabel,
  expensesLabel,
  markPaidLabel,
  addStatementLabel,
  addDueLabel,
  addBothLabel,
  addAmountLabel,
  onPress,
  onMarkPaid,
  onAddDates,
  onPressStatementAmount,
  onPressExpenses,
}: Props) {
  const skin = skinForIssuer(card.issuer);
  const due = formatCardDueShort(card.dueDate);
  const stmtIso =
    card.phase === 'stated'
      ? card.statementDate
      : card.nextStatementDate || card.statementDate;
  const stmtDate = formatCardDueShort(stmtIso);
  const spendFrom = formatCardDueShort(card.spendFrom);
  const spendTo = formatCardDueShort(card.spendTo);
  const stated = card.phase === 'stated';
  const headline =
    stated && card.remaining != null && card.remaining > 0
      ? fmt(Math.round(card.remaining), currency)
      : stated && card.paid
        ? paidLabel
        : stated && card.totalDue != null && card.totalDue > 0
          ? fmt(Math.round(card.totalDue), currency)
          : null;
  const canMarkPaid = !!onMarkPaid && !card.paid && (card.remaining || 0) > 0;

  return (
    <Pressable onPress={onPress} disabled={!onPress} style={compact ? styles.compactWrap : styles.wrap}>
      <LinearGradient
        colors={[skin.from, skin.to]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.face, compact && styles.faceCompact]}
      >
        <View style={styles.top}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text style={[styles.issuer, { color: skin.ink }]} numberOfLines={1}>
              {card.issuer}
            </Text>
            <Text style={[styles.network, { color: skin.muted }]}>CREDIT CARD</Text>
          </View>
          <View style={styles.dueBlock}>
            {headline ? (
              <Pressable onPress={onPressStatementAmount} disabled={!onPressStatementAmount}>
                <Text style={[styles.amount, { color: skin.ink }]} numberOfLines={1}>
                  {headline}
                </Text>
              </Pressable>
            ) : (
              <Text style={[styles.noBill, { color: skin.muted }]}>{noStatementLabel}</Text>
            )}
            {stmtDate ? (
              <Text style={[styles.stmtOn, { color: skin.muted }]}>
                {statementOnLabel.replace('{date}', stmtDate)}
              </Text>
            ) : null}
            {due ? (
              <Text style={[styles.due, { color: skin.muted }]}>
                {dueLabel.replace('{date}', due)}
              </Text>
            ) : null}
            {onAddDates &&
            (card.needsStatementDate || card.needsDueDate || card.needsAmount) ? (
              <Pressable onPress={onAddDates} hitSlop={8}>
                <Text style={[styles.addDates, { color: skin.ink }]}>
                  {card.needsStatementDate && card.needsDueDate
                    ? addBothLabel
                    : card.needsStatementDate
                      ? addStatementLabel
                      : card.needsDueDate
                        ? addDueLabel
                        : addAmountLabel}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={styles.mid}>
          <View style={styles.chip} />
          <Text style={[styles.pan, { color: skin.ink }]}>
            {card.last4 ? `••••  ${card.last4}` : '••••  ••••'}
          </Text>
        </View>

        <View style={styles.bottom}>
          <Text style={[styles.holder, { color: skin.ink }]} numberOfLines={1}>
            {(holder || '').trim().toUpperCase() || card.issuer.toUpperCase()}
          </Text>
          <View style={styles.rightCol}>
            {spendFrom && spendTo ? (
              <>
                <Text style={[styles.expLabel, { color: skin.muted }]}>{expensesLabel}</Text>
                <Text style={[styles.range, { color: skin.muted }]}>
                  {spendFrom} – {spendTo}
                </Text>
                <Pressable onPress={onPressExpenses} disabled={!onPressExpenses}>
                  <Text style={[styles.expAmt, { color: skin.ink }]}>
                    {fmt(Math.round(card.unbilledExpenses), currency)}
                  </Text>
                </Pressable>
              </>
            ) : null}
            {canMarkPaid ? (
              <Pressable
                onPress={onMarkPaid}
                style={[styles.markPaid, { borderColor: skin.muted }]}
              >
                <Text style={[styles.markPaidText, { color: skin.ink }]}>{markPaidLabel}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
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
    minHeight: 188,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  faceCompact: {
    minHeight: 168,
    padding: 14,
  },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  issuer: { fontSize: 15, fontWeight: '800', letterSpacing: 0.4 },
  network: { marginTop: 3, fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  dueBlock: { alignItems: 'flex-end', maxWidth: '58%' },
  amount: { fontSize: 18, fontWeight: '800', textDecorationLine: 'underline' },
  noBill: { fontSize: 11, fontWeight: '700' },
  due: { marginTop: 3, fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
  stmtOn: { marginTop: 3, fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  addDates: {
    marginTop: 6,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
    textDecorationLine: 'underline',
  },
  mid: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 16 },
  chip: {
    width: 34,
    height: 26,
    borderRadius: 5,
    backgroundColor: '#E6C36A',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  pan: { fontSize: 18, fontWeight: '700', letterSpacing: 2 },
  bottom: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 10,
  },
  holder: { flex: 1, fontSize: 12, fontWeight: '800', letterSpacing: 1.2 },
  rightCol: { alignItems: 'flex-end', maxWidth: '58%' },
  range: { fontSize: 9, fontWeight: '700', letterSpacing: 0.4 },
  expLabel: { marginTop: 2, fontSize: 8, fontWeight: '800', letterSpacing: 0.8 },
  expAmt: { marginTop: 1, fontSize: 13, fontWeight: '800', textDecorationLine: 'underline' },
  markPaid: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  markPaidText: { fontSize: 10, fontWeight: '800' },
});
