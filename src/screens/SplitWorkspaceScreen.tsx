import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import { useSplit } from '../context/SplitContext';
import { useFinance } from '../FinanceContext';
import { useWorkspace } from '../WorkspaceContext';
import { Card, EmptyState, Field, PrimaryButton, Screen } from '../components/ui';
import { DateField } from '../components/DateField';
import { DropdownSelect } from '../components/DropdownSelect';
import { FriendMultiSelect } from '../components/FriendMultiSelect';
import { SplitPeoplePicker } from '../components/SplitPeoplePicker';
import { SplitPaySourcePicker } from '../components/SplitPaySourcePicker';
import { SplitShareOptionsEditor } from '../components/SplitShareOptionsEditor';
import { SplitEditExpenseModal } from '../components/SplitEditExpenseModal';
import { KeyboardScrollProvider } from '../components/KeyboardScrollContext';
import { FadeSlideIn, SlidingPillTabs } from '../components/SlidingPillTabs';
import { findCurrency, currencyDisplaySymbol } from '../constants';
import type { SplitExpense, SplitGroup, SplitMode, SplitPaySource } from '../lib/splitTypes';
import type { ThemeTokens } from '../types';
import { RootStackParamList } from '../navigation/types';
import { useT } from '../i18n/useT';
import { showAppDialog, showAppInfo, showAppInfoWhenReady } from '../appDialog';
import {
  customInputsAfterModeChange,
  findOpenSettlementWith,
  normalizeSplitDate,
  scaleExactCustomInputs,
} from '../lib/splitExpense';
import { formatDaySectionLabel } from '../utils/dateGroups';
import { todayStr } from '../utils';
import { accountIdForSplitPaySource, isCoreCardAccount } from '../cashBooks';
import { normalizeSplitPaySource } from '../lib/splitExpense';
import {
  ensureSplitCreateAllowed,
  extraSplitDiamondCost,
  freeSplitsLeftToday,
  splitCreatesAreUnlimited,
} from '../lib/splitQuota';

type TabId = 'expenses' | 'friends' | 'groups' | 'history' | 'balances';

export function SplitWorkspaceScreen() {
  const { theme, config } = useApp();
  const { isGuest, setShowAuth, setAuthMode } = useFinance();
  const { t } = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const split = useSplit();
  const { splitDeepLink } = useWorkspace();
  const [tab, setTab] = useState<TabId>('expenses');
  const scrollRef = useRef<ScrollView>(null);
  const scrollViewNodeRef = useRef<View | null>(null);
  const scrollYRef = useRef(0);
  const focusedNodeRef = useRef<View | null>(null);
  const keyboardTopRef = useRef<number | null>(null);
  const [keyboardPad, setKeyboardPad] = useState(0);

  useEffect(() => {
    if (!splitDeepLink) return;
    setTab(splitDeepLink.tab);
  }, [splitDeepLink]);

  const scrollFocusedIntoView = useCallback(() => {
    const node = focusedNodeRef.current;
    if (!node) return;

    const run = () => {
      const gap = 28;
      const finish = (visibleBottom: number, visibleTop: number) => {
        node.measureInWindow((_x, y, _w, h) => {
          const fieldTop = y;
          const fieldBottom = y + h;
          if (fieldTop >= visibleTop && fieldBottom <= visibleBottom) return;
          let delta = 0;
          if (fieldBottom > visibleBottom) delta = fieldBottom - visibleBottom + gap;
          else if (fieldTop < visibleTop) delta = fieldTop - visibleTop - gap;
          if (Math.abs(delta) < 2) return;
          scrollRef.current?.scrollTo({
            y: Math.max(0, scrollYRef.current + delta),
            animated: true,
          });
        });
      };

      // Prefer the ScrollView’s on-screen bounds (correct after workspace overlay lifts).
      const host = scrollViewNodeRef.current;
      if (host) {
        host.measureInWindow((_x, sy, _w, sh) => {
          finish(sy + sh - gap, sy + gap);
        });
        return;
      }

      const keyboardTop = keyboardTopRef.current;
      if (keyboardTop == null) return;
      finish(keyboardTop - gap, gap);
    };

    requestAnimationFrame(() => requestAnimationFrame(run));
  }, []);

  const registerFocus = useCallback(
    (node: View | null) => {
      focusedNodeRef.current = node;
      if (!node) return;
      // Keyboard may already be open (switching % fields) or still animating in.
      setTimeout(scrollFocusedIntoView, 16);
      setTimeout(scrollFocusedIntoView, 120);
      setTimeout(scrollFocusedIntoView, 320);
    },
    [scrollFocusedIntoView],
  );

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = Keyboard.addListener(showEvt, (e) => {
      keyboardTopRef.current = e.endCoordinates.screenY;
      // Extra room so focused rows near the bottom can scroll fully above the keypad.
      setKeyboardPad(Math.max(220, e.endCoordinates.height + 80));
    });
    const onHide = Keyboard.addListener(hideEvt, () => {
      keyboardTopRef.current = null;
      focusedNodeRef.current = null;
      setKeyboardPad(0);
    });
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);

  // Re-scroll after bottom padding / overlay resize land in layout.
  useEffect(() => {
    if (keyboardPad <= 0 || !focusedNodeRef.current) return;
    const t1 = setTimeout(scrollFocusedIntoView, 50);
    const t2 = setTimeout(scrollFocusedIntoView, 200);
    const t3 = setTimeout(scrollFocusedIntoView, 400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [keyboardPad, scrollFocusedIntoView]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollYRef.current = e.nativeEvent.contentOffset.y;
  }, []);

  const moduleOn = config.features.splitExpense !== false;
  const currency = findCurrency(config.currency) || findCurrency('INR')!;
  const sym = currencyDisplaySymbol(currency.code);

  if (isGuest) {
    return (
      <Screen>
        <EmptyState
          icon="👥"
          title={t('split.signInTitle')}
          subtitle={t('split.signInBody')}
        />
        <View style={{ paddingHorizontal: 16 }}>
          <PrimaryButton
            title={t('common.signIn')}
            onPress={() => {
              setAuthMode('login');
              setShowAuth(true);
            }}
          />
        </View>
      </Screen>
    );
  }

  if (!moduleOn) {
    return (
      <Screen>
        <EmptyState icon="🚫" title={t('split.offTitle')} subtitle={t('split.offBody')} />
      </Screen>
    );
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: 'expenses', label: t('split.tabExpenses') },
    { id: 'friends', label: t('split.tabFriends') },
    { id: 'groups', label: t('split.tabGroups') },
    { id: 'history', label: t('split.tabHistory') },
    { id: 'balances', label: t('split.tabBalances') },
  ];

  const keyboardScrollApi = useMemo(() => ({ registerFocus }), [registerFocus]);

  return (
    <Screen>
      <KeyboardScrollProvider value={keyboardScrollApi}>
        {/* Parent MainShell already lifts this workspace above the keyboard — avoid double inset. */}
        <View style={{ flex: 1 }}>
          <View style={styles.tabTrackWrap}>
            <SlidingPillTabs
              items={tabs.map((item) => ({ key: item.id, label: item.label }))}
              selectedKey={tab}
              onSelect={(key) => setTab(key as TabId)}
              trackStyle={styles.tabTrack}
              pillStyle={[styles.tabPill, { backgroundColor: theme.header }]}
              labelStyle={{ color: theme.ink, fontWeight: '800', fontSize: 11 }}
              labelActiveStyle={{ color: '#fff' }}
              itemStyle={{ paddingVertical: 8 }}
            />
          </View>

          {split.loading ? (
            <ActivityIndicator color={theme.header} style={{ marginTop: 24 }} />
          ) : null}

          <View
            ref={scrollViewNodeRef}
            collapsable={false}
            style={{ flex: 1 }}
          >
            <ScrollView
              ref={scrollRef}
              onScroll={onScroll}
              scrollEventThrottle={16}
              contentContainerStyle={{ padding: 14, paddingBottom: 140 + keyboardPad }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            >
              <FadeSlideIn activeKey={tab}>
                {tab === 'expenses' ? <ExpensesTab sym={sym} /> : null}
                {tab === 'friends' ? <FriendsTab /> : null}
                {tab === 'groups' ? <GroupsTab /> : null}
                {tab === 'history' ? <HistoryTab sym={sym} /> : null}
                {tab === 'balances' ? <BalancesTab sym={sym} /> : null}
              </FadeSlideIn>
            </ScrollView>
          </View>
        </View>
      </KeyboardScrollProvider>
    </Screen>
  );
}

