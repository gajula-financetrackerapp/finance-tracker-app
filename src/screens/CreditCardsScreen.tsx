import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useApp } from '../context/AppContext';
import { useFinance } from '../FinanceContext';
import { requireAuthToSave } from '../authGate';
import { showAppInfo } from '../appDialog';
import { Screen, EmptyState } from '../components/ui';
import { CardAmountActivitySheet } from '../components/CardAmountActivitySheet';
import { CardCycleDatesSheet } from '../components/CardCycleDatesSheet';
import { CreditCardFace } from '../components/CreditCardFace';
import type { CardActivityKind } from '../lib/cardActivity';
import { cardsMissingCycleDates, listCreditCardViews, type CreditCardView } from '../lib/cardFaces';
import { fmt } from '../theme';
import { confirmMarkExpensePaid } from '../utils/markExpensePaid';
import { useAlarms } from '../alarms/AlarmContext';
import { useT } from '../i18n/useT';
import { RootStackParamList } from '../navigation/types';

export function CreditCardsScreen() {
  const {
    theme,
    config,
    finance,
    expenseReminders,
    setExpenseReminders,
    addTransaction,
    refreshCardBillReminders,
  } = useApp();
  const { session } = useFinance();
  const { syncAlarmIfType } = useAlarms();
  const { t } = useT();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const styles = useMemo(() => makeStyles(), []);
  const holder = session?.user?.email?.split('@')[0] || '';
  const [refreshing, setRefreshing] = useState(false);
  const [dateCard, setDateCard] = useState<CreditCardView | null>(null);
  const [activity, setActivity] = useState<{
    card: CreditCardView;
    kind: CardActivityKind;
  } | null>(null);

  const cards = useMemo(
    () => listCreditCardViews(finance.accounts, expenseReminders, finance.transactions),
    [finance.accounts, expenseReminders, finance.transactions],
  );
  const openBills = cards.filter((c) => !c.paid && (c.remaining || 0) > 0);
  const totalDue = openBills.reduce((s, c) => s + (c.remaining || 0), 0);

  const askForMissingDates = (views: CreditCardView[], skipId?: string) => {
    const missing = cardsMissingCycleDates(views).filter((c) => c.id !== skipId);
    setDateCard(missing[0] || null);
    return missing.length > 0;
  };

  const onRefresh = async () => {
    if (!requireAuthToSave('refresh card statements')) return;
    setRefreshing(true);
    try {
      const result = await refreshCardBillReminders();
      if (result.error === 'SMS_MODULE_MISSING') {
        showAppInfo(t('cards.title'), t('cards.refreshNeedBuild'), '📥');
        return;
      }
      if (result.error === 'SMS_PERMISSION_DENIED') {
        showAppInfo(t('cards.title'), t('cards.refreshDenied'), '🔒');
        return;
      }
      if (result.error === 'FEATURE_OFF') {
        showAppInfo(t('cards.title'), t('cards.refreshOff'), '⚠️');
        return;
      }
      if (result.error === 'AUTH') {
        return;
      }
      const views = listCreditCardViews(
        finance.accounts,
        result.reminders,
        finance.transactions,
      );
      if (askForMissingDates(views)) {
        return;
      }
      if (result.updated) {
        showAppInfo(
          t('cards.title'),
          t('cards.refreshOk')
            .replace('{statements}', String(result.statementCount))
            .replace('{payments}', String(result.paymentCount)),
          '✅',
        );
        return;
      }
      showAppInfo(t('cards.title'), t('cards.refreshNone'), '💳');
    } finally {
      setRefreshing(false);
    }
  };

  const saveCardDates = async (next: typeof expenseReminders) => {
    const savedId = dateCard?.id;
    await setExpenseReminders(next);
    const views = listCreditCardViews(finance.accounts, next, finance.transactions);
    askForMissingDates(views, savedId);
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={styles.headRow}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={[styles.h1, { color: theme.ink }]}>{t('cards.title')}</Text>
            <Text style={[styles.lead, { color: theme.muted }]}>
              {openBills.length
                ? t('cards.statementDueFor').replace('{n}', String(openBills.length))
                : t('cards.lead')}
            </Text>
          </View>
          <Pressable
            onPress={() => void onRefresh()}
            disabled={refreshing}
            style={[styles.refreshBtn, { backgroundColor: theme.ink, opacity: refreshing ? 0.7 : 1 }]}
          >
            {refreshing ? (
              <ActivityIndicator color={theme.bg} />
            ) : (
              <Text style={[styles.refreshBtnText, { color: theme.bg }]}>{t('cards.refresh')}</Text>
            )}
          </Pressable>
        </View>
        {openBills.length ? (
          <Text style={[styles.total, { color: theme.ink }]}>{fmt(Math.round(totalDue), config.currency)}</Text>
        ) : null}

        {cards.length === 0 ? (
          <EmptyState icon="💳" title={t('cards.empty')} subtitle={t('cards.emptySub')} />
        ) : (
          cards.map((card) => {
            const reminder = expenseReminders.find((r) => r.id === card.reminderId);
            return (
              <View key={card.id} style={styles.cardBlock}>
                <CreditCardFace
                  card={card}
                  holder={holder}
                  currency={config.currency}
                  dueLabel={t('cards.dueOn')}
                  paidLabel={t('cards.paid')}
                  noStatementLabel={t('cards.noStatement')}
                  statementOnLabel={t('cards.statementOn')}
                  expensesLabel={t('cards.unbilled')}
                  markPaidLabel={t('cards.markPaid')}
                  addStatementLabel={t('cards.addStatementDate')}
                  addDueLabel={t('cards.addDueDate')}
                  addBothLabel={t('cards.addBothDates')}
                  onPress={
                    card.needsStatementDate || card.needsDueDate
                      ? () => setDateCard(card)
                      : () => navigation.navigate('ExpenseReminder')
                  }
                  onAddDates={() => setDateCard(card)}
                  onPressStatementAmount={() => setActivity({ card, kind: 'statement' })}
                  onPressExpenses={() => setActivity({ card, kind: 'expenses' })}
                  onMarkPaid={
                    reminder && !reminder.paid
                      ? () =>
                          confirmMarkExpensePaid(reminder, {
                            expenseReminders,
                            setExpenseReminders,
                            finance,
                            addTransaction,
                            syncAlarmIfType,
                            language: config.language,
                          })
                      : undefined
                  }
                />
              </View>
            );
          })
        )}
      </ScrollView>
      <CardCycleDatesSheet
        card={dateCard}
        reminders={expenseReminders}
        offsets={config.expenseOffsets?.length ? config.expenseOffsets : [1, 0]}
        onClose={() => setDateCard(null)}
        onSave={saveCardDates}
      />
      <CardAmountActivitySheet
        card={activity?.card || null}
        kind={activity?.kind || null}
        reminder={
          activity?.card.reminderId
            ? expenseReminders.find((r) => r.id === activity.card.reminderId)
            : undefined
        }
        transactions={finance.transactions}
        currency={config.currency}
        onClose={() => setActivity(null)}
      />
    </Screen>
  );
}

function makeStyles() {
  return StyleSheet.create({
    headRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
    h1: { fontSize: 22, fontWeight: '800', marginBottom: 6 },
    lead: { fontSize: 13, fontWeight: '600' },
    total: { fontSize: 28, fontWeight: '800', marginBottom: 18 },
    refreshBtn: {
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      minWidth: 88,
      alignItems: 'center',
      justifyContent: 'center',
    },
    refreshBtnText: { fontWeight: '800', fontSize: 13 },
    cardBlock: { marginBottom: 18 },
  });
}
