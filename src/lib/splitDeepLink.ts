export type SplitDeepLink = {
  tab: 'expenses' | 'friends' | 'groups' | 'balances' | 'activity';
  sub?: 'new' | 'existing' | 'balances' | 'open' | 'closed';
  highlightId?: string;
};