function payerLabel(
  exp: SplitExpense,
  selfId: string,
  nameOf: (id: string) => string,
  t: (key: 'split.youPaid' | 'split.friendPaid') => string,
) {
  if (exp.paid_by === selfId) return t('split.youPaid');
  return t('split.friendPaid').replace('{name}', nameOf(exp.paid_by));
}

function settlementHint(
  exp: SplitExpense,
  selfId: string,
  sym: string,
  t: (key: 'split.youllGet' | 'split.youHaveToPay') => string,
): string | null {
  const myShare = exp.shares.find((s) => s.user_id === selfId)?.share_amount;
  if (myShare == null) return null;
  const my = Number(myShare);
  const total = Number(exp.amount);
  if (exp.paid_by === selfId) {
    const getBack = Math.max(0, Math.round((total - my) * 100) / 100);
    if (getBack <= 0) return null;
    return t('split.youllGet').replace('{amount}', `${sym}${getBack.toFixed(2)}`);
  }
  if (my <= 0) return null;
  return t('split.youHaveToPay').replace('{amount}', `${sym}${my.toFixed(2)}`);
}

function formatHistoryDay(
  iso: string,
  language: string | null | undefined,
  labels: { today: string; yesterday: string },
): string {
  return formatDaySectionLabel(iso, language, labels);
}

function SplitExpenseCard({
  exp,
  sym,
  showEdit,
  onEdit,
  hideDate,
}: {
  exp: SplitExpense;
  sym: string;
  showEdit?: boolean;
  onEdit?: () => void;
  hideDate?: boolean;
}) {
  const { theme } = useApp();
  const { session } = useFinance();
  const selfId = session?.user?.id || '';
  const split = useSplit();
  const { t } = useT();
  const payer = payerLabel(exp, selfId, split.nameOf, t);
  const hint = settlementHint(exp, selfId, sym, t);
  const canEdit = showEdit && exp.created_by === selfId;

  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: 6 }}>
            <Text style={{ color: theme.ink, fontWeight: '800', flexShrink: 1 }}>
              {exp.description}
            </Text>
            {!hideDate ? (
              <Text style={{ color: theme.muted, fontSize: 12, fontWeight: '600' }}>
                {normalizeSplitDate(exp.expense_date)}
              </Text>
            ) : null}
          </View>
          <Text style={{ color: theme.muted, fontSize: 12, marginTop: 4 }}>{payer}</Text>
          <Text style={{ color: theme.muted, fontSize: 11, marginTop: 2 }}>
            {normalizeSplitPaySource(exp.pay_source) === 'card'
              ? t('split.paidFromCard')
              : t('split.paidFromBank')}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ color: theme.red, fontWeight: '800' }}>
            {sym}
            {Number(exp.amount).toFixed(2)}
          </Text>
          {hint ? (
            <Text
              style={{
                color: exp.paid_by === selfId ? theme.green : theme.muted,
                fontSize: 11,
                marginTop: 2,
                textAlign: 'right',
                maxWidth: 140,
              }}
            >
              {hint}
            </Text>
          ) : null}
        </View>
      </View>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 8,
          gap: 8,
        }}
      >
        <Text style={{ color: theme.muted, fontSize: 11, flex: 1 }}>
          {exp.shares.map((s) => `${split.nameOf(s.user_id)} ${sym}${s.share_amount}`).join(' · ')}
        </Text>
        {canEdit && onEdit ? (
          <Pressable onPress={onEdit} hitSlop={8}>
            <Text style={{ color: theme.header, fontWeight: '800', fontSize: 13 }}>
              {t('split.edit')}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Card>
  );
}

