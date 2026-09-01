import { useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '../context/AppContext';
import { useFinance } from '../FinanceContext';
import { useSplit } from '../context/SplitContext';
import { showAppDialog } from '../appDialog';
import { fmt } from '../theme';
import { useT } from '../i18n/useT';
import {
  foldSplitSettleIntoHomeExpenses,
  nextSplitSettleToAsk,
  paidFullExpenseIdsForSettlement,
  restoreHiddenSplitSettlements,
} from './splitHomeFold';

/** One in-app dialog at a time across Home and the transaction list. */
let promptLock = false;

const RESTORE_KEY = 'split.homeFold.restoreHidden.v1';

type Opts = {
  delayMs?: number;
  /** When false, only restore accidentally hidden settlement income. */
  ask?: boolean;
};

/**
 * After a friend settles, settlement income stays on Home unless the user
 * explicitly chooses “show my share only”. Split history is not changed.
 */
export function useSplitSettleHomePrompt(options: Opts = {}) {
  const delayMs = options.delayMs ?? 400;
  const ask = options.ask !== false;
  const { finance, updateTransaction, config } = useApp();
  const { session, isGuest } = useFinance();
  const { expenses, settlements, loading, canUseSplit } = useSplit();
  const { t } = useT();
  const txnsRef = useRef(finance.transactions);
  txnsRef.current = finance.transactions;
  const splitRef = useRef({
    expenses,
    settlements,
    selfId: session?.user?.id || null,
  });
  splitRef.current = {
    expenses,
    settlements,
    selfId: session?.user?.id || null,
  };

  useFocusEffect(
    useCallback(() => {
      if (isGuest) return undefined;
      let cancelled = false;
      const timer = setTimeout(() => {
        void (async () => {
          if (cancelled || promptLock) return;
          if (canUseSplit && loading) return;

          const hidden = txnsRef.current.filter(
            (t) => t.kind === 'income' && !!t.splitSettlementId && t.homeHidden,
          );
          if (hidden.length) {
            const already = await AsyncStorage.getItem(RESTORE_KEY);
            if (already !== '1') {
              promptLock = true;
              try {
                await restoreHiddenSplitSettlements(txnsRef.current, updateTransaction);
                await AsyncStorage.setItem(RESTORE_KEY, '1');
              } finally {
                promptLock = false;
              }
              return;
            }
          }

          if (!ask) return;
          const income = nextSplitSettleToAsk(txnsRef.current);
          if (!income || cancelled) return;
          promptLock = true;
          const amount = fmt(Math.abs(Number(income.amount) || 0), config.currency);

          const keepIncome = () => {
            promptLock = false;
            const latest = txnsRef.current.find((x) => x.id === income.id) || income;
            void updateTransaction({ ...latest, splitSettleAsked: true, homeHidden: false });
          };

          showAppDialog({
            title: t('home.foldSettleTitle'),
            message: t('home.foldSettleBody').replace('{amount}', amount),
            icon: '💸',
            onDismiss: keepIncome,
            buttons: [
              {
                text: t('home.foldSettleKeep'),
                style: 'primary',
                onPress: keepIncome,
              },
              {
                text: t('home.foldSettleFold'),
                style: 'default',
                onPress: () => {
                  const latest = txnsRef.current.find((x) => x.id === income.id) || income;
                  const ids = paidFullExpenseIdsForSettlement(latest, splitRef.current);
                  void foldSplitSettleIntoHomeExpenses(
                    latest,
                    txnsRef.current,
                    updateTransaction,
                    ids,
                  ).finally(() => {
                    promptLock = false;
                  });
                },
              },
            ],
          });
        })();
      }, delayMs);
      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }, [
      isGuest,
      canUseSplit,
      loading,
      delayMs,
      ask,
      config.currency,
      t,
      updateTransaction,
      finance.transactions,
    ]),
  );
}
