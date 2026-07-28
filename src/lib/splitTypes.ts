import type { PremiumFeatureKey } from '../types';

export type SplitFriendshipStatus = 'pending' | 'accepted' | 'declined';

export type SplitProfile = {
  id: string;
  email: string | null;
  full_name: string | null;
  /** Active Premium/Plus — required to include on new splits. */
  can_split?: boolean;
};

export type SplitFriendship = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: SplitFriendshipStatus;
  created_at: string;
  updated_at?: string;
};

export type SplitGroup = {
  id: string;
  owner_id: string;
  name: string;
  created_at: string;
  member_ids: string[];
};

export type SplitMode =
  | 'equal'
  | 'exact'
  | 'percentage'
  | 'shares'
  | 'adjustment'
  /** @deprecated alias of exact — kept for older rows */
  | 'custom';

export const SPLIT_MODE_OPTIONS: Exclude<SplitMode, 'custom'>[] = [
  'equal',
  'exact',
  'percentage',
  'shares',
  'adjustment',
];

export function normalizeSplitMode(mode: string | null | undefined): Exclude<SplitMode, 'custom'> {
  if (mode === 'custom') return 'exact';
  if (
    mode === 'equal' ||
    mode === 'exact' ||
    mode === 'percentage' ||
    mode === 'shares' ||
    mode === 'adjustment'
  ) {
    return mode;
  }
  return 'equal';
}

export type SplitExpenseShare = {
  expense_id: string;
  user_id: string;
  share_amount: number;
  finance_txn_id: string | null;
};

export type SplitExpense = {
  id: string;
  created_by: string;
  description: string;
  amount: number;
  currency: string;
  paid_by: string;
  split_mode: SplitMode;
  expense_date: string;
  created_at: string;
  /** Expense category name for Finance / Charts (e.g. Food). */
  finance_category?: string | null;
  shares: SplitExpenseShare[];
};

export type SplitSettlementStatus = 'open' | 'completed' | 'cancelled';

export type SplitSettlement = {
  id: string;
  from_user_id: string;
  to_user_id: string;
  amount: number;
  currency: string;
  debtor_confirmed: boolean;
  creditor_confirmed: boolean;
  status: SplitSettlementStatus;
  created_by: string;
  completed_at: string | null;
  created_at: string;
};

/** Net balance: positive => they owe you; negative => you owe them. */
export type SplitBalanceRow = {
  userId: string;
  amount: number;
  currency: string;
};

export const SPLIT_PREMIUM_FEATURE: PremiumFeatureKey = 'splitExpense';
