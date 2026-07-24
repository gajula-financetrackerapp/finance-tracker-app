import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFinance } from '../FinanceContext';
import { useApp } from '../context/AppContext';
import { requireAuthToSave } from '../authGate';
import { showAppDialog, showAppInfo } from '../appDialog';
import {
  GROCERY_CATEGORIES,
  getGroceryItemScope,
  isGroceryFamilyCat,
} from '../constants';
import { fmt, monthLabel } from '../theme';
import { accountChipLabel, resolveDefaultAccountId, sortAccountsForDisplay } from '../cashBooks';
import type { GroceryReminder, GroceryTxnItem, Transaction, ThemeTokens } from '../types';
import { currencySymbol, todayStr, uid } from '../utils';
import { promptBillImage } from '../utils/billImage';
import { BillImageEditor } from '../components/BillImageEditor';
import { GuestBanner } from '../components/Shared';
import { BottomSheet } from '../components/BottomSheet';
import { DropdownSelect } from '../components/DropdownSelect';
import { DateField } from '../components/DateField';
import { PremiumHeaderFill } from '../components/PremiumChrome';
import { useT } from '../i18n/useT';

function shiftMonth(key: string, delta: number) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function HomeScreen() {
  const { currentMonth, setCurrentMonth, isGuest, setShowAdd, setEditingTxn } = useFinance();
  const { finance, config, deleteTransaction, catMeta,
    theme,
  } = useApp();
  const { t, catName } = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const homePrefs = config.homePrefs;
  const [listKind, setListKind] = useState<'income' | 'expense'>(homePrefs.defaultTab);
  const [selectedTxn, setSelectedTxn] = useState<Transaction | null>(null);

  useEffect(() => {
    setListKind(homePrefs.defaultTab);
  }, [homePrefs.defaultTab]);

  const monthTxns = useMemo(
    () => finance.transactions.filter((t) => t.date.startsWith(currentMonth)),
    [finance.transactions, currentMonth],
  );

  const monthSummary = useMemo(() => {
    let expenses = 0;
    let income = 0;
    monthTxns.forEach((t) => {
      if (t.kind === 'expense') expenses += t.amount;
      else if (t.kind === 'income') income += t.amount;
    });
    return { expenses, income, balance: income - expenses };
  }, [monthTxns]);

  const filteredTxns = useMemo(() => {
    const list = monthTxns.filter((t) => t.kind === listKind);
    const byId = (a: Transaction, b: Transaction) => b.id.localeCompare(a.id);
    switch (homePrefs.sortOrder) {
      case 'oldest':
        return [...list].sort((a, b) => a.date.localeCompare(b.date) || byId(b, a));
      case 'amount_high':
        return [...list].sort((a, b) => b.amount - a.amount || b.date.localeCompare(a.date) || byId(a, b));
      case 'amount_low':
        return [...list].sort((a, b) => a.amount - b.amount || b.date.localeCompare(a.date) || byId(a, b));
      case 'newest':
      default:
        return [...list].sort((a, b) => b.date.localeCompare(a.date) || byId(a, b));
    }
  }, [monthTxns, listKind, homePrefs.sortOrder]);

  return (
    <View style={styles.root}>
      <GuestBanner />

      <View style={styles.summaryBand}>
        <PremiumHeaderFill />
        <View style={styles.monthBox}>
          <Text style={styles.year}>{currentMonth.slice(0, 4)}</Text>
          <Pressable onPress={() => setCurrentMonth(shiftMonth(currentMonth, -1))} hitSlop={8}>
            <Text style={styles.monthNav}>‹</Text>
          </Pressable>
          <Text style={styles.month}>{monthLabel(currentMonth).split(' ')[0]}</Text>
          <Pressable onPress={() => setCurrentMonth(shiftMonth(currentMonth, 1))} hitSlop={8}>
            <Text style={styles.monthNav}>›</Text>
          </Pressable>
        </View>

        {homePrefs.showSummary ? (
          <View style={styles.statsRow}>
            <Pressable
              style={[styles.statTab, listKind === 'expense' && styles.statTabOn]}
              onPress={() => setListKind('expense')}
            >
              <Text style={[styles.statLabel, listKind === 'expense' && styles.statLabelOn]}>
                {t('home.expenses')}
              </Text>
              <Text style={[styles.statValue, listKind === 'expense' && styles.statValueOn]}>
                {fmt(monthSummary.expenses, config.currency)}
              </Text>
              <Text
                style={[
                  styles.statHint,
                  listKind === 'expense' && { color: 'rgba(255,255,255,0.75)' },
                ]}
              >
                {t('home.thisMonth')}
              </Text>
            </Pressable>

            <Pressable
              style={[styles.statTab, listKind === 'income' && styles.statTabOn]}
              onPress={() => setListKind('income')}
            >
              <Text style={[styles.statLabel, listKind === 'income' && styles.statLabelOn]}>
                {t('home.income')}
              </Text>
              <Text style={[styles.statValue, listKind === 'income' && styles.statValueOn]}>
                {fmt(monthSummary.income, config.currency)}
              </Text>
              <Text
                style={[
                  styles.statHint,
                  listKind === 'income' && { color: 'rgba(255,255,255,0.75)' },
                ]}
              >
                {t('home.thisMonth')}
              </Text>
            </Pressable>

            <View style={styles.statBalance}>
              <Text style={styles.statLabel}>{t('home.balance')}</Text>
              <Text style={styles.statValue}>{fmt(monthSummary.balance, config.currency)}</Text>
              <Text style={styles.statHint}>{t('home.thisMonth')}</Text>
            </View>
          </View>
        ) : (
          <View style={styles.compactTabs}>
            {(['expense', 'income'] as const).map((k) => {
              const on = listKind === k;
              return (
                <Pressable
                  key={k}
                  onPress={() => setListKind(k)}
                  style={[styles.compactTab, on && styles.compactTabOn]}
                >
                  <Text style={[styles.compactTabText, on && styles.compactTabTextOn]}>
                    {k === 'expense' ? t('home.expenses') : t('home.income')}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      <FlatList
        data={filteredTxns}
        keyExtractor={(item) => item.id}
        style={styles.list}
        contentContainerStyle={{
          padding: 16,
          paddingBottom: Math.max(insets.bottom, 16) + 100,
          flexGrow: 1,
        }}
        showsVerticalScrollIndicator
        ListHeaderComponent={
          isGuest ? (
            <View style={styles.noteCard}>
              <Text style={styles.noteTitle}>{t('home.guestMode')}</Text>
              <Text style={styles.noteBody}>{t('home.guestBody')}</Text>
            </View>
          ) : (
            <Text style={styles.listTitle}>
              {listKind === 'income' ? t('home.income') : t('home.expenses')} ·{' '}
              {filteredTxns.length} {t('home.records')}
            </Text>
          )
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>{listKind === 'income' ? '💰' : '🧾'}</Text>
            <Text style={styles.emptyTitle}>
              {listKind === 'income' ? t('home.noIncome') : t('home.noExpenses')}
            </Text>
            <Text style={styles.emptySub}>{t('home.tapAdd')}</Text>
          </View>
        }
        renderItem={({ item }) => {
          const kind = item.kind === 'income' ? 'income' : 'expense';
          const meta = catMeta(item.category, kind);
          const acct = item.accountId
            ? finance.accounts.find((a) => a.id === item.accountId)
            : undefined;
          const acctLabel = acct ? accountChipLabel(acct) : null;
          const row = (
            <>
              <View style={[styles.icon, { backgroundColor: meta.color + '22' }]}>
                <Text style={{ fontSize: 18 }}>{meta.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{catName(item.category)}</Text>
                <Text style={styles.rowSub}>
                  {[acctLabel, item.note || item.date].filter(Boolean).join(' · ')}
                </Text>
              </View>
              {item.billImageUri ? <Text style={styles.billBadge}>🧾</Text> : null}
              <Text
                style={[
                  styles.rowAmt,
                  { color: item.kind === 'income' ? theme.green : theme.red },
                ]}
              >
                {item.kind === 'income' ? '+' : '-'}
                {fmt(item.amount, config.currency)}
              </Text>
            </>
          );

          if (item.kind === 'expense' || item.kind === 'income') {
            return (
              <Pressable style={styles.row} onPress={() => setSelectedTxn(item)}>
                {row}
              </Pressable>
            );
          }
          return <View style={styles.row}>{row}</View>;
        }}
      />

      <TxnDetailSheet
        txn={selectedTxn}
        currency={config.currency}
        onClose={() => setSelectedTxn(null)}
        onEdit={() => {
          if (!selectedTxn) return;
          if (!requireAuthToSave('edit transactions')) return;
          const txn = selectedTxn;
          setSelectedTxn(null);
          setEditingTxn(txn);
          setShowAdd(true);
        }}
        onDelete={() => {
          if (!selectedTxn) return;
          if (!requireAuthToSave('delete transactions')) return;
          const txn = selectedTxn;
          showAppDialog({
            title: t('home.deleteTxn'),
            message: `${catName(txn.category)} · ${fmt(txn.amount, config.currency)}`,
            icon: '🗑',
            buttons: [
              { text: t('home.cancel'), style: 'cancel' },
              {
                text: t('home.delete'),
                style: 'destructive',
                onPress: () => {
                  void deleteTransaction(txn.id).then(() => {
                    setSelectedTxn(null);
                    showAppInfo(t('common.deleted'), t('home.txnDeleted'), '🗑');
                  });
                },
              },
            ],
          });
        }}
      />
    </View>
  );
}

function TxnDetailSheet({
  txn,
  currency,
  onClose,
  onEdit,
  onDelete,
}: {
  txn: Transaction | null;
  currency: string;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { finance, theme} = useApp();
  const { t, catName } = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const isExpense = txn?.kind === 'expense';
  const account = txn?.accountId
    ? finance.accounts.find((a) => a.id === txn.accountId)
    : null;
  const fromAccount =
    txn?.kind === 'transfer' && txn.fromAccountId
      ? finance.accounts.find((a) => a.id === txn.fromAccountId)
      : null;
  const toAccount =
    txn?.kind === 'transfer' && txn.toAccountId
      ? finance.accounts.find((a) => a.id === txn.toAccountId)
      : null;

  const items =
    isExpense && txn?.groceryItems && txn.groceryItems.length > 0
      ? txn.groceryItems.map((g) => ({
          key: g.id,
          label: `${g.icon || '🛒'} ${g.name}`,
          qty: g.quantity?.trim() || '—',
        }))
      : isExpense && txn && (txn.itemName?.trim() || txn.quantity?.trim() || txn.note?.trim())
        ? [
            {
              key: 'single',
              label: txn.itemName?.trim() || txn.note?.trim() || txn.category,
              qty: txn.quantity?.trim() || '—',
            },
          ]
        : isExpense && txn
          ? [
              {
                key: 'single',
                label: txn.category,
                qty: txn.quantity?.trim() || '—',
              },
            ]
          : [];

  return (
    <BottomSheet visible={!!txn} onClose={onClose} style={styles.detailSheet}>
      {!txn ? null : (
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.detailHeader}>
            <Text style={styles.detailTitle}>{catName(txn.category)}</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.headerBtn}>{t('home.close')}</Text>
            </Pressable>
          </View>

          {isExpense ? (
            txn.billImageUri ? (
              <Image source={{ uri: txn.billImageUri }} style={styles.billImage} resizeMode="cover" />
            ) : (
              <View style={styles.billPlaceholder}>
                <Text style={styles.billPlaceholderIcon}>🧾</Text>
                <Text style={styles.billPlaceholderText}>{t('home.noBill')}</Text>
              </View>
            )
          ) : null}

          <View style={styles.detailMeta}>
            <Text style={styles.detailMetaLabel}>{t('home.txnDate')}</Text>
            <Text style={styles.detailMetaValue}>{txn.date}</Text>
          </View>
          <View style={styles.detailMeta}>
            <Text style={styles.detailMetaLabel}>{t('home.amount')}</Text>
            <Text
              style={[
                styles.detailMetaValue,
                { color: txn.kind === 'income' ? theme.green : theme.red },
              ]}
            >
              {txn.kind === 'income' ? '+' : '−'}
              {fmt(txn.amount, currency)}
            </Text>
          </View>

          {txn.kind === 'transfer' ? (
            <View style={styles.detailMeta}>
              <Text style={styles.detailMetaLabel}>{t('home.transfer')}</Text>
              <Text style={styles.detailMetaValue}>
                {fromAccount ? accountChipLabel(fromAccount) : '—'}
                {' → '}
                {toAccount ? accountChipLabel(toAccount) : '—'}
              </Text>
            </View>
          ) : (
            <View style={styles.detailMeta}>
              <Text style={styles.detailMetaLabel}>
                {txn.kind === 'income' ? t('home.receivedIn') : t('home.paidWith')}
              </Text>
              <Text style={styles.detailMetaValue}>
                {account ? accountChipLabel(account) : t('home.noAccount')}
              </Text>
            </View>
          )}

          {isExpense ? (
            <>
              <Text style={styles.itemsHeading}>{t('home.items')}</Text>
              <View style={styles.itemsTableHead}>
                <Text style={[styles.itemsColItem, styles.itemsHeadText]}>{t('home.item')}</Text>
                <Text style={[styles.itemsColQty, styles.itemsHeadText]}>{t('home.qty')}</Text>
              </View>
              {items.map((it) => (
                <View key={it.key} style={styles.itemsRow}>
                  <Text style={styles.itemsColItem}>{it.label}</Text>
                  <Text style={styles.itemsColQty}>{it.qty}</Text>
                </View>
              ))}
            </>
          ) : null}

          {txn.note ? (
            <View style={[styles.detailMeta, { marginTop: 14 }]}>
              <Text style={styles.detailMetaLabel}>{t('home.note')}</Text>
              <Text style={styles.detailMetaValue}>{txn.note}</Text>
            </View>
          ) : null}

          <Pressable style={styles.editBtn} onPress={onEdit}>
            <Text style={styles.editBtnText}>{t('home.editTxn')}</Text>
          </Pressable>
          <Pressable style={styles.deleteBtn} onPress={onDelete}>
            <Text style={styles.deleteBtnText}>{t('home.delete')}</Text>
          </Pressable>
        </ScrollView>
      )}
    </BottomSheet>
  );
}

const KEYPAD = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['.', '0', '⌫'],
] as const;

type AddKind = 'expense' | 'income';

/** Same viewport height for Expense and Income category grids. */
const CAT_SCROLL_HEIGHT = 360;

/** Matches HTML: step1 (category) → step2 (amount + details). */
export function AddModal() {
  const { showAdd, setShowAdd, isGuest, setShowAuth, setAuthMode, editingTxn, setEditingTxn } =
    useFinance();
  const {
    finance,
    addTransaction,
    updateTransaction,
    config,
    groceryReminders,
    setGroceryReminders,
    expenseCategories,
    incomeCategories,
    catMeta,
    theme,
  } = useApp();
  const { t, catName } = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [step, setStep] = useState<1 | 2>(1);
  const [kind, setKind] = useState<AddKind>('expense');
  const [category, setCategory] = useState<string | null>(null);
  const [amountStr, setAmountStr] = useState('0');
  const [amountSel, setAmountSel] = useState({ start: 1, end: 1 });
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState('');
  const [accountId, setAccountId] = useState('');
  const [billImageUri, setBillImageUri] = useState<string | null>(null);
  const [billEditUri, setBillEditUri] = useState<string | null>(null);
  const [itemName, setItemName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [groceryItems, setGroceryItems] = useState<GroceryTxnItem[]>([]);
  const [grocSubcat, setGrocSubcat] = useState('');
  const [grocItem, setGrocItem] = useState('');
  const [grocCustom, setGrocCustom] = useState('');
  const [grocQty, setGrocQty] = useState('');
  const [grocExpiry, setGrocExpiry] = useState('');

  const isEditing = !!editingTxn;
  const cats = kind === 'income' ? incomeCategories : expenseCategories;
  const currencySym = currencySymbol(config.currency);
  const amountValue = parseFloat(amountStr) || 0;
  const canSave = amountValue > 0;
  const showGrocery = !!category && isGroceryFamilyCat(category);
  const groceryScope = category ? getGroceryItemScope(category) : null;
  const selectedMeta = category ? catMeta(category, kind) : null;

  const resetForm = () => {
    setStep(1);
    setKind('expense');
    setCategory(null);
    setAmountStr('0');
    setAmountSel({ start: 1, end: 1 });
    setDate(todayStr());
    setNote('');
    setAccountId(resolveDefaultAccountId(finance) ?? '');
    setBillImageUri(null);
    setBillEditUri(null);
    setItemName('');
    setQuantity('');
    setGroceryItems([]);
    setGrocSubcat('');
    setGrocItem('');
    setGrocCustom('');
    setGrocQty('');
    setGrocExpiry('');
  };

  const loadTxn = (t: Transaction) => {
    const k: AddKind = t.kind === 'income' ? 'income' : 'expense';
    setKind(k);
    setCategory(t.category);
    setAmountStr(String(t.amount));
    setAmountSel({ start: String(t.amount).length, end: String(t.amount).length });
    setDate(t.date || todayStr());
    setNote(t.note || '');
    setAccountId(t.accountId || resolveDefaultAccountId(finance) || '');
    setBillImageUri(t.billImageUri || null);
    setItemName(t.itemName || '');
    setQuantity(t.quantity || '');
    setGroceryItems(t.groceryItems ? t.groceryItems.map((g) => ({ ...g })) : []);
    setGrocSubcat('');
    setGrocItem('');
    setGrocCustom('');
    setGrocQty('');
    setGrocExpiry('');
    setStep(2);
  };

  useEffect(() => {
    if (!showAdd) return;
    if (isGuest) {
      setShowAdd(false);
      setEditingTxn(null);
      requireAuthToSave(editingTxn ? 'edit transactions' : 'add transactions');
      return;
    }
    if (editingTxn) loadTxn(editingTxn);
    else resetForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open/edit only
  }, [showAdd, editingTxn?.id, isGuest]);

  const onClose = () => {
    setShowAdd(false);
    setEditingTxn(null);
    resetForm();
  };

  const switchKind = (k: AddKind) => {
    setKind(k);
    setCategory(null);
    setGroceryItems([]);
    setStep(1);
    setAmountStr('0');
    setAmountSel({ start: 1, end: 1 });
  };

  const pickCategory = (name: string) => {
    setCategory(name);
    if (!isGroceryFamilyCat(name)) setGroceryItems([]);
    setGrocSubcat('');
    setGrocItem('');
    setGrocCustom('');
    setGrocQty('');
    setGrocExpiry('');
    setStep(2);
  };

  const pressKey = (key: string) => {
    const prev = amountStr;
    let start = Math.min(amountSel.start, amountSel.end);
    let end = Math.max(amountSel.start, amountSel.end);
    // Clamp to current string (selection can lag behind).
    start = Math.max(0, Math.min(start, prev.length));
    end = Math.max(0, Math.min(end, prev.length));

    if (key === '⌫') {
      let next: string;
      let caret: number;
      if (start !== end) {
        next = prev.slice(0, start) + prev.slice(end);
        caret = start;
      } else if (start > 0) {
        next = prev.slice(0, start - 1) + prev.slice(start);
        caret = start - 1;
      } else {
        return;
      }
      if (!next.length) {
        setAmountStr('0');
        setAmountSel({ start: 1, end: 1 });
        return;
      }
      setAmountStr(next);
      setAmountSel({ start: caret, end: caret });
      return;
    }

    if (key === '.') {
      if (prev.includes('.')) return;
      const next = `${prev.slice(0, start)}.${prev.slice(end)}`;
      const caret = start + 1;
      setAmountStr(next.length > 12 ? next.slice(0, 12) : next);
      setAmountSel({ start: Math.min(caret, 12), end: Math.min(caret, 12) });
      return;
    }

    // Digit — replace bare "0" when typing at the end/on the zero.
    if (prev === '0' && start <= 1 && end <= 1 && !prev.includes('.')) {
      setAmountStr(key);
      setAmountSel({ start: 1, end: 1 });
      return;
    }

    const next = `${prev.slice(0, start)}${key}${prev.slice(end)}`;
    const clipped = next.length > 12 ? next.slice(0, 12) : next;
    const caret = Math.min(start + 1, clipped.length);
    setAmountStr(clipped);
    setAmountSel({ start: caret, end: caret });
  };

  const buildPendingGroceryItem = (): GroceryTxnItem | null => {
    if (!groceryScope) return null;
    let itemCategory = '';
    let name = '';
    let icon = '🥡';

    if (groceryScope.mode === 'subcategory') {
      if (!grocSubcat) return null;
      itemCategory = grocSubcat;
      const cat = GROCERY_CATEGORIES.find((c) => c.name === grocSubcat);
      if (grocItem === '__others__') {
        name = grocCustom.trim();
        icon = '🥡';
      } else {
        name = grocItem;
        icon = cat?.items.find((i) => i.name === grocItem)?.icon || '🥡';
      }
    } else {
      itemCategory = groceryScope.categoryName;
      if (grocItem === '__others__') {
        name = grocCustom.trim();
        icon = '🥡';
      } else {
        name = grocItem;
        icon = groceryScope.items.find((i) => i.name === grocItem)?.icon || groceryScope.icon;
      }
    }

    if (!name) return null;
    return {
      id: uid(),
      name,
      category: itemCategory,
      icon,
      quantity: grocQty.trim() || undefined,
      expiryDate: grocExpiry.trim() || undefined,
      groceryReminderId: null,
    };
  };

  const addGroceryChip = () => {
    if (!groceryScope) return;
    if (groceryScope.mode === 'subcategory' && !grocSubcat) {
      Alert.alert(t('add.category'), t('add.chooseCategoryFirst'));
      return;
    }
    const pending = buildPendingGroceryItem();
    if (!pending) {
      Alert.alert(t('add.item'), t('add.chooseItemName'));
      return;
    }
    setGroceryItems((list) => [...list, pending]);
    setGrocCustom('');
    setGrocQty('');
    setGrocExpiry('');
  };

  const removeGroceryChip = (id: string) => {
    setGroceryItems((list) => list.filter((p) => p.id !== id));
  };

  const save = async () => {
    if (!requireAuthToSave('add transactions')) return;
    if (!canSave) {
      Alert.alert(t('common.amount'), t('add.enterAmount'));
      return;
    }

    const txnId = editingTxn?.id || uid();
    if (!category) return;

    // Include a grocery row still sitting in the form (user filled qty/item but didn't tap + Add).
    let itemsForSave = groceryItems;
    if (kind === 'expense' && isGroceryFamilyCat(category)) {
      const pending = buildPendingGroceryItem();
      if (pending) {
        itemsForSave = [...groceryItems, pending];
      }
    }

    let linkedItems: GroceryTxnItem[] | undefined;
    const newReminders: GroceryReminder[] = [];

    if (kind === 'expense' && isGroceryFamilyCat(category) && itemsForSave.length > 0) {
      linkedItems = itemsForSave.map((p) => {
        if (!p.expiryDate || p.groceryReminderId) return { ...p };
        const rid = uid();
        newReminders.push({
          id: rid,
          category: p.category || 'Others',
          item: p.name,
          icon: p.icon || '🥡',
          expiryDate: p.expiryDate,
          quantity: p.quantity,
          offsets: config.groceryOffsets,
          mode: 'default',
          fromTransactionId: txnId,
        });
        return { ...p, groceryReminderId: rid };
      });
    }

    // Prefer line-item quantities; also keep a simple quantity when only one item / non-grocery.
    const simpleQty =
      quantity.trim() ||
      (linkedItems?.length === 1 ? linkedItems[0].quantity : undefined) ||
      undefined;
    const simpleItem =
      itemName.trim() ||
      (linkedItems?.length === 1 ? linkedItems[0].name : undefined) ||
      undefined;

    const payload = {
      id: txnId,
      kind,
      category,
      amount: amountValue,
      date,
      note: note.trim(),
      accountId: accountId || resolveDefaultAccountId(finance),
      groceryItems: linkedItems,
      billImageUri: billImageUri || undefined,
      itemName: simpleItem,
      quantity: simpleQty,
    };

    const wasEditing = !!editingTxn;
    if (wasEditing) {
      await updateTransaction(payload);
    } else {
      await addTransaction(payload);
    }

    if (newReminders.length) {
      await setGroceryReminders([...newReminders, ...groceryReminders]);
    }
    onClose();
    showAppInfo(
      wasEditing ? t('common.updated') : t('common.saved'),
      wasEditing ? t('home.txnUpdated') : t('home.txnSaved'),
      '✅',
    );
  };

  const headerTitle =
    step === 1
      ? isEditing
        ? t('home.edit')
        : t('home.add')
      : category
        ? catName(category)
        : isEditing
          ? t('home.edit')
          : t('home.add');
  const saveLabel = isGuest
    ? t('add.signUpSave')
    : isEditing
      ? t('add.update')
      : t('home.save');

  const itemChoices =
    groceryScope?.mode === 'direct'
      ? groceryScope.items
      : groceryScope?.mode === 'subcategory' && grocSubcat
        ? GROCERY_CATEGORIES.find((c) => c.name === grocSubcat)?.items || []
        : [];

  const categoryDropdownOptions =
    groceryScope?.mode === 'subcategory'
      ? groceryScope.subcats.map((c) => ({
          value: c.name,
          label: `${c.icon} ${catName(c.name)}`,
        }))
      : [];

  const itemDropdownOptions = [
    ...itemChoices.map((it) => ({
      value: it.name,
      label: `${it.icon} ${it.name}`,
    })),
    { value: '__others__', label: `➕ ${t('add.othersType')}` },
  ];

  return (
    <>
    <BottomSheet visible={showAdd} onClose={onClose} style={styles.addSheet}>
      <View style={styles.sheetHeader}>
        {step === 2 ? (
          <Pressable onPress={() => setStep(1)} hitSlop={8}>
            <Text style={styles.headerBtn}>‹ {t('home.back')}</Text>
          </Pressable>
        ) : (
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={styles.headerBtn}>{t('home.cancel')}</Text>
          </Pressable>
        )}
        <Text style={styles.modalTitle}>{headerTitle}</Text>
        {step === 2 ? (
          <Pressable onPress={save} hitSlop={8}>
            <Text style={[styles.headerBtn, styles.headerSave]}>
              {isGuest ? t('add.signUp') : isEditing ? t('add.update') : t('home.save')}
            </Text>
          </Pressable>
        ) : (
          <View style={{ width: 56 }} />
        )}
      </View>

      {step === 1 ? (
        <>
          <View style={styles.kindTabs}>
            {(['expense', 'income'] as const).map((k) => (
              <Pressable
                key={k}
                style={[styles.kindTab, kind === k && styles.kindTabOn]}
                onPress={() => switchKind(k)}
              >
                <Text style={[styles.kindTabText, kind === k && styles.kindTabTextOn]}>
                  {k === 'expense' ? t('home.expenses') : t('home.income')}
                </Text>
              </Pressable>
            ))}
          </View>

          <ScrollView
            style={[styles.catScroll, { height: CAT_SCROLL_HEIGHT }]}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.catGrid}>
              {cats.map((c) => (
                <Pressable key={c.name} onPress={() => pickCategory(c.name)} style={styles.catCell}>
                  <View style={[styles.catIcon, { backgroundColor: `${c.color}22` }]}>
                    <Text style={{ fontSize: 20 }}>{c.icon}</Text>
                  </View>
                  <Text style={styles.catLabel} numberOfLines={1}>
                    {catName(c.name)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </>
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          <View style={styles.amountDisplay}>
            <View style={styles.catTag}>
              <View
                style={[
                  styles.tagIc,
                  { backgroundColor: selectedMeta?.color || theme.accent },
                ]}
              >
                <Text style={{ fontSize: 14 }}>{selectedMeta?.icon}</Text>
              </View>
              <Text style={styles.catTagText}>{category ? catName(category) : ''}</Text>
            </View>
            <View style={styles.amountRow}>
              <Text style={styles.amountSym}>{currencySym}</Text>
              <TextInput
                value={amountStr}
                onChangeText={() => {}}
                selection={amountSel}
                onSelectionChange={(e) => setAmountSel(e.nativeEvent.selection)}
                showSoftInputOnFocus={false}
                caretHidden={false}
                cursorColor={theme.accent}
                selectionColor={theme.accentSoft}
                autoFocus
                style={styles.amountInput}
                accessibilityLabel="Amount"
              />
            </View>
          </View>

          <View style={styles.keypad}>
            {KEYPAD.map((row) => (
              <View key={row.join('-')} style={styles.keypadRow}>
                {row.map((key) => (
                  <Pressable
                    key={key}
                    onPress={() => pressKey(key)}
                    style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
                  >
                    <Text style={[styles.keyText, key === '⌫' && styles.keyBack]}>{key}</Text>
                  </Pressable>
                ))}
              </View>
            ))}
          </View>

          <DateField label={t('add.date')} value={date} onChange={setDate} />

          <DropdownSelect
            label={kind === 'income' ? t('home.receivedIn') : t('home.paidWith')}
            value={accountId}
            placeholder={t('home.selectSource')}
            options={sortAccountsForDisplay(finance.accounts).map((a) => ({
              value: a.id,
              label: accountChipLabel(a),
            }))}
            onChange={setAccountId}
          />
          <Text style={[styles.fieldHint, { color: theme.muted, marginTop: -4 }]}>
            {kind === 'income' ? t('add.sourceIncomeHint') : t('add.sourceExpenseHint')}
          </Text>

          <Text style={styles.fieldLabel}>{t('home.note')}</Text>
          <View style={styles.noteRow}>
            <TextInput
              style={[styles.fieldInput, styles.noteInputFlex]}
              value={note}
              onChangeText={setNote}
              placeholder={t('add.notePlaceholder')}
              placeholderTextColor={theme.muted}
            />
            <Pressable
              style={styles.cameraBtn}
              onPress={() => promptBillImage((uri) => setBillEditUri(uri))}
            >
              <Text style={styles.cameraBtnIcon}>📷</Text>
            </Pressable>
          </View>
          {billImageUri ? (
            <View style={styles.billPreviewRow}>
              <Image source={{ uri: billImageUri }} style={styles.billThumb} />
              <View style={{ flex: 1 }}>
                <Text style={styles.billAttached}>{t('add.billAttached')}</Text>
                <Pressable onPress={() => setBillImageUri(null)}>
                  <Text style={styles.removeBill}>{t('home.remove')}</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {kind === 'expense' && !showGrocery ? (
            <>
              <Text style={styles.fieldLabel}>{t('add.item')}</Text>
              <TextInput
                style={styles.fieldInput}
                value={itemName}
                onChangeText={setItemName}
                placeholder={t('add.itemPlaceholder')}
                placeholderTextColor={theme.muted}
              />
              <Text style={styles.fieldLabel}>{t('add.quantity')}</Text>
              <TextInput
                style={styles.fieldInput}
                value={quantity}
                onChangeText={setQuantity}
                placeholder={t('add.qtyPlaceholder')}
                placeholderTextColor={theme.muted}
              />
            </>
          ) : null}

          {showGrocery && groceryScope ? (
            <View style={styles.groceryCard}>
              <Text style={styles.groceryTitle}>🛒 {t('add.addItems')}</Text>
              <Text style={styles.groceryHint}>{t('add.groceryHint')}</Text>

              {groceryScope.mode === 'subcategory' ? (
                <DropdownSelect
                  label={t('add.category')}
                  value={grocSubcat}
                  placeholder={t('add.selectCategory')}
                  options={categoryDropdownOptions}
                  onChange={(v) => {
                    setGrocSubcat(v);
                    setGrocItem('');
                    setGrocCustom('');
                  }}
                />
              ) : null}

              <DropdownSelect
                label={t('add.item')}
                value={grocItem}
                placeholder={
                  groceryScope.mode === 'subcategory' && !grocSubcat
                    ? t('add.selectCategory')
                    : t('add.selectItem')
                }
                options={
                  groceryScope.mode === 'subcategory' && !grocSubcat ? [] : itemDropdownOptions
                }
                disabled={groceryScope.mode === 'subcategory' && !grocSubcat}
                onChange={(v) => {
                  setGrocItem(v);
                  if (v !== '__others__') setGrocCustom('');
                }}
              />

              {grocItem === '__others__' ? (
                <TextInput
                  style={styles.fieldInput}
                  value={grocCustom}
                  onChangeText={setGrocCustom}
                  placeholder={t('add.itemPlaceholder')}
                  placeholderTextColor={theme.muted}
                />
              ) : null}

              <Text style={styles.fieldLabel}>{t('add.qtyOptional')}</Text>
              <TextInput
                style={styles.fieldInput}
                value={grocQty}
                onChangeText={setGrocQty}
                placeholder={t('add.qtyPlaceholder')}
                placeholderTextColor={theme.muted}
              />

              <Text style={styles.fieldLabel}>{t('add.expiryOptional')}</Text>
              <View style={styles.expiryRow}>
                <DateField
                  compact
                  clearable
                  value={grocExpiry}
                  onChange={setGrocExpiry}
                  placeholder={t('add.selectExpiry')}
                />
                <Pressable style={styles.addItemBtn} onPress={addGroceryChip}>
                  <Text style={styles.addItemBtnText}>{t('add.addItemBtn')}</Text>
                </Pressable>
              </View>

              <View style={styles.chipWrap}>
                {groceryItems.length === 0 ? (
                  <Text style={styles.groceryHint}>{t('add.noItemsYet')}</Text>
                ) : (
                  groceryItems.map((p) => (
                    <View key={p.id} style={styles.perishableChip}>
                      <Text style={styles.perishableChipText}>
                        {p.icon} {p.name}
                        {p.quantity ? ` · ×${p.quantity}` : ''}
                        {p.expiryDate ? ` · 🔔 ${p.expiryDate.slice(5)}` : ''}
                      </Text>
                      <Pressable onPress={() => removeGroceryChip(p.id)} hitSlop={6}>
                        <Text style={styles.chipX}>✕</Text>
                      </Pressable>
                    </View>
                  ))
                )}
              </View>
            </View>
          ) : null}

          <Pressable
            style={[styles.saveBtn, !canSave && !isGuest && styles.saveBtnDisabled, { marginTop: 8 }]}
            onPress={save}
          >
            <Text style={styles.saveText}>{saveLabel}</Text>
          </Pressable>
        </ScrollView>
      )}
    </BottomSheet>
    <BillImageEditor
      visible={!!billEditUri}
      uri={billEditUri}
      onCancel={() => setBillEditUri(null)}
      onSave={(uri) => {
        setBillImageUri(uri);
        setBillEditUri(null);
      }}
    />
    </>
  );
}

function makeStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.bg },
    summaryBand: {
      backgroundColor: theme.header,
      paddingHorizontal: 12,
      paddingTop: 0,
      paddingBottom: 12,
      overflow: 'hidden',
    },
    monthBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8,
      marginTop: 2,
    },
    year: { color: 'rgba(255,255,255,0.7)', fontWeight: '700', marginRight: 6 },
    month: { color: '#fff', fontWeight: '800', fontSize: 16 },
    monthNav: { color: '#fff', fontSize: 22, paddingHorizontal: 6 },
    statsRow: { flexDirection: 'row', gap: 8 },
    compactTabs: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 2,
    },
    compactTab: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: 'rgba(255,255,255,0.08)',
      borderWidth: 1.5,
      borderColor: 'transparent',
    },
    compactTabOn: {
      backgroundColor: 'rgba(255,255,255,0.18)',
      borderColor: theme.accentSoft,
    },
    compactTabText: { color: 'rgba(255,255,255,0.7)', fontWeight: '700', fontSize: 13 },
    compactTabTextOn: { color: '#fff', fontWeight: '800' },
    statTab: {
      flex: 1,
      alignItems: 'center',
      backgroundColor: 'rgba(255,255,255,0.08)',
      borderRadius: 12,
      paddingVertical: 10,
      paddingHorizontal: 6,
      borderWidth: 1.5,
      borderColor: 'transparent',
    },
    statTabOn: {
      backgroundColor: 'rgba(255,255,255,0.18)',
      borderColor: theme.accentSoft,
    },
    statBalance: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 6,
    },
    statLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 12, marginBottom: 4, fontWeight: '600' },
    statLabelOn: { color: '#fff', fontWeight: '800' },
    statValue: { color: 'rgba(255,255,255,0.85)', fontWeight: '800', fontSize: 15 },
    statValueOn: { color: '#fff' },
    statHint: {
      color: 'rgba(255,255,255,0.5)',
      fontSize: 10,
      fontWeight: '600',
      marginTop: 2,
    },
    list: { flex: 1 },
    listTitle: {
      color: theme.muted,
      fontWeight: '700',
      fontSize: 12,
      marginBottom: 10,
    },
    noteCard: {
      backgroundColor: theme.accentSoft,
      borderRadius: 14,
      padding: 14,
      marginBottom: 14,
    },
    noteTitle: { fontWeight: '800', color: theme.header, marginBottom: 4 },
    noteBody: { color: theme.header, lineHeight: 18, fontSize: 13 },
    empty: { alignItems: 'center', paddingVertical: 70 },
    emptyIcon: { fontSize: 42, marginBottom: 10, opacity: 0.5 },
    emptyTitle: { fontWeight: '800', fontSize: 16, color: theme.ink },
    emptySub: { color: theme.muted, marginTop: 4 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.card,
      borderRadius: 14,
      padding: 12,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: theme.line,
      gap: 12,
    },
    icon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
    rowTitle: { fontWeight: '700', color: theme.ink },
    rowSub: { color: theme.muted, fontSize: 12, marginTop: 2 },
    rowAmt: { fontWeight: '800' },
    billBadge: { fontSize: 14, marginRight: 4 },
    detailSheet: { paddingBottom: 12 },
    detailHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    detailTitle: { fontSize: 18, fontWeight: '800', color: theme.ink, flex: 1 },
    billImage: {
      width: '100%',
      height: 220,
      borderRadius: 14,
      backgroundColor: theme.bg,
      marginBottom: 14,
    },
    billPlaceholder: {
      height: 140,
      borderRadius: 14,
      backgroundColor: theme.bg,
      borderWidth: 1.5,
      borderColor: theme.line,
      borderStyle: 'dashed',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    billPlaceholderIcon: { fontSize: 28, marginBottom: 6, opacity: 0.6 },
    billPlaceholderText: { color: theme.muted, fontWeight: '600', fontSize: 13 },
    detailMeta: { marginBottom: 10 },
    detailMetaLabel: { color: theme.muted, fontWeight: '700', fontSize: 12, marginBottom: 2 },
    detailMetaValue: { color: theme.ink, fontWeight: '800', fontSize: 15 },
    itemsHeading: {
      fontWeight: '800',
      color: theme.ink,
      fontSize: 14,
      marginTop: 6,
      marginBottom: 8,
    },
    itemsTableHead: {
      flexDirection: 'row',
      paddingBottom: 6,
      borderBottomWidth: 1,
      borderBottomColor: theme.line,
      marginBottom: 4,
    },
    itemsRow: {
      flexDirection: 'row',
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: theme.line,
    },
    itemsColItem: { flex: 1, color: theme.ink, fontWeight: '600', fontSize: 14 },
    itemsColQty: { width: 72, textAlign: 'right', color: theme.ink, fontWeight: '700', fontSize: 14 },
    itemsHeadText: { color: theme.muted, fontWeight: '800', fontSize: 12 },
    editBtn: {
      marginTop: 18,
      backgroundColor: theme.header,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
    },
    editBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    deleteBtn: {
      marginTop: 10,
      backgroundColor: theme.bg,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: theme.red,
    },
    deleteBtnText: { color: theme.red, fontWeight: '800', fontSize: 15 },
    addSheet: { paddingBottom: 10 },
    noteRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
    noteInputFlex: { flex: 1, marginBottom: 0 },
    cameraBtn: {
      width: 46,
      height: 46,
      borderRadius: 12,
      backgroundColor: theme.accentSoft,
      borderWidth: 1.5,
      borderColor: theme.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cameraBtnIcon: { fontSize: 20 },
    billPreviewRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 12,
      backgroundColor: theme.bg,
      borderRadius: 12,
      padding: 8,
    },
    billThumb: { width: 56, height: 56, borderRadius: 10 },
    billAttached: { fontWeight: '800', color: theme.ink, fontSize: 13 },
    removeBill: { color: theme.red, fontWeight: '700', fontSize: 12, marginTop: 4 },
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    headerBtn: { color: theme.accent, fontWeight: '700', fontSize: 15, minWidth: 56 },
    headerSave: { fontWeight: '800', textAlign: 'right' },
    modalTitle: {
      fontSize: 17,
      fontWeight: '800',
      color: theme.ink,
      textAlign: 'center',
      flex: 1,
    },
    kindTabs: {
      flexDirection: 'row',
      borderWidth: 1.5,
      borderColor: theme.ink,
      borderRadius: 10,
      overflow: 'hidden',
      marginBottom: 12,
    },
    kindTab: {
      flex: 1,
      paddingVertical: 10,
      alignItems: 'center',
      backgroundColor: theme.accentSoft,
    },
    kindTabOn: { backgroundColor: theme.header },
    kindTabText: { fontWeight: '700', fontSize: 13.5, color: theme.ink },
    kindTabTextOn: { color: '#fff' },
    fieldLabel: {
      color: theme.muted,
      fontWeight: '700',
      fontSize: 12,
      marginBottom: 6,
      marginTop: 4,
    },
    fieldHint: {
      fontSize: 11,
      fontWeight: '600',
      marginBottom: 8,
      marginTop: -2,
      lineHeight: 15,
    },
    fieldInput: {
      borderWidth: 1.5,
      borderColor: theme.line,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 10,
      color: theme.ink,
      backgroundColor: theme.bg,
      fontSize: 14,
    },
    amountDisplay: { alignItems: 'center', marginBottom: 8 },
    amountRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      maxWidth: '100%',
    },
    amountSym: {
      fontSize: 36,
      fontWeight: '800',
      color: theme.ink,
      letterSpacing: -0.5,
      marginRight: 2,
    },
    amountInput: {
      fontSize: 36,
      fontWeight: '800',
      color: theme.ink,
      letterSpacing: -0.5,
      padding: 0,
      margin: 0,
      minWidth: 48,
      maxWidth: 260,
      textAlign: 'left',
    },
    catTag: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8,
    },
    tagIc: {
      width: 28,
      height: 28,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    catTagText: { fontWeight: '800', color: theme.ink, fontSize: 15 },
    catScroll: { flexGrow: 0 },
    catGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    catCell: {
      width: '25%',
      alignItems: 'center',
      marginBottom: 12,
      paddingHorizontal: 2,
    },
    catIcon: {
      width: 52,
      height: 52,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 5,
    },
    catLabel: { fontSize: 10, fontWeight: '700', color: theme.muted, textAlign: 'center' },
    accountScroll: { marginBottom: 8, maxHeight: 42 },
    accountChip: {
      borderWidth: 1.5,
      borderColor: theme.line,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: theme.bg,
      marginRight: 8,
    },
    accountChipOn: {
      backgroundColor: theme.header,
      borderColor: theme.header,
    },
    accountChipText: { fontWeight: '700', color: theme.ink, fontSize: 13 },
    accountChipTextOn: { color: '#fff' },
    keypad: {
      marginTop: 4,
      marginBottom: 10,
      gap: 6,
    },
    keypadRow: {
      flexDirection: 'row',
      gap: 6,
    },
    key: {
      flex: 1,
      height: 48,
      borderRadius: 14,
      backgroundColor: theme.bg,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.line,
    },
    keyPressed: {
      backgroundColor: theme.accentSoft,
      borderColor: theme.accent,
    },
    keyText: {
      fontSize: 22,
      fontWeight: '700',
      color: theme.ink,
    },
    keyBack: {
      fontSize: 20,
      color: theme.muted,
    },
    groceryCard: {
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.line,
      borderRadius: 14,
      padding: 14,
      marginTop: 6,
      marginBottom: 8,
    },
    groceryTitle: { fontWeight: '800', fontSize: 13.5, color: theme.ink, marginBottom: 2 },
    groceryHint: { fontSize: 12, color: theme.muted, marginBottom: 10, lineHeight: 16 },
    expiryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
    addItemBtn: {
      borderWidth: 1.5,
      borderColor: theme.header,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    addItemBtnText: { fontWeight: '800', color: theme.header },
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    perishableChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: theme.bg,
      borderRadius: 20,
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderWidth: 1,
      borderColor: theme.line,
    },
    perishableChipText: { fontSize: 12, fontWeight: '700', color: theme.ink },
    chipX: { color: theme.muted, fontWeight: '800', fontSize: 12 },
    saveBtn: {
      backgroundColor: theme.header,
      borderRadius: 14,
      paddingVertical: 15,
      alignItems: 'center',
      marginTop: 12,
    },
    saveBtnDisabled: {
      opacity: 0.45,
    },
    saveText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  });
}

