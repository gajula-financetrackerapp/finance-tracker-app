export type SplitDeepLink = {
  tab: 'expenses' | 'friends' | 'groups' | 'history' | 'balances' | 'activity';
  sub?: 'new' | 'existing' | 'balances' | 'open' | 'closed';
  highlightId?: string;
};