function ExpensesTab({ sym }: { sym: string }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const {
    theme,
    expenseCategories,
    catMeta,
    finance,
    diamonds,
    isPremiumMember,
    earnDiamondsByAd,
    refreshDiamonds,
  } = useApp();
  const { session } = useFinance();
  const selfId = session?.user?.id || '';
  const split = useSplit();
  const { t, catName } = useT();

  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(todayStr());
  const [paidBy, setPaidBy] = useState(selfId);
  const [paySource, setPaySource] = useState<SplitPaySource>('bank');
  const [accountId, setAccountId] = useState(
    () => accountIdForSplitPaySource(finance.accounts, 'bank') || '',
  );
  const [mode, setMode] = useState<Exclude<SplitMode, 'custom'>>('equal');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [financeCategory, setFinanceCategory] = useState('');

  const unlimited = splitCreatesAreUnlimited(diamonds, isPremiumMember);
  const freeLeft = freeSplitsLeftToday(diamonds, unlimited);
  const extraCost = extraSplitDiamondCost(diamonds);

  const friendIds = split.acceptedFriendIds;
  const participantIds = useMemo(() => {
    const ids = [selfId, ...selectedIds.filter((id) => id && id !== selfId)];
    return [...new Set(ids.filter(Boolean))];
  }, [selfId, selectedIds]);

  const categoryOptions = useMemo(
    () => [
      { value: '', label: t('split.categoryNone') },
      ...expenseCategories.map((c) => ({
        value: c.name,
        label: `${catMeta(c.name, 'expense').icon} ${catName(c.name)}`,
      })),
    ],
    [expenseCategories, catMeta, catName, t],
  );

  const friendOptions = useMemo(
    () =>
      friendIds.map((id) => ({
        id,
        label: split.nameOf(id),
        eligible: split.canSplitWith(id),
      })),
    [friendIds, split],
  );

  const groupOptions = useMemo(
    () =>
      split.groups.map((g) => ({
        id: g.id,
        name: g.name,
        memberIds: g.member_ids.filter((id) => id !== selfId),
      })),
    [split.groups, selfId],
  );

  const setPeople = (ids: string[]) => {
    const next = [...new Set(ids.filter((id) => id && id !== selfId && split.canSplitWith(id)))];
    setSelectedIds(next);
    if (paidBy !== selfId && !next.includes(paidBy)) setPaidBy(selfId);
  };

  const pickCategory = (name: string) => {
    const prev = financeCategory;
    const prevLabel = prev ? catName(prev) : '';
    setFinanceCategory(name);
    if (!name) return;
    const label = catName(name);
    setDesc((d) => {
      const trimmed = d.trim();
      if (!trimmed || trimmed === prev || trimmed === prevLabel) return label;
      return d;
    });
  };

  const total = parseFloat(amount.replace(/,/g, '')) || 0;

  return (
    <View>
      <Card>
        <Text style={{ color: theme.ink, fontWeight: '800', fontSize: 16, marginBottom: 10 }}>
          {t('split.addExpense')}
        </Text>
        {unlimited ? (
          <Text style={{ color: theme.muted, fontSize: 12, marginTop: -4, marginBottom: 12, lineHeight: 16 }}>
            {t('split.quotaUnlimited')}
          </Text>
        ) : (
          <View style={{ marginTop: -4, marginBottom: 12 }}>
            <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 16 }}>
              {freeLeft === 1
                ? t('split.quotaFreeLeftOne')
                : freeLeft && freeLeft > 0
                  ? t('split.quotaFreeLeft', { n: freeLeft })
                  : t('split.quotaNoneLeft')}
              {extraCost > 0
                ? ` ${t('split.quotaExtraCost', { n: extraCost })}`
                : ''}
            </Text>
            <Pressable onPress={() => navigation.navigate('PremiumCompare')} hitSlop={6}>
              <Text style={{ color: theme.header, fontWeight: '800', fontSize: 12, marginTop: 4 }}>
                {t('split.quotaUpgrade')}
              </Text>
            </Pressable>
          </View>
        )}
        <DropdownSelect
          label={t('split.categoryOptional')}
          value={financeCategory}
          placeholder={t('split.categoryNone')}
          options={categoryOptions}
          onChange={pickCategory}
          overlay
        />
        <Text style={{ color: theme.muted, fontSize: 11, marginTop: -4, marginBottom: 10, lineHeight: 15 }}>
          {t('split.categoryHint')}
        </Text>

        <Field
          label={t('split.description')}
          value={desc}
          onChangeText={setDesc}
          placeholder={t('split.descPlaceholder')}
        />
        <Field
          label={`${t('split.totalPaid')} (${sym})`}
          value={amount}
          onChangeText={(text) => {
            const next = parseFloat(text.replace(/,/g, '')) || 0;
            const prev = parseFloat(amount.replace(/,/g, '')) || 0;
            setAmount(text);
            if (mode === 'exact') {
              setCustom((p) => scaleExactCustomInputs(p, prev, next));
            }
          }}
          keyboardType="decimal-pad"
          placeholder="0"
        />
        <Text style={{ color: theme.muted, fontSize: 11, marginTop: -8, marginBottom: 10, lineHeight: 15 }}>
          {t('split.totalPaidHint')}
        </Text>
        <DateField label={t('split.date')} value={expenseDate} onChange={setExpenseDate} />

        <SplitPaySourcePicker
          paySource={paySource}
          accountId={accountId}
          onChange={(source, id) => {
            setPaySource(source);
            setAccountId(id);
          }}
        />

        <SplitPeoplePicker
          selfLabel={t('split.youAlways')}
          friends={friendOptions}
          groups={groupOptions}
          selectedIds={selectedIds}
          onChange={setPeople}
          emptyHint={t('split.needFriends')}
        />

        <DropdownSelect
          label={t('split.paidBy')}
          value={paidBy || selfId}
          placeholder={t('split.paidByPlaceholder')}
          options={participantIds.map((id) => ({
            value: id,
            label: id === selfId ? t('split.youAlways') : split.nameOf(id),
          }))}
          onChange={setPaidBy}
          overlay
        />
        <Text style={{ color: theme.muted, fontSize: 11, marginTop: -4, marginBottom: 12, lineHeight: 15 }}>
          {t('split.paidByHint')}
        </Text>

        <SplitShareOptionsEditor
          mode={mode}
          onModeChange={(next) => {
            setCustom((prev) => customInputsAfterModeChange(mode, next, total, participantIds, prev));
            setMode(next);
          }}
          participantIds={participantIds}
          nameOf={split.nameOf}
          sym={sym}
          total={total}
          custom={custom}
          onCustomChange={(id, text) => setCustom((p) => ({ ...p, [id]: text }))}
          fieldBg={theme.bg}
        />

        <PrimaryButton
          title={saving ? t('common.saving') : t('split.saveExpense')}
          onPress={() => {
            if (saving) return;
            if (
              paySource === 'card' &&
              !(finance.accounts || []).some((a) => !a.excluded && isCoreCardAccount(a))
            ) {
              showAppInfo(t('split.title'), t('split.msgNeedCard'), '💳');
              return;
            }
            if (!desc.trim()) {
              showAppInfo(t('split.title'), t('split.msgNeedDescription'), '⚠️');
              return;
            }
            if (!(total > 0)) {
              showAppInfo(t('split.title'), t('split.msgNeedAmount'), '⚠️');
              return;
            }
            if (participantIds.filter((id) => id !== selfId).length < 1) {
              showAppInfo(t('split.title'), t('split.msgNeedFriend'), '👥');
              return;
            }
            setSaving(true);
            const customShares: Record<string, number> = {};
            for (const id of participantIds) {
              customShares[id] = parseFloat((custom[id] || '0').replace(/,/g, '')) || 0;
            }
            void (async () => {
              let watchedAd = false;
              try {
                const allowed = await ensureSplitCreateAllowed({
                  unlimited: splitCreatesAreUnlimited(diamonds, isPremiumMember),
                  fetchState: refreshDiamonds,
                  watchAd: async () => {
                    watchedAd = true;
                    return earnDiamondsByAd({ ignoreDailyCap: true });
                  },
                  t,
                });
                if (!allowed) return;
                const ok = await split.addExpense({
                  description: desc,
                  amount: total,
                  paidBy: paidBy || selfId,
                  splitMode: mode,
                  expenseDate,
                  participantIds: participantIds.filter((id) => id !== selfId),
                  customShares,
                  financeCategory: financeCategory || null,
                  paySource,
                  accountId,
                });
                if (ok) {
                  setDesc('');
                  setAmount('');
                  setExpenseDate(todayStr());
                  setSelectedIds([]);
                  setCustom({});
                  setPaidBy(selfId);
                  setMode('equal');
                  setFinanceCategory('');
                  setPaySource('bank');
                  setAccountId(accountIdForSplitPaySource(finance.accounts, 'bank') || '');
                  if (watchedAd) {
                    showAppInfoWhenReady(t('split.title'), t('split.msgExpenseSaved'), '✅');
                  } else {
                    showAppInfo(t('split.title'), t('split.msgExpenseSaved'), '✅');
                  }
                }
              } finally {
                setSaving(false);
              }
            })();
          }}
        />
      </Card>
    </View>
  );
}

