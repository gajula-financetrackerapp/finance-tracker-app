import { useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
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
} from './splitHomeFold';

/** One in-app dialog at a time across Home and the transaction list. */
let promptLock = false;

/**
 * After a friend settles, ask on Home / Txn list whether to show the real share.
 * Split history is not changed.
 */
export function useSplitSettleHomePrompt(delayMs = 400) {
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
        if (cancelled || promptLock) return;
        if (canUseSplit && loading) return;
        const income = nextSplitSettleToAsk(txnsRef.current);
        if (!income) return;
        promptLock = true;
        const amount = fmt(Math.abs(Number(income.amount) || 0), config.currency);
        showAppDialog({
          title: t('home.foldSettleTitle'),
          message: t('home.foldSettleBody').replace('{amount}', amount),
          icon: '💸',
          buttons: [
            {
              text: t('common.no'),
              style: 'cancel',
              onPress: () => {
                promptLock = false;
                const latest = txnsRef.current.find((x) => x.id === income.id) || income;
                void updateTransaction({ ...latest, splitSettleAsked: true });
              },
            },
            {
              text: t('common.yes'),
              style: 'primary',
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
      config.currency,
      t,
      updateTransaction,
      finance.transactions,
    ]),
  );
}
