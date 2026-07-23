import React, { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useApp } from '../context/AppContext';
import { useFinance } from '../FinanceContext';
import { CURRENCIES, GROCERY_CATEGORIES, THEMES } from '../constants';
import { ThemeKey, ShoppingItem } from '../types';
import { Card, EmptyState, Field, PrimaryButton, Screen } from '../components/ui';
import { DateField } from '../components/DateField';
import { DropdownSelect } from '../components/DropdownSelect';
import { BottomSheet } from '../components/BottomSheet';
import { daysUntil } from '../alarms/engine';
import { fmt, todayStr, uid } from '../utils';
import { resolveDefaultAccountId } from '../cashBooks';
import { openAuthModal } from '../authGate';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { theme as pulse } from '../theme';

const UNITS = ['pcs', 'g', 'kg', 'ml', 'l', 'packet', 'dozen'] as const;

function findGroceryMeta(name: string) {
  const lower = name.trim().toLowerCase();
  for (const cat of GROCERY_CATEGORIES) {
    const found = cat.items.find((it) => it.name.toLowerCase() === lower);
    if (found) return { category: cat.name, icon: found.icon };
  }
  return { category: 'Others', icon: '🥡' };
}

function findMatchingGroceryReminder(
  name: string,
  groceryReminders: { item: string; expiryDate: string; quantity?: string }[],
) {
  const lower = name.trim().toLowerCase();
  if (!lower) return null;
  return (
    groceryReminders.find(
      (g) => g.item.trim().toLowerCase() === lower && daysUntil(g.expiryDate) >= 0,
    ) || null
  );
}