function HistoryTab({ sym }: { sym: string }) {
  const { theme, config } = useApp();
  const split = useSplit();
  const { t } = useT();
  const [filterDate, setFilterDate] = useState('');
  const [editing, setEditing] = useState<SplitExpense | null>(null);

  const dayLabels = useMemo(
    () => ({ today: t('common.today'), yesterday: t('common.yesterday') }),
    [t],
  );

  const list = useMemo(() => {
    const sorted = [...split.expenses].sort((a, b) =>
      normalizeSplitDate(b.expense_date).localeCompare(normalizeSplitDate(a.expense_date)),
    );
    if (!filterDate) return sorted;
    return sorted.filter((e) => normalizeSplitDate(e.expense_date) === filterDate);
  }, [split.expenses, filterDate]);

  const grouped = useMemo(() => {
    if (filterDate) return null;
    const map = new Map<string, SplitExpense[]>();
    for (const exp of list) {
      const key = normalizeSplitDate(exp.expense_date);
      const arr = map.get(key) || [];
      arr.push(exp);
      map.set(key, arr);
    }
    return [...map.entries()];
  }, [list, filterDate]);

  return (
    <View>
      <Text style={{ color: theme.ink, fontWeight: '800', fontSize: 16, marginBottom: 10 }}>
        {t('split.historyTitle')}
      </Text>
      <Card>
        <DateField
          label={t('split.historyFilter')}
          value={filterDate}
          onChange={setFilterDate}
          clearable
          placeholder={t('split.historyAll')}
        />
        {filterDate ? (
          <Pressable onPress={() => setFilterDate('')} style={{ marginBottom: 4 }}>
            <Text style={{ color: theme.header, fontWeight: '700', fontSize: 12 }}>
              {t('split.historyAll')}
            </Text>
          </Pressable>
        ) : null}
      </Card>

      {list.length === 0 ? (
        <EmptyState
          icon="📅"
          title={filterDate ? t('split.noHistory') : t('split.noExpenses')}
          subtitle={filterDate ? t('split.noHistoryBody') : t('split.noExpensesBody')}
        />
      ) : grouped ? (
        grouped.map(([day, items]) => (
          <View key={day} style={{ marginBottom: 6 }}>
            <Text
              style={{
                color: theme.ink,
                fontWeight: '800',
                fontSize: 13,
                marginTop: 10,
                marginBottom: 6,
              }}
            >
              {formatHistoryDay(day, config.language, dayLabels)}
            </Text>
            {items.map((exp) => (
              <SplitExpenseCard
                key={exp.id}
                exp={exp}
                sym={sym}
                showEdit
                hideDate
                onEdit={() => setEditing(exp)}
              />
            ))}
          </View>
        ))
      ) : (
        list.map((exp) => (
          <SplitExpenseCard
            key={exp.id}
            exp={exp}
            sym={sym}
            showEdit
            hideDate
            onEdit={() => setEditing(exp)}
          />
        ))
      )}

      <SplitEditExpenseModal expense={editing} sym={sym} onClose={() => setEditing(null)} />
    </View>
  );
}

function SubSeg({
  value,
  onChange,
  newLabel,
  existingLabel,
  newBadge,
  existingBadge,
}: {
  value: 'new' | 'existing';
  onChange: (v: 'new' | 'existing') => void;
  newLabel: string;
  existingLabel: string;
  newBadge?: number;
  existingBadge?: number;
}) {
  const { theme } = useApp();
  const newText =
    newBadge && newBadge > 0 ? `${newLabel} (${newBadge})` : newLabel;
  const existingText =
    existingBadge && existingBadge > 0
      ? `${existingLabel} (${existingBadge})`
      : existingLabel;

  return (
    <SlidingPillTabs
      items={[
        { key: 'new', label: newText },
        { key: 'existing', label: existingText },
      ]}
      selectedKey={value}
      onSelect={(key) => onChange(key as 'new' | 'existing')}
      trackStyle={{
        backgroundColor: theme.track,
        borderRadius: 12,
        marginBottom: 12,
      }}
      pillStyle={{ backgroundColor: theme.header, borderRadius: 10 }}
      labelStyle={{ color: theme.ink, fontWeight: '800', fontSize: 13 }}
      labelActiveStyle={{ color: '#fff' }}
      itemStyle={{ paddingVertical: 9 }}
    />
  );
}

