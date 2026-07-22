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
import {
  GROCERY_CATEGORIES,
  getGroceryItemScope,
  isGroceryFamilyCat,
} from '../constants';
import { EXPENSE_CATS, INCOME_CATS, catMeta, fmt, monthLabel, theme } from '../theme';
import type { GroceryReminder, GroceryTxnItem, Transaction } from '../types';
import { currencySymbol, todayStr, uid } from '../utils';
import { promptBillImage } from '../utils/billImage';
import { GuestBanner } from '../components/Shared';
import { BottomSheet } from '../components/BottomSheet';
import { DropdownSelect } from '../components/DropdownSelect';
import { DateField } from '../components/DateField';

function shiftMonth(key: string, delta: number) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function HomeScreen() {
  const { currentMonth, setCurrentMonth, isGuest } = useFinance();
  const { finance, config } = useApp();
  const insets = useSafeAreaInsets();
  /** Income is the default tab */
  const [listKind, setListKind] = useState<'income' | 'expense'>('income');
  const [selectedExpense, setSelectedExpense] = useState<Transaction | null>(null);

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

  const filteredTxns = useMemo(
    () =>
      monthTxns
        .filter((t) => t.kind === listKind)
        .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)),
    [monthTxns, listKind],
  );

  return (
    <View style={styles.root}>
      <GuestBanner />

      <View style={styles.summaryBand}>
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

        <View style={styles.statsRow}>
          <Pressable
            style={[styles.statTab, listKind === 'expense' && styles.statTabOn]}
            onPress={() => setListKind('expense')}
          >
            <Text style={[styles.statLabel, listKind === 'expense' && styles.statLabelOn]}>
              Expenses
            </Text>
            <Text style={[styles.statValue, listKind === 'expense' && styles.statValueOn]}>
              {fmt(monthSummary.expenses, config.currency)}
            </Text>
          </Pressable>

          <Pressable
            style={[styles.statTab, listKind === 'income' && styles.statTabOn]}
            onPress={() => setListKind('income')}
          >
            <Text style={[styles.statLabel, listKind === 'income' && styles.statLabelOn]}>
              Income
            </Text>
            <Text style={[styles.statValue, listKind === 'income' && styles.statValueOn]}>
              {fmt(monthSummary.income, config.currency)}
            </Text>
          </Pressable>

          <View style={styles.statBalance}>
            <Text style={styles.statLabel}>Balance</Text>
            <Text style={styles.statValue}>{fmt(monthSummary.balance, config.currency)}</Text>
          </View>
        </View>
      </View>

      <FlatList
        data={filteredTxns}
        keyExtractor={(t) => t.id}
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
              <Text style={styles.noteTitle}>Guest mode</Text>
              <Text style={styles.noteBody}>
                Everything starts at zero. Sign up from Profile (or when saving) to keep your own
                records.
              </Text>
            </View>
          ) : (
            <Text style={styles.listTitle}>
              {listKind === 'income' ? 'Income' : 'Expenses'} · {filteredTxns.length} record
              {filteredTxns.length === 1 ? '' : 's'}
            </Text>
          )
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>{listKind === 'income' ? '💰' : '🧾'}</Text>
            <Text style={styles.emptyTitle}>
              No {listKind === 'income' ? 'income' : 'expenses'} this month
            </Text>
            <Text style={styles.emptySub}>Tap + to add one</Text>
          </View>
        }
        renderItem={({ item: t }) => {
          const kind = t.kind === 'income' ? 'income' : 'expense';
          const meta = catMeta(t.category, kind);
          const row = (
            <>
              <View style={[styles.icon, { backgroundColor: meta.color + '22' }]}>
                <Text style={{ fontSize: 18 }}>{meta.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{t.category}</Text>
                <Text style={styles.rowSub}>{t.note || t.date}</Text>
              </View>
              {t.billImageUri ? <Text style={styles.billBadge}>🧾</Text> : null}
              <Text
                style={[
                  styles.rowAmt,
                  { color: t.kind === 'income' ? theme.green : theme.red },
                ]}
              >
                {t.kind === 'income' ? '+' : '-'}
                {fmt(t.amount, config.currency)}
              </Text>
            </>
          );

          if (t.kind === 'expense') {
            return (
              <Pressable style={styles.row} onPress={() => setSelectedExpense(t)}>
                {row}
              </Pressable>
            );
          }
          return <View style={styles.row}>{row}</View>;
        }}
      />

      <ExpenseDetailSheet
        txn={selectedExpense}
        currency={config.currency}
        onClose={() => setSelectedExpense(null)}
      />
    </View>
  );
}

