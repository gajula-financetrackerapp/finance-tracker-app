import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useApp } from '../context/AppContext';
import { useSplit } from '../context/SplitContext';
import { useFinance } from '../FinanceContext';
import { Field, PrimaryButton } from './ui';
import { DateField } from './DateField';
import { DropdownSelect } from './DropdownSelect';
import { SplitPaySourcePicker } from './SplitPaySourcePicker';
import { SplitPeoplePicker } from './SplitPeoplePicker';
import { SplitShareOptionsEditor } from './SplitShareOptionsEditor';
import { KeyboardScrollProvider } from './KeyboardScrollContext';
import { useT } from '../i18n/useT';
import { ModalInsets, SystemModal } from './SystemSafeArea';
import { showAppInfo } from '../appDialog';
import {
  customInputsAfterModeChange,
  customInputsForMode,
  normalizeSplitDate,
  normalizeSplitPaySource,
  resolveAttachedGroupId,
  scaleExactCustomInputs,
} from '../lib/splitExpense';
import { normalizeSplitMode } from '../lib/splitTypes';
import type { SplitExpense, SplitMode, SplitPaySource } from '../lib/splitTypes';
import { todayStr } from '../utils';
import { accountIdForSplitPaySource, isCoreCardAccount } from '../cashBooks';