function FriendsTab() {
  const { theme } = useApp();
  const split = useSplit();
  const { splitDeepLink } = useWorkspace();
  const { t } = useT();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sub, setSub] = useState<'new' | 'existing'>('new');
  const highlightId = splitDeepLink?.tab === 'friends' ? splitDeepLink.highlightId : undefined;

  React.useEffect(() => {
    if (splitDeepLink?.tab !== 'friends') return;
    setSub(splitDeepLink.sub === 'existing' ? 'existing' : 'new');
  }, [splitDeepLink]);

  React.useEffect(() => {
    void split.refresh({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount / tab open only
  }, []);

  const incomingCount = split.pendingIncoming.length;
  const outgoingCount = split.pendingOutgoing.length;
  const newBadge = incomingCount + outgoingCount;

  return (
    <View>
      <SubSeg
        value={sub}
        onChange={setSub}
        newLabel={t('split.subNew')}
        existingLabel={t('split.subExisting')}
        newBadge={newBadge}
        existingBadge={split.acceptedFriendIds.length}
      />

      <FadeSlideIn activeKey={sub}>
      {sub === 'new' ? (
        <>
          <Card>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 8,
              }}
            >
              <Text style={{ color: theme.ink, fontWeight: '800', fontSize: 16 }}>
                {t('split.inviteTitle')}
              </Text>
              <Pressable onPress={() => void split.refresh({ silent: true })} hitSlop={8}>
                <Text style={{ color: theme.header, fontWeight: '700', fontSize: 12 }}>
                  {t('common.refresh')}
                </Text>
              </Pressable>
            </View>
            <Text style={{ color: theme.muted, fontSize: 12, marginBottom: 10, lineHeight: 17 }}>
              {t('split.inviteHint')}
            </Text>
            <Field
              label={t('split.email')}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder={t('split.emailPlaceholder')}
            />
            <PrimaryButton
              title={busy ? t('common.saving') : t('split.sendInvite')}
              onPress={() => {
                if (busy) return;
                setBusy(true);
                void split
                  .inviteFriend(email)
                  .then((ok) => {
                    if (ok) setEmail('');
                  })
                  .finally(() => setBusy(false));
              }}
            />
          </Card>

          <Card>
            <Text style={{ color: theme.ink, fontWeight: '800', marginBottom: 8 }}>
              {t('split.incoming')}
              {incomingCount > 0 ? ` (${incomingCount})` : ''}
            </Text>
            {incomingCount === 0 ? (
              <Text style={{ color: theme.muted, fontSize: 13 }}>{t('split.noIncoming')}</Text>
            ) : (
              split.pendingIncoming.map((f) => (
                <View
                  key={f.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    marginBottom: 10,
                    gap: 8,
                    borderRadius: 12,
                    borderWidth: highlightId === f.id ? 2 : 0,
                    borderColor: theme.header,
                    padding: highlightId === f.id ? 8 : 0,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.ink, fontWeight: '700' }}>
                      {split.nameOf(f.requester_id)}
                    </Text>
                    <Text style={{ color: theme.muted, fontSize: 11 }}>
                      {split.profilesById[f.requester_id]?.email || ''}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => {
                      void split.respondInvite(f.id, true).then((ok) => {
                        if (ok) setSub('existing');
                      });
                    }}
                    style={{
                      backgroundColor: theme.green,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 8,
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>
                      {t('split.accept')}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => void split.respondInvite(f.id, false)}
                    style={{
                      backgroundColor: theme.track,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 8,
                    }}
                  >
                    <Text style={{ color: theme.ink, fontWeight: '700', fontSize: 12 }}>
                      {t('split.decline')}
                    </Text>
                  </Pressable>
                </View>
              ))
            )}
          </Card>

          {outgoingCount > 0 ? (
            <Card>
              <Text style={{ color: theme.ink, fontWeight: '800', marginBottom: 8 }}>
                {t('split.outgoing')}
              </Text>
              {split.pendingOutgoing.map((f) => (
                <View
                  key={f.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    marginBottom: 10,
                    gap: 8,
                  }}
                >
                  <Text style={{ flex: 1, color: theme.muted }}>
                    ⏳ {split.nameOf(f.addressee_id)}
                    {split.profilesById[f.addressee_id]?.email
                      ? ` · ${split.profilesById[f.addressee_id]?.email}`
                      : ''}
                  </Text>
                  <Pressable
                    onPress={() => {
                      showAppDialog({
                        title: t('split.cancelInviteTitle'),
                        message: t('split.cancelInviteBody'),
                        icon: '🗑️',
                        buttons: [
                          { text: t('common.cancel'), style: 'cancel' },
                          {
                            text: t('split.cancelInvite'),
                            style: 'destructive',
                            onPress: () => void split.cancelInvite(f.id),
                          },
                        ],
                      });
                    }}
                    style={{
                      backgroundColor: theme.track,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 8,
                    }}
                  >
                    <Text style={{ color: theme.red, fontWeight: '800', fontSize: 12 }}>
                      {t('common.remove')}
                    </Text>
                  </Pressable>
                </View>
              ))}
            </Card>
          ) : null}
        </>
      ) : (
        <>
          <Text style={{ color: theme.ink, fontWeight: '800', marginBottom: 8 }}>
            {t('split.yourFriends')}
          </Text>
          {split.acceptedFriendIds.length === 0 ? (
            <EmptyState
              icon="👤"
              title={t('split.noFriends')}
              subtitle={t('split.noFriendsBody')}
            />
          ) : (
            split.acceptedFriendIds.map((id) => (
              <Card key={id}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.ink, fontWeight: '700' }}>
                      👤 {split.nameOf(id)}
                    </Text>
                    <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>
                      {split.profilesById[id]?.email || ''}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => {
                      showAppDialog({
                        title: t('split.removeFriendTitle'),
                        message: t('split.removeFriendBody').replace(
                          '{name}',
                          split.nameOf(id),
                        ),
                        icon: '👋',
                        buttons: [
                          { text: t('common.cancel'), style: 'cancel' },
                          {
                            text: t('split.removeFriend'),
                            style: 'destructive',
                            onPress: () => void split.removeFriend(id),
                          },
                        ],
                      });
                    }}
                    style={{
                      backgroundColor: theme.red + '18',
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: theme.red + '44',
                    }}
                  >
                    <Text style={{ color: theme.red, fontWeight: '800', fontSize: 12 }}>
                      {t('common.delete')}
                    </Text>
                  </Pressable>
                </View>
              </Card>
            ))
          )}
        </>
      )}
      </FadeSlideIn>
    </View>
  );
}

