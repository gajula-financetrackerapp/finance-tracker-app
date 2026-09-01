import { useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useApp } from '../context/AppContext';
import { useFinance } from '../FinanceContext';
import { revealSplitSettlementIncome } from './splitHomeFold';

/**
 * Put folded settlement income back on Income (and undo the bill reduction).
 * Does not ask — settlement always belongs in Income.
 */
export function useSplitSettleHomePrompt() {
  const { finance, setFinance } = useApp();
  const { isGuest } = useFinance();
  const financeRef = useRef(finance);
  financeRef.current = finance;

  useFocusEffect(
    useCallback(() => {
      if (isGuest) return undefined;
      const next = revealSplitSettlementIncome(financeRef.current);
      if (next !== financeRef.current) void setFinance(next);
      return undefined;
    }, [isGuest, setFinance, finance]),
  );
}
