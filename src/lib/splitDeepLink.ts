export type SplitDeepLink = {
  tab: 'expenses' | 'friends' | 'groups' | 'history' | 'balances';
  sub?: 'new' | 'existing' | 'balances' | 'open' | 'closed';
  highlightId?: string;
};