function ExpenseDetailSheet({
  txn,
  currency,
  onClose,
}: {
  txn: Transaction | null;
  currency: string;
  onClose: () => void;
}) {
  const items =
    txn?.groceryItems && txn.groceryItems.length > 0
      ? txn.groceryItems.map((g) => ({
          key: g.id,
          label: `${g.icon || '🛒'} ${g.name}`,
          qty: g.quantity?.trim() || '—',
        }))
      : txn
        ? [
            {
              key: 'single',
              label: txn.itemName?.trim() || txn.note?.trim() || txn.category,
              qty: txn.quantity?.trim() || '—',
            },
          ]
        : [];

  return (
    <BottomSheet visible={!!txn} onClose={onClose} style={styles.detailSheet}>
      {!txn ? null : (
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.detailHeader}>
            <Text style={styles.detailTitle}>{txn.category}</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.headerBtn}>Close</Text>
            </Pressable>
          </View>

          {txn.billImageUri ? (
            <Image source={{ uri: txn.billImageUri }} style={styles.billImage} resizeMode="cover" />
          ) : (
            <View style={styles.billPlaceholder}>
              <Text style={styles.billPlaceholderIcon}>🧾</Text>
              <Text style={styles.billPlaceholderText}>No bill image attached</Text>
            </View>
          )}

          <View style={styles.detailMeta}>
            <Text style={styles.detailMetaLabel}>Transaction date</Text>
            <Text style={styles.detailMetaValue}>{txn.date}</Text>
          </View>
          <View style={styles.detailMeta}>
            <Text style={styles.detailMetaLabel}>Amount</Text>
            <Text style={[styles.detailMetaValue, { color: theme.red }]}>
              −{fmt(txn.amount, currency)}
            </Text>
          </View>

          <Text style={styles.itemsHeading}>Items</Text>
          <View style={styles.itemsTableHead}>
            <Text style={[styles.itemsColItem, styles.itemsHeadText]}>Item</Text>
            <Text style={[styles.itemsColQty, styles.itemsHeadText]}>Qty</Text>
          </View>
          {items.map((it) => (
            <View key={it.key} style={styles.itemsRow}>
              <Text style={styles.itemsColItem}>{it.label}</Text>
              <Text style={styles.itemsColQty}>{it.qty}</Text>
            </View>
          ))}

          {txn.note ? (
            <View style={[styles.detailMeta, { marginTop: 14 }]}>
              <Text style={styles.detailMetaLabel}>Note</Text>
              <Text style={styles.detailMetaValue}>{txn.note}</Text>
            </View>
          ) : null}
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
  const { showAdd, setShowAdd, isGuest, setShowAuth, setAuthMode } = useFinance();
  const { finance, addTransaction, config, groceryReminders, setGroceryReminders } = useApp();

  const [step, setStep] = useState<1 | 2>(1);
  const [kind, setKind] = useState<AddKind>('expense');
  const [category, setCategory] = useState<string | null>(null);
  const [amountStr, setAmountStr] = useState('0');
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState('');
  const [accountId, setAccountId] = useState('');
  const [billImageUri, setBillImageUri] = useState<string | null>(null);
  const [itemName, setItemName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [groceryItems, setGroceryItems] = useState<GroceryTxnItem[]>([]);
  const [grocSubcat, setGrocSubcat] = useState('');
  const [grocItem, setGrocItem] = useState('');
  const [grocCustom, setGrocCustom] = useState('');
  const [grocQty, setGrocQty] = useState('');
  const [grocExpiry, setGrocExpiry] = useState('');

  const cats = kind === 'income' ? INCOME_CATS : EXPENSE_CATS;
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
    setDate(todayStr());
    setNote('');
    setAccountId(finance.accounts[0]?.id ?? '');
    setBillImageUri(null);
    setItemName('');
    setQuantity('');
    setGroceryItems([]);
    setGrocSubcat('');
    setGrocItem('');
    setGrocCustom('');
    setGrocQty('');
    setGrocExpiry('');
  };

  useEffect(() => {
    if (showAdd) resetForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when sheet opens
  }, [showAdd]);

  const onClose = () => {
    setShowAdd(false);
    resetForm();
  };

  const switchKind = (k: AddKind) => {
    setKind(k);
    setCategory(null);
    setGroceryItems([]);
    setStep(1);
    setAmountStr('0');
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
    setAmountStr((prev) => {
      if (key === '⌫') return prev.length > 1 ? prev.slice(0, -1) : '0';
      if (key === '.') return prev.includes('.') ? prev : `${prev}.`;
      const next = prev === '0' ? key : `${prev}${key}`;
      return next.length > 12 ? next.slice(0, 12) : next;
    });
  };

  const addGroceryChip = () => {
    if (!groceryScope) return;
    let itemCategory = '';
    let name = '';
    let icon = '🥡';

    if (groceryScope.mode === 'subcategory') {
      if (!grocSubcat) {
        Alert.alert('Category', 'Choose a category first');
        return;
      }
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

    if (!name) {
      Alert.alert('Item', 'Choose or type an item name');
      return;
    }

    setGroceryItems((list) => [
      ...list,
      {
        id: uid(),
        name,
        category: itemCategory,
        icon,
        quantity: grocQty.trim() || undefined,
        expiryDate: grocExpiry.trim() || undefined,
        groceryReminderId: null,
      },
    ]);
    setGrocCustom('');
    setGrocQty('');
    setGrocExpiry('');
  };

  const removeGroceryChip = (id: string) => {
    setGroceryItems((list) => list.filter((p) => p.id !== id));
  };

  const save = async () => {
    if (isGuest) {
      setAuthMode('signup');
      setShowAuth(true);
      return;
    }
    if (!canSave) {
      Alert.alert('Amount', 'Enter an amount greater than 0');
      return;
    }

    const txnId = uid();
    if (!category) return;

    let linkedItems: GroceryTxnItem[] | undefined;
    const newReminders: GroceryReminder[] = [];

    if (kind === 'expense' && isGroceryFamilyCat(category) && groceryItems.length > 0) {
      linkedItems = groceryItems.map((p) => {
        if (!p.expiryDate || p.groceryReminderId) return { ...p };
        const rid = uid();
        newReminders.push({
          id: rid,
          category: p.category || 'Others',
          item: p.name,
          icon: p.icon || '🥡',
          expiryDate: p.expiryDate,
          offsets: config.groceryOffsets,
          mode: 'default',
          fromTransactionId: txnId,
        });
        return { ...p, groceryReminderId: rid };
      });
    }

    await addTransaction({
      id: txnId,
      kind,
      category,
      amount: amountValue,
      date,
      note: note.trim(),
      accountId: accountId || finance.accounts[0]?.id,
      groceryItems: linkedItems,
      billImageUri: billImageUri || undefined,
      itemName: itemName.trim() || undefined,
      quantity: quantity.trim() || undefined,
    });

    if (newReminders.length) {
      await setGroceryReminders([...newReminders, ...groceryReminders]);
    }
    onClose();
  };

  const amountDisplay = amountStr.includes('.')
    ? amountStr
    : Number(amountStr).toLocaleString('en-IN');

  const headerTitle = step === 1 ? 'Add' : category || 'Add';

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
          label: `${c.icon} ${c.name}`,
        }))
      : [];

  const itemDropdownOptions = [
    ...itemChoices.map((it) => ({
      value: it.name,
      label: `${it.icon} ${it.name}`,
    })),
    { value: '__others__', label: '➕ Others (type below)' },
  ];

  return (
    <BottomSheet visible={showAdd} onClose={onClose} style={styles.addSheet}>
      <View style={styles.sheetHeader}>
        {step === 2 ? (
          <Pressable onPress={() => setStep(1)} hitSlop={8}>
            <Text style={styles.headerBtn}>‹ Back</Text>
          </Pressable>
        ) : (
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={styles.headerBtn}>Cancel</Text>
          </Pressable>
        )}
        <Text style={styles.modalTitle}>{headerTitle}</Text>
        {step === 2 ? (
          <Pressable onPress={save} hitSlop={8}>
            <Text style={[styles.headerBtn, styles.headerSave]}>
              {isGuest ? 'Sign up' : 'Save'}
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
                  {k[0].toUpperCase() + k.slice(1)}
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
                    {c.name}
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
              <Text style={styles.catTagText}>{category}</Text>
            </View>
            <Text style={styles.amountText} numberOfLines={1}>
              {currencySym}
              {amountDisplay}
            </Text>
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

          <DateField label="Date" value={date} onChange={setDate} />

          <Text style={styles.fieldLabel}>Account</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.accountScroll}>
            {finance.accounts.map((a) => (
              <Pressable
                key={a.id}
                onPress={() => setAccountId(a.id)}
                style={[styles.accountChip, accountId === a.id && styles.accountChipOn]}
              >
                <Text style={styles.accountChipText}>
                  {a.icon} {a.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <Text style={styles.fieldLabel}>Note</Text>
          <View style={styles.noteRow}>
            <TextInput
              style={[styles.fieldInput, styles.noteInputFlex]}
              value={note}
              onChangeText={setNote}
              placeholder="Add a note"
              placeholderTextColor={theme.muted}
            />
            <Pressable
              style={styles.cameraBtn}
              onPress={() => promptBillImage((uri) => setBillImageUri(uri))}
            >
              <Text style={styles.cameraBtnIcon}>📷</Text>
            </Pressable>
          </View>
          {billImageUri ? (
            <View style={styles.billPreviewRow}>
              <Image source={{ uri: billImageUri }} style={styles.billThumb} />
              <View style={{ flex: 1 }}>
                <Text style={styles.billAttached}>Bill attached</Text>
                <Pressable onPress={() => setBillImageUri(null)}>
                  <Text style={styles.removeBill}>Remove</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {kind === 'expense' && !showGrocery ? (
            <>
              <Text style={styles.fieldLabel}>Item</Text>
              <TextInput
                style={styles.fieldInput}
                value={itemName}
                onChangeText={setItemName}
                placeholder="Item name"
                placeholderTextColor={theme.muted}
              />
              <Text style={styles.fieldLabel}>Quantity</Text>
              <TextInput
                style={styles.fieldInput}
                value={quantity}
                onChangeText={setQuantity}
                placeholder="e.g. 2 kg / 1 pack"
                placeholderTextColor={theme.muted}
              />
            </>
          ) : null}

          {showGrocery && groceryScope ? (
            <View style={styles.groceryCard}>
              <Text style={styles.groceryTitle}>🛒 Add Items (optional)</Text>
              <Text style={styles.groceryHint}>
                Tag specific items from this purchase. Give an item an expiry date to also track it
                in Grocery Expiry Reminder — leave the date blank to just label the purchase.
              </Text>

              {groceryScope.mode === 'subcategory' ? (
                <DropdownSelect
                  label="Category"
                  value={grocSubcat}
                  placeholder="— Select a category —"
                  options={categoryDropdownOptions}
                  onChange={(v) => {
                    setGrocSubcat(v);
                    setGrocItem('');
                    setGrocCustom('');
                  }}
                />
              ) : null}

              <DropdownSelect
                label="Item"
                value={grocItem}
                placeholder={
                  groceryScope.mode === 'subcategory' && !grocSubcat
                    ? '— Select a category first —'
                    : '— Select an item —'
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
                  placeholder="Item name"
                  placeholderTextColor={theme.muted}
                />
              ) : null}

              <Text style={styles.fieldLabel}>Quantity (optional)</Text>
              <TextInput
                style={styles.fieldInput}
                value={grocQty}
                onChangeText={setGrocQty}
                placeholder="e.g. 1 kg / 2 packs"
                placeholderTextColor={theme.muted}
              />

              <Text style={styles.fieldLabel}>Expiry Date (optional)</Text>
              <View style={styles.expiryRow}>
                <DateField
                  compact
                  clearable
                  value={grocExpiry}
                  onChange={setGrocExpiry}
                  placeholder="Select expiry"
                />
                <Pressable style={styles.addItemBtn} onPress={addGroceryChip}>
                  <Text style={styles.addItemBtnText}>+ Add</Text>
                </Pressable>
              </View>

              <View style={styles.chipWrap}>
                {groceryItems.length === 0 ? (
                  <Text style={styles.groceryHint}>No items added yet.</Text>
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
            <Text style={styles.saveText}>{isGuest ? 'Sign up to save' : 'Save'}</Text>
          </Pressable>
        </ScrollView>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  summaryBand: {
    backgroundColor: theme.header,
    paddingHorizontal: 12,
    paddingTop: 0,
    paddingBottom: 12,
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
  amountText: {
    fontSize: 36,
    fontWeight: '800',
    color: theme.ink,
    letterSpacing: -0.5,
  },
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
    backgroundColor: theme.accentSoft,
    borderColor: theme.accent,
  },
  accountChipText: { fontWeight: '700', color: theme.ink, fontSize: 13 },
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