function GroupsTab() {
  const { theme } = useApp();
  const { session } = useFinance();
  const insets = useSafeAreaInsets();
  const selfId = session?.user?.id || '';
  const split = useSplit();
  const { t } = useT();
  const [name, setName] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<SplitGroup | null>(null);
  const [editName, setEditName] = useState('');
  const [editMemberIds, setEditMemberIds] = useState<string[]>([]);
  const [editBusy, setEditBusy] = useState(false);
  const [sub, setSub] = useState<'new' | 'existing'>('new');

  const friendOptions = useMemo(
    () =>
      split.acceptedFriendIds.map((id) => ({
        id,
        label: split.nameOf(id),
      })),
    [split.acceptedFriendIds, split.nameOf],
  );

  const openEdit = (g: SplitGroup) => {
    setEditing(g);
    setEditName(g.name);
    setEditMemberIds(g.member_ids.filter((id) => id !== selfId));
  };

  return (
    <View>
      <SubSeg
        value={sub}
        onChange={setSub}
        newLabel={t('split.subNew')}
        existingLabel={t('split.subExisting')}
        existingBadge={split.groups.length}
      />

      <FadeSlideIn activeKey={sub}>
      {sub === 'new' ? (
        <Card>
          <Text style={{ color: theme.ink, fontWeight: '800', fontSize: 16, marginBottom: 8 }}>
            {t('split.createGroup')}
          </Text>
          <Field
            label={t('split.groupName')}
            value={name}
            onChangeText={setName}
            placeholder={t('split.groupPlaceholder')}
          />
          <FriendMultiSelect
            label={t('split.groupMembers')}
            placeholder={t('split.pickFriends')}
            options={friendOptions}
            selectedIds={memberIds}
            onChange={setMemberIds}
            emptyHint={t('split.noFriendsBody')}
            chipBg={theme.header}
          />
          <Text style={{ color: theme.muted, fontSize: 11, marginTop: -6, marginBottom: 12, lineHeight: 15 }}>
            {t('split.pickFriendsHint')}
          </Text>
          <PrimaryButton
            title={busy ? t('common.saving') : t('split.saveGroup')}
            onPress={() => {
              if (busy) return;
              setBusy(true);
              void split.createGroup(name, memberIds).then((ok) => {
                if (ok) {
                  setName('');
                  setMemberIds([]);
                  setSub('existing');
                }
              }).finally(() => setBusy(false));
            }}
          />
        </Card>
      ) : (
        <>
          <Text
            style={{
              color: theme.ink,
              fontWeight: '800',
              fontSize: 15,
              marginBottom: 8,
            }}
          >
            {t('split.yourGroups')}
          </Text>
          {split.groups.length === 0 ? (
            <EmptyState icon="👥" title={t('split.noGroups')} subtitle={t('split.noGroupsBody')} />
          ) : (
            split.groups.map((g) => {
              const isOwner = g.owner_id === selfId;
              return (
                <Card key={g.id}>
                  <Text style={{ color: theme.ink, fontWeight: '800' }}>👥 {g.name}</Text>
                  <Text style={{ color: theme.muted, fontSize: 12, marginTop: 6 }}>
                    {g.member_ids.map((id) => split.nameOf(id)).join(', ')}
                  </Text>
                  {isOwner ? (
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                      <Pressable
                        onPress={() => openEdit(g)}
                        style={{
                          backgroundColor: theme.track,
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          borderRadius: 8,
                        }}
                      >
                        <Text style={{ color: theme.header, fontWeight: '800', fontSize: 12 }}>
                          {t('split.edit')}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          showAppDialog({
                            title: t('split.deleteGroupTitle'),
                            message: t('split.deleteGroupBody').replace('{name}', g.name),
                            icon: '🗑️',
                            buttons: [
                              { text: t('common.cancel'), style: 'cancel' },
                              {
                                text: t('split.deleteGroup'),
                                style: 'destructive',
                                onPress: () => void split.deleteGroup(g.id),
                              },
                            ],
                          });
                        }}
                        style={{
                          backgroundColor: theme.track,
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: theme.red + '44',
                        }}
                      >
                        <Text style={{ color: theme.red, fontWeight: '800', fontSize: 12 }}>
                          {t('split.deleteGroup')}
                        </Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Text style={{ color: theme.muted, fontSize: 11, marginTop: 10 }}>
                      {t('split.ownerOnlyEdit')}
                    </Text>
                  )}
                </Card>
              );
            })
          )}
        </>
      )}
      </FadeSlideIn>

      <Modal
        visible={!!editing}
        animationType="slide"
        presentationStyle="overFullScreen"
        statusBarTranslucent
        onRequestClose={() => setEditing(null)}
      >
        <View style={{ flex: 1, backgroundColor: theme.bg }}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingHorizontal: 16,
              paddingTop: Math.max(insets.top, Platform.OS === 'ios' ? 16 : 12),
              paddingBottom: 12,
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: theme.line,
              backgroundColor: theme.bg,
              zIndex: 20,
              elevation: 8,
            }}
          >
            <Text style={{ color: theme.ink, fontWeight: '800', fontSize: 17 }}>
              {t('split.editGroup')}
            </Text>
            <Pressable onPress={() => setEditing(null)} hitSlop={16}>
              <Text style={{ color: theme.header, fontWeight: '700' }}>{t('home.close')}</Text>
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
          >
            <Field
              label={t('split.groupName')}
              value={editName}
              onChangeText={setEditName}
              placeholder={t('split.groupPlaceholder')}
            />
            <FriendMultiSelect
              label={t('split.groupMembers')}
              placeholder={t('split.pickFriends')}
              options={friendOptions}
              selectedIds={editMemberIds}
              onChange={setEditMemberIds}
              emptyHint={t('split.noFriendsBody')}
            />
            <Text style={{ color: theme.muted, fontSize: 11, marginTop: -6, marginBottom: 12, lineHeight: 15 }}>
              {t('split.pickFriendsHint')}
            </Text>
            <PrimaryButton
              title={editBusy ? t('common.saving') : t('split.saveGroupEdit')}
              onPress={() => {
                if (!editing || editBusy) return;
                setEditBusy(true);
                void split.updateGroup(editing.id, editName, editMemberIds).then((ok) => {
                  if (ok) setEditing(null);
                }).finally(() => setEditBusy(false));
              }}
            />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function BalancesTab({ sym }: { sym: string }) {
  const { theme, config } = useApp();
  const { session } = useFinance();
  const selfId = session?.user?.id || '';
  const split = useSplit();
  const { splitDeepLink } = useWorkspace();
  const { t } = useT();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [sub, setSub] = useState<'balances' | 'open' | 'closed'>('balances');
  const [closedFilterDate, setClosedFilterDate] = useState('');
  const highlightId = splitDeepLink?.tab === 'balances' ? splitDeepLink.highlightId : undefined;

  React.useEffect(() => {
    void split.refresh({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh when Balances opens
  }, []);

  React.useEffect(() => {
    if (splitDeepLink?.tab !== 'balances') return;
    if (splitDeepLink.sub === 'open' || splitDeepLink.sub === 'closed' || splitDeepLink.sub === 'balances') {
      setSub(splitDeepLink.sub);
    } else {
      setSub('open');
    }
  }, [splitDeepLink]);

  const openSettlements = useMemo(
    () => split.settlements.filter((s) => s.status === 'open'),
    [split.settlements],
  );

  const closedSettlements = useMemo(() => {
    const list = split.settlements
      .filter((s) => s.status === 'completed' || s.status === 'cancelled')
      .sort((a, b) => {
        const da = normalizeSplitDate(a.completed_at || a.created_at);
        const db = normalizeSplitDate(b.completed_at || b.created_at);
        return db.localeCompare(da);
      });
    if (!closedFilterDate) return list;
    return list.filter(
      (s) => normalizeSplitDate(s.completed_at || s.created_at) === closedFilterDate,
    );
  }, [split.settlements, closedFilterDate]);

  const closedGrouped = useMemo(() => {
    if (closedFilterDate) return null;
    const map = new Map<string, typeof closedSettlements>();
    for (const s of closedSettlements) {
      const key = normalizeSplitDate(s.completed_at || s.created_at);
      const arr = map.get(key) || [];
      arr.push(s);
      map.set(key, arr);
    }
    return [...map.entries()];
  }, [closedSettlements, closedFilterDate]);

  const dayLabels = useMemo(
    () => ({ today: t('common.today'), yesterday: t('common.yesterday') }),
    [t],
  );

  const needsMyConfirm = openSettlements.some(
    (s) =>
      s.to_user_id === selfId && s.debtor_confirmed && !s.creditor_confirmed,
  );

  const balanceSeg: { id: 'balances' | 'open' | 'closed'; label: string; badge?: number }[] = [
    { id: 'balances', label: t('split.balances') },
    {
      id: 'open',
      label: t('split.openSettlements'),
      badge: openSettlements.length,
    },
    {
      id: 'closed',
      label: t('split.closedSettlements'),
      badge: split.settlements.filter(
        (s) => s.status === 'completed' || s.status === 'cancelled',
      ).length,
    },
  ];

  const renderSettlementCard = (
    s: (typeof split.settlements)[number],
    opts: { showActions: boolean },
  ) => {
    const iAmDebtor = s.from_user_id === selfId;
    const iAmCreditor = s.to_user_id === selfId;
    let action: null | 'debtor' | 'creditor' = null;
    if (opts.showActions) {
      if (iAmDebtor && !s.debtor_confirmed) action = 'debtor';
      if (iAmCreditor && s.debtor_confirmed && !s.creditor_confirmed) action = 'creditor';
    }
    const actionBusy = busyKey === `act:${s.id}`;
    const canCancel = opts.showActions && s.status === 'open';
    const day = normalizeSplitDate(s.completed_at || s.created_at);
    const statusLabel =
      s.status === 'cancelled'
        ? t('split.cancelled')
        : s.status === 'completed'
          ? t('split.completed')
          : s.debtor_confirmed
            ? s.creditor_confirmed
              ? t('split.completed')
              : t('split.awaitingReceive')
            : t('split.awaitingPay');

    return (
      <View
        key={s.id}
        style={
          highlightId === s.id
            ? {
                borderRadius: 16,
                borderWidth: 2,
                borderColor: theme.header,
                marginBottom: 2,
              }
            : undefined
        }
      >
      <Card>
        <Text style={{ color: theme.ink, fontWeight: '700' }}>
          {split.nameOf(s.from_user_id)} → {split.nameOf(s.to_user_id)}
        </Text>
        <Text style={{ color: theme.muted, marginTop: 4 }}>
          {sym}
          {s.amount.toFixed(2)} · {statusLabel}
          {!opts.showActions && day ? ` · ${day}` : ''}
        </Text>
        {action ? (
          <Pressable
            disabled={actionBusy}
            onPress={() => {
              if (actionBusy) return;
              setBusyKey(`act:${s.id}`);
              void split.confirmSettlement(s.id).finally(() => setBusyKey(null));
            }}
            style={{
              marginTop: 10,
              backgroundColor: actionBusy ? theme.track : theme.green,
              paddingVertical: 10,
              borderRadius: 10,
              alignItems: 'center',
            }}
          >
            <Text
              style={{
                color: actionBusy ? theme.muted : '#fff',
                fontWeight: '800',
              }}
            >
              {actionBusy
                ? t('split.markPaidPending')
                : action === 'debtor'
                  ? t('split.markPaid')
                  : t('split.confirmReceived')}
            </Text>
          </Pressable>
        ) : opts.showActions &&
          iAmDebtor &&
          s.debtor_confirmed &&
          !s.creditor_confirmed ? (
          <Text style={{ color: theme.muted, fontSize: 12, marginTop: 10 }}>
            {t('split.awaitingReceive')}
          </Text>
        ) : null}
        {canCancel ? (
          <Pressable
            disabled={busyKey === `cancel:${s.id}`}
            onPress={() => {
              showAppDialog({
                title: t('split.cancelSettlementTitle'),
                message: t('split.cancelSettlementBody'),
                icon: '↩️',
                buttons: [
                  { text: t('common.cancel'), style: 'cancel' },
                  {
                    text: t('split.cancelSettlement'),
                    style: 'destructive',
                    onPress: () => {
                      setBusyKey(`cancel:${s.id}`);
                      void split
                        .cancelSettlement(s.id)
                        .finally(() => setBusyKey(null));
                    },
                  },
                ],
              });
            }}
            style={{ marginTop: 10, alignSelf: 'flex-start' }}
          >
            <Text style={{ color: theme.red, fontWeight: '800', fontSize: 12 }}>
              {t('split.cancelSettlement')}
            </Text>
          </Pressable>
        ) : null}
      </Card>
      </View>
    );
  };

  return (
    <View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
          gap: 8,
        }}
      >
        <Text style={{ color: theme.ink, fontWeight: '800', fontSize: 15, flex: 1 }}>
          {t('split.tabBalances')}
        </Text>
        <Pressable
          onPress={() => {
            void split.refresh({ silent: true });
          }}
          hitSlop={8}
        >
          <Text style={{ color: theme.header, fontWeight: '800', fontSize: 12 }}>
            {t('common.refresh')}
          </Text>
        </Pressable>
      </View>

      <View style={{ marginBottom: 12 }}>
        <SlidingPillTabs
          items={balanceSeg.map((item) => ({
            key: item.id,
            label:
              item.badge && item.badge > 0
                ? `${item.label} (${item.badge})`
                : item.label,
          }))}
          selectedKey={sub}
          onSelect={(key) => setSub(key as typeof sub)}
          trackStyle={{
            backgroundColor: theme.track,
            borderRadius: 12,
          }}
          pillStyle={{ backgroundColor: theme.header, borderRadius: 10 }}
          labelStyle={{
            color: theme.ink,
            fontWeight: '800',
            fontSize: 11,
            textAlign: 'center',
          }}
          labelActiveStyle={{ color: '#fff' }}
          itemStyle={{ paddingVertical: 9, paddingHorizontal: 2 }}
        />
      </View>

      <FadeSlideIn activeKey={sub}>

      {sub === 'balances' ? (
        <>
          {needsMyConfirm ? (
            <Text
              style={{
                color: theme.header,
                fontWeight: '700',
                fontSize: 12,
                marginBottom: 10,
                lineHeight: 17,
              }}
            >
              {t('split.confirmNeededBanner')}
            </Text>
          ) : null}
          {split.balances.length === 0 ? (
            <EmptyState
              icon="⚖️"
              title={t('split.settledUp')}
              subtitle={
                openSettlements.length > 0
                  ? t('split.noOpenBalancesPending')
                  : t('split.settledUpBody')
              }
            />
          ) : (
            split.balances.map((b) => {
              const theyOwe = b.amount > 0;
              const pending = findOpenSettlementWith(selfId, b.userId, split.settlements);
              const rowBusy = busyKey === `bal:${b.userId}`;
              const disabled = !!pending || rowBusy;
              return (
                <Card key={b.userId}>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={{ color: theme.ink, fontWeight: '800' }}>
                        {split.nameOf(b.userId)}
                      </Text>
                      <Text
                        style={{
                          color: theyOwe ? theme.green : theme.red,
                          fontWeight: '700',
                          marginTop: 4,
                        }}
                      >
                        {theyOwe
                          ? t('split.owesYou').replace('{amount}', `${sym}${b.amount.toFixed(2)}`)
                          : t('split.youOwe').replace(
                              '{amount}',
                              `${sym}${Math.abs(b.amount).toFixed(2)}`,
                            )}
                      </Text>
                      {pending ? (
                        <Text style={{ color: theme.muted, fontSize: 11, marginTop: 4 }}>
                          {pending.debtor_confirmed
                            ? t('split.awaitingReceive')
                            : t('split.awaitingPay')}
                        </Text>
                      ) : null}
                    </View>
                    <Pressable
                      disabled={disabled}
                      onPress={() => {
                        if (disabled) return;
                        setBusyKey(`bal:${b.userId}`);
                        void split
                          .startSettlement(b.userId, Math.abs(b.amount))
                          .finally(() => setBusyKey(null));
                      }}
                      style={{
                        backgroundColor: disabled ? theme.track : theme.header,
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        borderRadius: 10,
                        opacity: disabled ? 0.7 : 1,
                      }}
                    >
                      <Text
                        style={{
                          color: disabled ? theme.muted : '#fff',
                          fontWeight: '800',
                          fontSize: 12,
                        }}
                      >
                        {pending || rowBusy
                          ? t('split.markPaidPending')
                          : theyOwe
                            ? t('split.requestSettle')
                            : t('split.markPaid')}
                      </Text>
                    </Pressable>
                  </View>
                </Card>
              );
            })
          )}
        </>
      ) : null}

      {sub === 'open' ? (
        openSettlements.length === 0 ? (
          <EmptyState
            icon="🤝"
            title={t('split.noOpenSettlements')}
            subtitle={t('split.noOpenSettlementsBody')}
          />
        ) : (
          openSettlements.map((s) => renderSettlementCard(s, { showActions: true }))
        )
      ) : null}

      {sub === 'closed' ? (
        <>
          <Card>
            <DateField
              label={t('split.closedFilter')}
              value={closedFilterDate}
              onChange={setClosedFilterDate}
              clearable
              placeholder={t('split.closedAll')}
            />
            {closedFilterDate ? (
              <Pressable onPress={() => setClosedFilterDate('')} style={{ marginBottom: 4 }}>
                <Text style={{ color: theme.header, fontWeight: '700', fontSize: 12 }}>
                  {t('split.closedAll')}
                </Text>
              </Pressable>
            ) : null}
          </Card>

          {closedSettlements.length === 0 ? (
            <EmptyState
              icon="📅"
              title={
                closedFilterDate ? t('split.noClosedOnDate') : t('split.noClosedSettlements')
              }
              subtitle={
                closedFilterDate
                  ? t('split.noClosedOnDateBody')
                  : t('split.noClosedSettlementsBody')
              }
            />
          ) : closedGrouped ? (
            closedGrouped.map(([day, items]) => (
              <View key={day} style={{ marginBottom: 6 }}>
                <Text
                  style={{
                    color: theme.ink,
                    fontWeight: '800',
                    fontSize: 13,
                    marginTop: 10,
                    marginBottom: 6,
                  }}
                >
                  {formatHistoryDay(day, config.language, dayLabels)}
                </Text>
                {items.map((s) => renderSettlementCard(s, { showActions: false }))}
              </View>
            ))
          ) : (
            closedSettlements.map((s) => renderSettlementCard(s, { showActions: false }))
          )}
        </>
      ) : null}
      </FadeSlideIn>
    </View>
  );
}

function makeStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    tabTrackWrap: {
      paddingHorizontal: 14,
      paddingTop: 8,
      paddingBottom: 4,
    },
    tabTrack: {
      backgroundColor: theme.track,
      borderRadius: 12,
    },
    tabPill: {
      borderRadius: 8,
    },
  });
}