export function ShoppingListScreen() {
  const {
    theme,
    config,
    finance,
    shoppingList,
    setShoppingList,
    groceryReminders,
    setGroceryReminders,
    addTransaction,
  } = useApp();

  const [name, setName] = useState('');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState('pcs');
  const [price, setPrice] = useState('');
  const [expiry, setExpiry] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [prompt, setPrompt] = useState<
    null | { type: 'price' | 'expiry'; id: string; value: string }
  >(null);

  const list = useMemo(() => {
    const term = search.trim().toLowerCase();
    return shoppingList
      .filter((it) => !term || it.name.toLowerCase().includes(term))
      .slice()
      .sort((a, b) => (a.bought === b.bought ? 0 : a.bought ? 1 : -1));
  }, [shoppingList, search]);

  const resetAdd = () => {
    setName('');
    setQty('');
    setUnit('pcs');
    setPrice('');
    setExpiry('');
  };

  const confirmAdd = async (
    itemName: string,
    itemQty: string,
    itemUnit: string,
    itemPrice: string,
    itemExpiry: string,
  ) => {
    const next: ShoppingItem = {
      id: uid(),
      name: itemName,
      qty: itemQty,
      unit: itemUnit || 'pcs',
      price: itemPrice,
      expiry: itemExpiry || '',
      bought: false,
      addedDate: todayStr(),
      linkedTransactionId: null,
      linkedGroceryId: null,
    };
    await setShoppingList([next, ...shoppingList]);
    resetAdd();
  };

  const save = async () => {
    const itemName = name.trim();
    if (!itemName) {
      Alert.alert('Required', 'Enter an item name');
      return;
    }
    const match = findMatchingGroceryReminder(itemName, groceryReminders);
    if (match) {
      Alert.alert(
        'Already Tracked',
        `${match.item}${match.quantity ? ` (${match.quantity})` : ''} is already in Grocery Expiry Reminder. Add to buy list anyway?`,
        [
          { text: 'No, Skip', style: 'cancel' },
          {
            text: 'Yes, Add',
            onPress: () => void confirmAdd(itemName, qty.trim(), unit, price.trim(), expiry),
          },
        ],
      );
      return;
    }
    await confirmAdd(itemName, qty.trim(), unit, price.trim(), expiry);
  };

  const patchItem = async (id: string, patch: Partial<ShoppingItem>) => {
    await setShoppingList(shoppingList.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const selectedIds = useMemo(
    () => Object.keys(selected).filter((id) => selected[id]),
    [selected],
  );

  const toggleSelectAll = () => {
    if (selectedIds.length === list.length) {
      setSelected({});
      return;
    }
    const next: Record<string, boolean> = {};
    list.forEach((it) => {
      next[it.id] = true;
    });
    setSelected(next);
  };

  const doReflectFinance = async (item: ShoppingItem, forcedPrice?: number) => {
    const amount = forcedPrice ?? (parseFloat(String(item.price)) || 0);
    if (amount <= 0) {
      setPrompt({ type: 'price', id: item.id, value: String(item.price || '') });
      return;
    }
    if (item.linkedTransactionId) {
      Alert.alert('Already added', 'This item is already in Finance Tracker');
      return;
    }
    const txnId = uid();
    const note = item.name + (item.qty ? ` (${item.qty} ${item.unit || 'pcs'})` : '');
    await addTransaction({
      id: txnId,
      kind: 'expense',
      category: 'Groceries',
      amount,
      date: todayStr(),
      note,
      itemName: item.name,
      quantity: item.qty ? `${item.qty} ${item.unit || 'pcs'}` : undefined,
      accountId: resolveDefaultAccountId(finance),
    });
    await patchItem(item.id, {
      price: String(amount),
      linkedTransactionId: txnId,
      bought: true,
    });
  };

  const doReflectGrocery = async (item: ShoppingItem, forcedExpiry?: string) => {
    const expiryDate = forcedExpiry || item.expiry || '';
    if (!expiryDate) {
      setPrompt({ type: 'expiry', id: item.id, value: todayStr() });
      return;
    }
    if (item.linkedGroceryId) {
      Alert.alert('Already added', 'This item is already in Grocery Expiry Reminder');
      return;
    }
    const found = findGroceryMeta(item.name);
    const grocId = uid();
    await setGroceryReminders([
      {
        id: grocId,
        category: found.category,
        item: item.name,
        icon: found.icon,
        expiryDate,
        quantity: item.qty ? `${item.qty} ${item.unit || 'pcs'}` : undefined,
        offsets: config.groceryOffsets,
        mode: 'default',
      },
      ...groceryReminders,
    ]);
    await patchItem(item.id, { expiry: expiryDate, linkedGroceryId: grocId });
  };

  const bulkFinance = async () => {
    if (!selectedIds.length) {
      Alert.alert('Select items', 'Select at least one item first');
      return;
    }
    let added = 0;
    let skipped = 0;
    for (const id of selectedIds) {
      const item = shoppingList.find((x) => x.id === id);
      if (!item || item.linkedTransactionId || !(parseFloat(String(item.price)) > 0)) {
        skipped++;
        continue;
      }
      await doReflectFinance(item);
      added++;
    }
    Alert.alert(
      'Finance',
      `${added} added${skipped ? `, ${skipped} skipped (need price, or already added)` : ''}`,
    );
  };

  const bulkGrocery = async () => {
    if (!selectedIds.length) {
      Alert.alert('Select items', 'Select at least one item first');
      return;
    }
    let added = 0;
    let skipped = 0;
    for (const id of selectedIds) {
      const item = shoppingList.find((x) => x.id === id);
      if (!item || item.linkedGroceryId || !item.expiry) {
        skipped++;
        continue;
      }
      await doReflectGrocery(item);
      added++;
    }
    Alert.alert(
      'Grocery',
      `${added} added${skipped ? `, ${skipped} skipped (need expiry, or already added)` : ''}`,
    );
  };

  const submitPrompt = async () => {
    if (!prompt) return;
    const item = shoppingList.find((x) => x.id === prompt.id);
    if (!item) {
      setPrompt(null);
      return;
    }
    if (prompt.type === 'price') {
      const amount = parseFloat(prompt.value) || 0;
      if (amount <= 0) {
        Alert.alert('Price', 'Enter a price greater than 0');
        return;
      }
      setPrompt(null);
      await doReflectFinance(item, amount);
      return;
    }
    if (!prompt.value) {
      Alert.alert('Expiry', 'Pick an expiry date');
      return;
    }
    setPrompt(null);
    await doReflectGrocery(item, prompt.value);
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.h1, { color: theme.ink }]}>📝 List to Buy</Text>
        <Text style={[styles.sub, { color: theme.muted }]}>
          Plan your shop, then send items to Finance or Grocery Expiry.
        </Text>

        <Card>
          <Field label="Item Name" value={name} onChangeText={setName} placeholder="e.g. Apples" />
          <View style={styles.row2}>
            <View style={{ flex: 1 }}>
              <Field label="Quantity" value={qty} onChangeText={setQty} placeholder="e.g. 3, 1/2" />
            </View>
            <View style={{ width: 120, marginLeft: 8 }}>
              <DropdownSelect
                label="Unit"
                value={unit}
                placeholder="pcs"
                options={UNITS.map((u) => ({ value: u, label: u }))}
                onChange={setUnit}
              />
            </View>
          </View>
          <Field
            label="Price (optional)"
            value={price}
            onChangeText={setPrice}
            keyboardType="decimal-pad"
            placeholder="0.00"
          />
          <DateField
            label="Expiry (optional)"
            value={expiry}
            onChange={setExpiry}
            clearable
            placeholder="Select expiry"
          />
          <PrimaryButton title="+ Add" onPress={save} />
        </Card>

        <Field
          label="Search"
          value={search}
          onChangeText={setSearch}
          placeholder="🔍 Search your list…"
        />

        {shoppingList.length === 0 ? (
          <EmptyState
            icon="📝"
            title="Your shopping list is empty"
            subtitle="Add items above to start planning your next shop."
          />
        ) : list.length === 0 ? (
          <EmptyState icon="🔍" title="No matching items" />
        ) : (
          <>
            <View style={styles.bulkRow}>
              <Pressable onPress={toggleSelectAll} style={styles.bulkChip}>
                <Text style={styles.bulkChipText}>
                  {selectedIds.length === list.length ? 'Clear selection' : 'Select all'}
                </Text>
              </Pressable>
              <Pressable onPress={bulkFinance} style={styles.bulkChip}>
                <Text style={styles.bulkChipText}>💰 To Finance</Text>
              </Pressable>
              <Pressable onPress={bulkGrocery} style={styles.bulkChip}>
                <Text style={styles.bulkChipText}>🥦 To Grocery</Text>
              </Pressable>
            </View>

            {list.map((item) => {
              const tracked = findMatchingGroceryReminder(item.name, groceryReminders);
              return (
                <Card key={item.id} style={{ opacity: item.bought ? 0.72 : 1 }}>
                  <View style={styles.itemTop}>
                    <Pressable
                      onPress={() => toggleSelect(item.id)}
                      style={[
                        styles.check,
                        selected[item.id] && { backgroundColor: pulse.accent, borderColor: pulse.accent },
                      ]}
                    >
                      <Text style={{ color: '#fff', fontWeight: '800' }}>
                        {selected[item.id] ? '✓' : ''}
                      </Text>
                    </Pressable>
                    <View style={{ flex: 1 }}>
                      <TextInput
                        value={item.name}
                        onChangeText={(t) => patchItem(item.id, { name: t })}
                        style={[styles.nameInput, { color: theme.ink }]}
                      />
                      {tracked ? (
                        <Text style={{ color: pulse.accent, fontWeight: '700', fontSize: 11 }}>
                          🔗 tracked in Grocery Expiry
                        </Text>
                      ) : null}
                    </View>
                    <Pressable
                      onPress={() => patchItem(item.id, { bought: !item.bought })}
                      style={[
                        styles.boughtBtn,
                        item.bought && { backgroundColor: theme.green, borderColor: theme.green },
                      ]}
                    >
                      <Text style={{ color: item.bought ? '#fff' : theme.muted, fontWeight: '800' }}>
                        {item.bought ? '✓' : ''}
                      </Text>
                    </Pressable>
                  </View>

                  <View style={styles.metaRow}>
                    <TextInput
                      value={item.qty}
                      onChangeText={(t) => patchItem(item.id, { qty: t })}
                      placeholder="qty"
                      placeholderTextColor={theme.muted}
                      style={[styles.miniInput, { color: theme.ink, borderColor: theme.line }]}
                    />
                    <DropdownSelect
                      value={item.unit || 'pcs'}
                      placeholder="unit"
                      options={UNITS.map((u) => ({ value: u, label: u }))}
                      onChange={(u) => patchItem(item.id, { unit: u })}
                    />
                    <TextInput
                      value={String(item.price ?? '')}
                      onChangeText={(t) => patchItem(item.id, { price: t })}
                      placeholder="price"
                      keyboardType="decimal-pad"
                      placeholderTextColor={theme.muted}
                      style={[styles.miniInput, { color: theme.ink, borderColor: theme.line }]}
                    />
                  </View>

                  <DateField
                    label="Expiry"
                    value={item.expiry || ''}
                    onChange={(d) => patchItem(item.id, { expiry: d })}
                    clearable
                    placeholder="No expiry"
                  />

                  <View style={styles.actions}>
                    <Pressable
                      style={[styles.actBtn, item.linkedTransactionId && styles.actDone]}
                      onPress={() => void doReflectFinance(item)}
                    >
                      <Text style={styles.actText}>
                        {item.linkedTransactionId ? '✓ 💰 Finance' : '💰 Finance'}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.actBtn, item.linkedGroceryId && styles.actDone]}
                      onPress={() => void doReflectGrocery(item)}
                    >
                      <Text style={styles.actText}>
                        {item.linkedGroceryId ? '✓ 🥦 Grocery' : '🥦 Grocery'}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={styles.deleteBtn}
                      onPress={() => {
                        Alert.alert('Delete item?', item.name, [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Delete',
                            style: 'destructive',
                            onPress: () =>
                              void setShoppingList(shoppingList.filter((x) => x.id !== item.id)),
                          },
                        ]);
                      }}
                    >
                      <Text style={{ color: theme.red, fontWeight: '800' }}>✕</Text>
                    </Pressable>
                  </View>
                </Card>
              );
            })}
          </>
        )}
      </ScrollView>

      <BottomSheet visible={!!prompt} onClose={() => setPrompt(null)}>
        <Text style={[styles.h1, { color: theme.ink, fontSize: 18 }]}>
          {prompt?.type === 'price' ? 'Enter Price' : 'Enter Expiry Date'}
        </Text>
        {prompt?.type === 'price' ? (
          <Field
            label={`Price (${fmt(0, config.currency).replace(/[\d.,]+/g, '').trim() || '₹'})`}
            value={prompt.value}
            onChangeText={(t) => setPrompt({ ...prompt, value: t })}
            keyboardType="decimal-pad"
            placeholder="0.00"
          />
        ) : (
          <DateField
            label="Expiry Date"
            value={prompt?.value || todayStr()}
            onChange={(d) => prompt && setPrompt({ ...prompt, value: d })}
          />
        )}
        <PrimaryButton title="Add" onPress={submitPrompt} />
        <PrimaryButton title="Cancel" danger onPress={() => setPrompt(null)} style={{ marginTop: 8 }} />
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 24, fontWeight: '800', marginBottom: 4 },
  sub: { fontSize: 13, marginBottom: 14, lineHeight: 18 },
  row2: { flexDirection: 'row', alignItems: 'flex-start' },
  bulkRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  bulkChip: {
    backgroundColor: pulse.accentSoft,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: pulse.accent,
  },
  bulkChipText: { fontWeight: '800', color: pulse.header, fontSize: 12 },
  itemTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  check: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: pulse.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameInput: { fontWeight: '800', fontSize: 16, padding: 0 },
  boughtBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: pulse.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginBottom: 4 },
  miniInput: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontWeight: '600',
    fontSize: 13,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  actBtn: {
    borderWidth: 1.5,
    borderColor: pulse.line,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: pulse.bg,
  },
  actDone: {
    backgroundColor: pulse.accentSoft,
    borderColor: pulse.accent,
  },
  actText: { fontWeight: '800', fontSize: 12, color: pulse.ink },
  deleteBtn: {
    marginLeft: 'auto',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
});