export function SplitEditExpenseModal({
  expense,
  sym,
  onClose,
}: {
  expense: SplitExpense | null;
  sym: string;
  onClose: () => void;
}) {
  const { theme, expenseCategories, catMeta, finance } = useApp();
  const { session } = useFinance();
  const selfId = session?.user?.id || '';
  const split = useSplit();
  const { t, catName } = useT();

  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(todayStr());
  const [paidBy, setPaidBy] = useState('');
  const [paySource, setPaySource] = useState<SplitPaySource>('bank');
  const [accountId, setAccountId] = useState('');
  const [mode, setMode] = useState<Exclude<SplitMode, 'custom'>>('equal');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pickedGroupIds, setPickedGroupIds] = useState<string[]>([]);
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [financeCategory, setFinanceCategory] = useState('');

  React.useEffect(() => {
    if (!expense) return;
    setDesc(expense.description);
    setAmount(String(expense.amount));
    setExpenseDate(normalizeSplitDate(expense.expense_date, todayStr()));
    setPaidBy(expense.paid_by);
    const source = normalizeSplitPaySource(expense.pay_source);
    setPaySource(source);
    setAccountId(accountIdForSplitPaySource(finance.accounts, source) || '');
    setFinanceCategory(String(expense.finance_category || '').trim());
    const m = normalizeSplitMode(expense.split_mode);
    setMode(m);
    const ids = expense.shares.map((s) => s.user_id).filter((id) => id && id !== selfId);
    setSelectedIds(ids);
    setPickedGroupIds(expense.group_id ? [String(expense.group_id)] : []);
    const totalAmt = Number(expense.amount) || 0;
    setCustom(
      customInputsForMode(
        m,
        totalAmt,
        expense.shares.map((s) => ({ userId: s.user_id, shareAmount: Number(s.share_amount) })),
      ),
    );
  }, [expense, selfId, finance.accounts]);

  const originalIds = useMemo(
    () => new Set((expense?.shares || []).map((s) => String(s.user_id))),
    [expense],
  );

  const participantIds = useMemo(() => {
    const ids = [selfId, ...selectedIds.filter((id) => id && id !== selfId)];
    return [...new Set(ids.filter(Boolean))];
  }, [selfId, selectedIds]);

  const friendOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: { id: string; label: string; eligible: boolean }[] = [];
    const add = (id: string, eligible: boolean) => {
      if (!id || id === selfId || seen.has(id)) return;
      seen.add(id);
      out.push({ id, label: split.nameOf(id), eligible });
    };
    for (const id of split.acceptedFriendIds) {
      add(id, split.canSplitWith(id) || originalIds.has(id));
    }
    for (const id of selectedIds) add(id, true);
    for (const s of expense?.shares || []) {
      add(String(s.user_id), true);
    }
    for (const g of split.groups) {
      for (const id of g.member_ids) {
        add(id, split.canSplitWith(id) || originalIds.has(id));
      }
    }
    return out;
  }, [split, selfId, selectedIds, expense, originalIds]);

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
    const next = [
      ...new Set(
        ids.filter(
          (id) => id && id !== selfId && (split.canSplitWith(id) || originalIds.has(id)),
        ),
      ),
    ];
    setSelectedIds(next);
  };

  const total = parseFloat(amount.replace(/,/g, '')) || 0;

  useEffect(() => {
    if (paidBy && !participantIds.includes(paidBy)) {
      setPaidBy(selfId);
    }
  }, [paidBy, participantIds, selfId]);

  const changeMode = useCallback(
    (next: Exclude<SplitMode, 'custom'>) => {
      setCustom((prev) => customInputsAfterModeChange(mode, next, total, participantIds, prev));
      setMode(next);
    },
    [mode, total, participantIds],
  );

  const onAmountChange = useCallback(
    (text: string) => {
      const next = parseFloat(text.replace(/,/g, '')) || 0;
      const prev = parseFloat(amount.replace(/,/g, '')) || 0;
      setAmount(text);
      if (mode === 'exact') {
        setCustom((p) => scaleExactCustomInputs(p, prev, next));
      }
    },
    [amount, mode],
  );

  const editScrollRef = useRef<ScrollView>(null);
  const editScrollHostRef = useRef<View | null>(null);
  const editScrollYRef = useRef(0);
  const editFocusedRef = useRef<View | null>(null);
  const editKeyboardTopRef = useRef<number | null>(null);
  const [editKeyboardPad, setEditKeyboardPad] = useState(0);

  const scrollEditFocused = useCallback(() => {
    const node = editFocusedRef.current;
    if (!node) return;
    const run = () => {
      const gap = 28;
      const host = editScrollHostRef.current;
      const apply = (visibleBottom: number, visibleTop: number) => {
        node.measureInWindow((_x, y, _w, h) => {
          const fieldTop = y;
          const fieldBottom = y + h;
          if (fieldTop >= visibleTop && fieldBottom <= visibleBottom) return;
          let delta = 0;
          if (fieldBottom > visibleBottom) delta = fieldBottom - visibleBottom + gap;
          else if (fieldTop < visibleTop) delta = fieldTop - visibleTop - gap;
          if (Math.abs(delta) < 2) return;
          editScrollRef.current?.scrollTo({
            y: Math.max(0, editScrollYRef.current + delta),
            animated: true,
          });
        });
      };
      if (host) {
        host.measureInWindow((_x, sy, _w, sh) => apply(sy + sh - gap, sy + gap));
        return;
      }
      const keyboardTop = editKeyboardTopRef.current;
      if (keyboardTop == null) return;
      apply(keyboardTop - gap, gap);
    };
    requestAnimationFrame(() => requestAnimationFrame(run));
  }, []);

  const editRegisterFocus = useCallback(
    (node: View | null) => {
      editFocusedRef.current = node;
      if (!node) return;
      setTimeout(scrollEditFocused, 16);
      setTimeout(scrollEditFocused, 120);
      setTimeout(scrollEditFocused, 320);
    },
    [scrollEditFocused],
  );

  useEffect(() => {
    if (!expense) return;
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = Keyboard.addListener(showEvt, (e) => {
      editKeyboardTopRef.current = e.endCoordinates.screenY;
      setEditKeyboardPad(Math.max(220, e.endCoordinates.height + 80));
    });
    const onHide = Keyboard.addListener(hideEvt, () => {
      editKeyboardTopRef.current = null;
      editFocusedRef.current = null;
      setEditKeyboardPad(0);
    });
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, [expense]);

  useEffect(() => {
    if (!expense || editKeyboardPad <= 0 || !editFocusedRef.current) return;
    const t1 = setTimeout(scrollEditFocused, 50);
    const t2 = setTimeout(scrollEditFocused, 200);
    const t3 = setTimeout(scrollEditFocused, 400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [expense, editKeyboardPad, scrollEditFocused]);

  const editKeyboardApi = useMemo(
    () => ({ registerFocus: editRegisterFocus }),
    [editRegisterFocus],
  );

  return (
    <SystemModal
      visible={!!expense}
      animationType="slide"
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <ModalInsets>
        {(insets) => (
      <KeyboardScrollProvider value={editKeyboardApi}>
        <KeyboardAvoidingView
          style={{
            flex: 1,
            backgroundColor: theme.bg,
            paddingBottom: insets.bottom,
          }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
        >
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
              {t('split.editExpense')}
            </Text>
            <Pressable onPress={onClose} hitSlop={16}>
              <Text style={{ color: theme.header, fontWeight: '700' }}>{t('home.close')}</Text>
            </Pressable>
          </View>
          <View ref={editScrollHostRef} collapsable={false} style={{ flex: 1 }}>
            <ScrollView
              ref={editScrollRef}
              onScroll={(e) => {
                editScrollYRef.current = e.nativeEvent.contentOffset.y;
              }}
              scrollEventThrottle={16}
              contentContainerStyle={{ padding: 14, paddingBottom: 140 + editKeyboardPad }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            >
              <DropdownSelect
                label={t('split.categoryOptional')}
                value={financeCategory}
                placeholder={t('split.categoryNone')}
                options={[
                  { value: '', label: t('split.categoryNone') },
                  ...expenseCategories.map((c) => ({
                    value: c.name,
                    label: `${catMeta(c.name, 'expense').icon} ${catName(c.name)}`,
                  })),
                ]}
                onChange={(name) => {
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
                }}
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
                onChangeText={onAmountChange}
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

              <SplitPeoplePicker
                selfLabel={t('split.youAlways')}
                friends={friendOptions}
                groups={groupOptions}
                selectedIds={selectedIds}
                onChange={setPeople}
                pickedGroupIds={pickedGroupIds}
                onPickedGroupsChange={setPickedGroupIds}
                nameOf={split.nameOf}
                addLabel={t('split.addFriendsOrGroups')}
                addedLabel={t('split.splitWith')}
                excludeSelectedFromMenu
                emptyHint={t('split.needFriends')}
              />

              <SplitShareOptionsEditor
                mode={mode}
                onModeChange={changeMode}
                participantIds={participantIds}
                nameOf={split.nameOf}
                sym={sym}
                total={total}
                custom={custom}
                onCustomChange={(id, text) => setCustom((p) => ({ ...p, [id]: text }))}
                fieldBg={theme.card}
              />

              <PrimaryButton
                title={saving ? t('common.saving') : t('split.saveEdit')}
                onPress={() => {
                  if (!expense || saving) return;
                  if (
                    paySource === 'card' &&
                    !(finance.accounts || []).some((a) => !a.excluded && isCoreCardAccount(a))
                  ) {
                    showAppInfo(t('split.title'), t('split.msgNeedCard'), '💳');
                    return;
                  }
                  setSaving(true);
                  const customShares: Record<string, number> = {};
                  for (const id of participantIds) {
                    customShares[id] = parseFloat((custom[id] || '0').replace(/,/g, '')) || 0;
                  }
                  void split
                    .updateExpense({
                      expenseId: expense.id,
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
                      groupId: resolveAttachedGroupId(
                        pickedGroupIds,
                        participantIds,
                        split.groups,
                      ),
                    })
                    .then((ok) => {
                      if (ok) {
                        onClose();
                        showAppInfo(t('split.title'), t('split.msgExpenseUpdated'), '✅');
                      }
                    })
                    .finally(() => setSaving(false));
                }}
              />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </KeyboardScrollProvider>
        )}
      </ModalInsets>
    </SystemModal>
  );
}