export function AdminScreen() {
  // Admin login is enough — no extra panel password gate
  const {
    theme,
    config,
    updateConfig,
    exportBackup,
    importBackup,
    resetAll,
  } = useApp();
  const { isAdmin, isGuest } = useFinance();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [appName, setAppName] = useState(config.appName);
  const [importText, setImportText] = useState('');

  if (!isAdmin) {
    return (
      <Screen>
        <View style={{ padding: 20, marginTop: 40 }}>
          <Card>
            <Text style={{ color: theme.ink, fontWeight: '800', fontSize: 18, marginBottom: 8 }}>
              Admin access only
            </Text>
            <Text style={{ color: theme.muted, lineHeight: 20, marginBottom: 16 }}>
              {isGuest
                ? 'Sign in with an admin account to open settings. Guests and regular users cannot change app settings.'
                : 'Your account is not an admin. Ask an existing admin to promote your email in Supabase profiles.'}
            </Text>
            {isGuest ? (
              <PrimaryButton title="Login as admin" onPress={() => openAuthModal('login')} />
            ) : null}
          </Card>
        </View>
      </Screen>
    );
  }

  const toggleFeature = (key: keyof typeof config.features) => {
    updateConfig({
      features: {
        ...config.features,
        [key]: !config.features[key],
      },
    });
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Card>
          <Text style={{ color: theme.ink, fontWeight: '800', fontSize: 16, marginBottom: 10 }}>App settings</Text>
          <Field label="App name" value={appName} onChangeText={setAppName} />
          <PrimaryButton
            title="Save app name"
            onPress={() => updateConfig({ appName: appName.trim() || 'Pulse Wallet' })}
          />
        </Card>

        <Card>
          <Text style={{ color: theme.ink, fontWeight: '800', fontSize: 16, marginBottom: 10 }}>Theme</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {(Object.keys(THEMES) as ThemeKey[]).map((key) => (
              <Pressable
                key={key}
                onPress={() => updateConfig({ theme: key })}
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 14,
                  backgroundColor: THEMES[key].primary,
                  borderWidth: config.theme === key ? 3 : 0,
                  borderColor: theme.ink,
                  alignItems: 'flex-end',
                  justifyContent: 'flex-end',
                  padding: 6,
                }}
              >
                <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>{THEMES[key].label.split(' ')[0]}</Text>
              </Pressable>
            ))}
          </View>
        </Card>

        <Card>
          <Text style={{ color: theme.ink, fontWeight: '800', fontSize: 16, marginBottom: 10 }}>Currency</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {CURRENCIES.map((c) => (
              <Pressable
                key={c.code}
                onPress={() => updateConfig({ currency: c.code })}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 10,
                  borderWidth: 1.5,
                  borderColor: theme.line,
                  backgroundColor: config.currency === c.code ? theme.primary : theme.card,
                }}
              >
                <Text style={{ fontWeight: '700', color: theme.ink }}>
                  {c.sym} {c.code}
                </Text>
              </Pressable>
            ))}
          </View>
        </Card>

        <Card>
          <Text style={{ color: theme.ink, fontWeight: '800', fontSize: 16, marginBottom: 8 }}>
            Alarms & Notifications
          </Text>
          <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 18, marginBottom: 12 }}>
            Medicine times, daily alert time, expense/grocery reminder offsets, and alarm duration —
            same as the HTML admin panel.
          </Text>
          <PrimaryButton
            title="Open alarm settings"
            onPress={() => navigation.navigate('AlarmSettings')}
          />
        </Card>

        <Card>
          <Text style={{ color: theme.ink, fontWeight: '800', fontSize: 16, marginBottom: 10 }}>Features</Text>
          {(
            [
              ['finance', 'Finance tracker'],
              ['reminders', 'Reminders hub'],
              ['expenseReminder', 'Expense reminders'],
              ['medicineReminder', 'Medicine reminders'],
              ['groceryExpiryReminder', 'Grocery expiry'],
              ['generalReminder', 'General reminders'],
              ['shoppingList', 'Shopping list'],
              ['financeCharts', 'Finance charts'],
              ['financeReports', 'Finance reports'],
              ['financeAccounts', 'Accounts'],
            ] as const
          ).map(([key, label]) => (
            <Pressable
              key={key}
              onPress={() => toggleFeature(key)}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderBottomColor: theme.line,
              }}
            >
              <Text style={{ color: theme.ink, fontWeight: '600' }}>{label}</Text>
              <View
                style={{
                  width: 44,
                  height: 25,
                  borderRadius: 20,
                  backgroundColor: config.features[key] ? theme.primary : '#e2e2e5',
                  justifyContent: 'center',
                  paddingHorizontal: 2,
                }}
              >
                <View
                  style={{
                    width: 21,
                    height: 21,
                    borderRadius: 11,
                    backgroundColor: '#fff',
                    alignSelf: config.features[key] ? 'flex-end' : 'flex-start',
                  }}
                />
              </View>
            </Pressable>
          ))}
        </Card>

        <Card>
          <Text style={{ color: theme.ink, fontWeight: '800', fontSize: 16, marginBottom: 10 }}>Backup</Text>
          <PrimaryButton
            title="Export / Share backup JSON"
            onPress={async () => {
              await Share.share({ message: exportBackup(), title: 'Pulse Wallet Backup' });
            }}
          />
          <Field
            label="Paste backup JSON to import"
            value={importText}
            onChangeText={setImportText}
            multiline
            style={{ minHeight: 90, textAlignVertical: 'top' }}
          />
          <PrimaryButton
            title="Import backup"
            onPress={async () => {
              const ok = await importBackup(importText);
              Alert.alert(ok ? 'Imported successfully' : 'Invalid backup file');
              if (ok) setImportText('');
            }}
          />
        </Card>

        <Card style={{ borderColor: theme.red, borderWidth: 1.5 }}>
          <Text style={{ color: theme.red, fontWeight: '800', marginBottom: 8 }}>Danger zone</Text>
          <PrimaryButton
            title="Delete all data"
            danger
            onPress={() =>
              Alert.alert('Delete everything?', 'This cannot be undone.', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: () => void resetAll(),
                },
              ])
            }
          />
        </Card>
      </ScrollView>
    </Screen>
  );
}
