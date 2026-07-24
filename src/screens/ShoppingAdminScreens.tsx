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
import { GROCERY_CATEGORIES, THEMES } from '../constants';
import { ShoppingItem, ThemeAccess, ThemeKey } from '../types';
import { Card, EmptyState, Field, PrimaryButton, Screen } from '../components/ui';
import { DateField } from '../components/DateField';
import { DropdownSelect } from '../components/DropdownSelect';
import { BottomSheet } from '../components/BottomSheet';
import { daysUntil } from '../alarms/engine';
import { fmt, todayStr, uid } from '../utils';
import { resolveDefaultAccountId } from '../cashBooks';
import { openAuthModal, requireAuthToSave } from '../authGate';
import { showAppDialog, showAppInfo } from '../appDialog';
import { ProfileAdBanner } from '../components/ProfileAdBanner';
import { clearPersistedAdMedia, pickAdBannerImage, pickAdBannerVideo } from '../utils/adBannerMedia';
import { emptyAdCreative } from '../utils/adCreative';
import { themesForAccess, themeAccessFor } from '../utils/themeAccess';
import type { AdBannerConfig, AdCreative, ThemeTokens } from '../types';
import { useT } from '../i18n/useT';

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
  const { t } = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { isGuest } = useFinance();

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
    if (!requireAuthToSave('save shopping list')) return;
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
        Alert.alert(t('shop.priceTitle'), t('shop.priceAlert'));
        return;
      }
      setPrompt(null);
      await doReflectFinance(item, amount);
      return;
    }
    if (!prompt.value) {
      Alert.alert(t('shop.expiry'), t('shop.expiryAlert'));
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
        <Text style={[styles.h1, { color: theme.ink }]}>📝 {t('shop.title')}</Text>
        <Text style={[styles.sub, { color: theme.muted }]}>{t('shop.sub')}</Text>

        <Card>
          {isGuest ? (
            <>
              <Text style={{ color: theme.ink, fontWeight: '700', marginBottom: 8 }}>
                {t('shop.signInTitle')}
              </Text>
              <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 18, marginBottom: 12 }}>
                {t('shop.signInBody')}
              </Text>
              <PrimaryButton
                title={t('shop.loginSignup')}
                onPress={() => {
                  requireAuthToSave('save shopping list');
                }}
              />
            </>
          ) : (
            <>
              <Field
                label={t('shop.itemName')}
                value={name}
                onChangeText={setName}
                placeholder={t('shop.itemPlaceholder')}
              />
              <View style={styles.row2}>
                <View style={{ flex: 1 }}>
                  <Field
                    label={t('shop.quantity')}
                    value={qty}
                    onChangeText={setQty}
                    placeholder={t('shop.qtyPlaceholder')}
                  />
                </View>
                <View style={{ width: 120, marginLeft: 8 }}>
                  <DropdownSelect
                    label={t('shop.unit')}
                    value={unit}
                    placeholder="pcs"
                    options={UNITS.map((u) => ({ value: u, label: u }))}
                    onChange={setUnit}
                  />
                </View>
              </View>
              <Field
                label={t('shop.priceOptional')}
                value={price}
                onChangeText={setPrice}
                keyboardType="decimal-pad"
                placeholder="0.00"
              />
              <DateField
                label={t('shop.expiryOptional')}
                value={expiry}
                onChange={setExpiry}
                clearable
                placeholder={t('shop.selectExpiry')}
              />
              <PrimaryButton title={t('add.addItemBtn')} onPress={save} />
            </>
          )}
        </Card>

        <Field
          label={t('shop.search')}
          value={search}
          onChangeText={setSearch}
          placeholder={`🔍 ${t('shop.searchPlaceholder')}`}
        />

        {shoppingList.length === 0 ? (
          <EmptyState
            icon="📝"
            title={t('shop.emptyTitle')}
            subtitle={t('shop.emptySub')}
          />
        ) : list.length === 0 ? (
          <EmptyState icon="🔍" title={t('shop.noMatch')} />
        ) : (
          <>
            <View style={styles.bulkRow}>
              <Pressable onPress={toggleSelectAll} style={styles.bulkChip}>
                <Text style={styles.bulkChipText}>
                  {selectedIds.length === list.length ? t('shop.clearSelection') : t('shop.selectAll')}
                </Text>
              </Pressable>
              <Pressable onPress={bulkFinance} style={styles.bulkChip}>
                <Text style={styles.bulkChipText}>💰 {t('shop.toFinance')}</Text>
              </Pressable>
              <Pressable onPress={bulkGrocery} style={styles.bulkChip}>
                <Text style={styles.bulkChipText}>🥦 {t('shop.toGrocery')}</Text>
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
                        selected[item.id] && { backgroundColor: theme.accent, borderColor: theme.accent },
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
                        <Text style={{ color: theme.accent, fontWeight: '700', fontSize: 11 }}>
                          🔗 {t('shop.tracked')}
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
                      onChangeText={(v) => patchItem(item.id, { qty: v })}
                      placeholder={t('shop.qtyShort')}
                      placeholderTextColor={theme.muted}
                      style={[styles.miniInput, { color: theme.ink, borderColor: theme.line }]}
                    />
                    <DropdownSelect
                      value={item.unit || 'pcs'}
                      placeholder={t('shop.unitShort')}
                      options={UNITS.map((u) => ({ value: u, label: u }))}
                      onChange={(u) => patchItem(item.id, { unit: u })}
                    />
                    <TextInput
                      value={String(item.price ?? '')}
                      onChangeText={(v) => patchItem(item.id, { price: v })}
                      placeholder={t('shop.priceShort')}
                      keyboardType="decimal-pad"
                      placeholderTextColor={theme.muted}
                      style={[styles.miniInput, { color: theme.ink, borderColor: theme.line }]}
                    />
                  </View>

                  <DateField
                    label={t('shop.expiry')}
                    value={item.expiry || ''}
                    onChange={(d) => patchItem(item.id, { expiry: d })}
                    clearable
                    placeholder={t('shop.noExpiry')}
                  />

                  <View style={styles.actions}>
                    <Pressable
                      style={[styles.actBtn, item.linkedTransactionId && styles.actDone]}
                      onPress={() => void doReflectFinance(item)}
                    >
                      <Text style={styles.actText}>
                        {item.linkedTransactionId
                          ? `✓ 💰 ${t('shop.finance')}`
                          : `💰 ${t('shop.finance')}`}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.actBtn, item.linkedGroceryId && styles.actDone]}
                      onPress={() => void doReflectGrocery(item)}
                    >
                      <Text style={styles.actText}>
                        {item.linkedGroceryId
                          ? `✓ 🥦 ${t('shop.grocery')}`
                          : `🥦 ${t('shop.grocery')}`}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={styles.deleteBtn}
                      onPress={() => {
                        showAppDialog({
                          title: t('shop.deleteItem'),
                          message: t('shop.deleteMsg').replace('{name}', item.name),
                          icon: '🗑',
                          buttons: [
                            { text: t('common.cancel'), style: 'cancel' },
                            {
                              text: t('common.delete'),
                              style: 'destructive',
                              onPress: () =>
                                void setShoppingList(shoppingList.filter((x) => x.id !== item.id)),
                            },
                          ],
                        });
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
          {prompt?.type === 'price' ? t('shop.enterPrice') : t('shop.enterExpiry')}
        </Text>
        {prompt?.type === 'price' ? (
          <Field
            label={`${t('shop.priceTitle')} (${fmt(0, config.currency).replace(/[\d.,]+/g, '').trim() || '₹'})`}
            value={prompt.value}
            onChangeText={(v) => setPrompt({ ...prompt, value: v })}
            keyboardType="decimal-pad"
            placeholder="0.00"
          />
        ) : (
          <DateField
            label={t('reminders.expiryDate')}
            value={prompt?.value || todayStr()}
            onChange={(d) => prompt && setPrompt({ ...prompt, value: d })}
          />
        )}
        <PrimaryButton title={t('common.add')} onPress={submitPrompt} />
        <PrimaryButton
          title={t('common.cancel')}
          danger
          onPress={() => setPrompt(null)}
          style={{ marginTop: 8 }}
        />
      </BottomSheet>
    </Screen>
  );
}

function makeStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    h1: { fontSize: 24, fontWeight: '800', marginBottom: 4 },
    sub: { fontSize: 13, marginBottom: 14, lineHeight: 18 },
    row2: { flexDirection: 'row', alignItems: 'flex-start' },
    bulkRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    bulkChip: {
      backgroundColor: theme.accentSoft,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: theme.accent,
    },
    bulkChipText: { fontWeight: '800', color: theme.header, fontSize: 12 },
    itemTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
    check: {
      width: 26,
      height: 26,
      borderRadius: 6,
      borderWidth: 1.5,
      borderColor: theme.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    nameInput: { fontWeight: '800', fontSize: 16, padding: 0 },
    boughtBtn: {
      width: 28,
      height: 28,
      borderRadius: 6,
      borderWidth: 1.5,
      borderColor: theme.line,
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
      borderColor: theme.line,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 8,
      backgroundColor: theme.bg,
    },
    actDone: {
      backgroundColor: theme.accentSoft,
      borderColor: theme.accent,
    },
    actText: { fontWeight: '800', fontSize: 12, color: theme.ink },
    deleteBtn: {
      marginLeft: 'auto',
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
  });
}


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
  const [appName, setAppName] = useState(config.appName);
  const [importText, setImportText] = useState('');
  const [adEnabled, setAdEnabled] = useState(config.adBanner.enabled);
  const [adHoldSec, setAdHoldSec] = useState(String(config.adBanner.endCardHoldSec || 120));
  const [adItems, setAdItems] = useState<AdCreative[]>(
    config.adBanner.items?.length ? config.adBanner.items : [emptyAdCreative()],
  );
  const [adEditIndex, setAdEditIndex] = useState(0);
  const [adminSection, setAdminSection] = useState<
    'app' | 'colors' | 'ads' | 'features' | 'backup' | 'danger'
  >('app');
  const [colorFilter, setColorFilter] = useState<'free' | 'premium' | 'premiumPro'>('free');

  const adminNav: {
    id: typeof adminSection;
    label: string;
    icon: string;
  }[] = [
    { id: 'app', label: 'App name', icon: '✏️' },
    { id: 'colors', label: 'Colors', icon: '🎨' },
    { id: 'ads', label: 'Ads', icon: '📣' },
    { id: 'features', label: 'Features', icon: '⚙️' },
    { id: 'backup', label: 'Backup', icon: '💾' },
    { id: 'danger', label: 'Danger', icon: '⚠️' },
  ];

  const activeAd = adItems[Math.min(adEditIndex, Math.max(0, adItems.length - 1))] || emptyAdCreative();

  const patchActiveAd = (patch: Partial<AdCreative>) => {
    setAdItems((prev) => {
      if (!prev.length) return [emptyAdCreative(patch)];
      const idx = Math.min(adEditIndex, prev.length - 1);
      return prev.map((item, i) => (i === idx ? { ...item, ...patch } : item));
    });
  };

  const buildAdDraft = (enabled: boolean): AdBannerConfig => {
    const hold = Math.max(5, Math.min(3600, parseInt(adHoldSec, 10) || 120));
    return {
      enabled,
      endCardHoldSec: hold,
      items: adItems.map((item) => ({
        ...item,
        title: item.title.trim() || 'Your ad goes here',
        subtitle: item.subtitle.trim() || 'Promote a partner app or offer.',
        icon: item.icon.trim() || '📣',
        buttonLabel: item.buttonLabel.trim() || 'Open',
        buttonUrl: item.buttonUrl.trim() || 'https://example.com',
        appScheme: (item.appScheme || '').trim(),
        mediaUri: item.mediaUri,
        mediaType: item.mediaUri ? item.mediaType : null,
        endImageUri: item.endImageUri,
      })),
    };
  };

  React.useEffect(() => {
    setAppName(config.appName);
    setAdEnabled(config.adBanner.enabled);
    setAdHoldSec(String(config.adBanner.endCardHoldSec || 120));
    setAdItems(config.adBanner.items?.length ? config.adBanner.items : [emptyAdCreative()]);
    setAdEditIndex(0);
  }, [config]);

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

  const notifySaved = (message: string) => {
    showAppInfo('Saved', message, '✅');
  };

  const toggleFeature = (key: keyof typeof config.features) => {
    const nextOn = !config.features[key];
    const labels: Partial<Record<keyof typeof config.features, string>> = {
      finance: 'Finance tracker',
      reminders: 'Reminders hub',
      expenseReminder: 'Expense reminders',
      medicineReminder: 'Medicine reminders',
      groceryExpiryReminder: 'Grocery expiry',
      generalReminder: 'General reminders',
      shoppingList: 'Shopping list',
      financeCharts: 'Finance charts',
      financeReports: 'Finance reports',
      financeAccounts: 'Accounts',
    };
    void updateConfig({
      features: {
        ...config.features,
        [key]: nextOn,
      },
    }).then((ok) => {
      if (!ok) return;
      notifySaved(
        `${labels[key] || String(key)} turned ${nextOn ? 'on' : 'off'}.`,
      );
    });
  };

  const sectionTitle = adminNav.find((n) => n.id === adminSection)?.label || 'Admin';

  return (
    <Screen>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 40, paddingTop: 8 }}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 8,
            paddingHorizontal: 14,
            paddingBottom: 10,
          }}
        >
          {adminNav.map((item) => {
            const on = adminSection === item.id;
            const danger = item.id === 'danger';
            // Always use a dark selected chip so labels stay readable on light accents (mint/gold/ice).
            const selectedBg = danger ? 'rgba(214,69,69,0.14)' : theme.header;
            const selectedFg = danger ? theme.red : '#fff';
            return (
              <Pressable
                key={item.id}
                onPress={() => setAdminSection(item.id)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 12,
                  backgroundColor: on ? selectedBg : theme.card,
                  borderWidth: 1.5,
                  borderColor: on ? (danger ? theme.red : theme.header) : theme.line,
                }}
              >
                <Text style={{ fontSize: 14 }}>{item.icon}</Text>
                <Text
                  style={{
                    color: on ? selectedFg : theme.ink,
                    fontWeight: '800',
                    fontSize: 13,
                  }}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={{ paddingHorizontal: 14 }}>
          <Text style={{ color: theme.ink, fontWeight: '900', fontSize: 18, marginBottom: 12 }}>
            {sectionTitle}
          </Text>

          {adminSection === 'app' ? (
            <Card>
              <Field label="App name" value={appName} onChangeText={setAppName} />
              <PrimaryButton
                title="Save app name"
                onPress={() => {
                  const next = appName.trim() || 'Pulse Wallet';
                  void updateConfig({ appName: next }).then((ok) => {
                    if (!ok) return;
                    setAppName(next);
                    showAppInfo('Saved', `App name updated to “${next}”.`, '✅');
                  });
                }}
              />
            </Card>
          ) : null}

          {adminSection === 'colors' ? (
            <Card>
              <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 18, marginBottom: 12 }}>
                Free = Pulse Teal. Premium = dual-tone live packs (Aurora, Sunset, Obsidian, Royal,
                Velvet). Premium Pro = coming later.
              </Text>

              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                {(
                  [
                    ['free', 'Free'],
                    ['premium', 'Premium'],
                    ['premiumPro', 'Premium Pro'],
                  ] as const
                ).map(([id, label]) => {
                  const on = colorFilter === id;
                  return (
                    <Pressable
                      key={id}
                      onPress={() => setColorFilter(id)}
                      style={{
                        flex: 1,
                        paddingVertical: 10,
                        borderRadius: 12,
                        alignItems: 'center',
                        backgroundColor: on ? theme.header : theme.bg,
                        borderWidth: 1.5,
                        borderColor: on ? theme.header : theme.line,
                      }}
                    >
                      <Text
                        style={{
                          fontWeight: '800',
                          fontSize: 12,
                          color: on ? '#fff' : theme.ink,
                        }}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {colorFilter === 'premium' ? (
                <Pressable
                  onPress={() => {
                    const next = !config.themeCatalog.unlockAllPremium;
                    void updateConfig({
                      themeCatalog: {
                        ...config.themeCatalog,
                        unlockAllPremium: next,
                      },
                    }).then((ok) => {
                      if (!ok) return;
                      notifySaved(
                        next
                          ? 'Premium colors unlocked for everyone.'
                          : 'Premium colors limited to Premium Members.',
                      );
                    });
                  }}
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingVertical: 12,
                    marginBottom: 12,
                    borderBottomWidth: 1,
                    borderBottomColor: theme.line,
                  }}
                >
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={{ color: theme.ink, fontWeight: '700' }}>
                      Unlock Premium for all
                    </Text>
                    <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>
                      {config.themeCatalog.unlockAllPremium
                        ? 'Everyone can use Premium colors right now'
                        : 'Only Premium Members see these colors'}
                    </Text>
                  </View>
                  <View
                    style={{
                      width: 44,
                      height: 25,
                      borderRadius: 20,
                      backgroundColor: config.themeCatalog.unlockAllPremium
                        ? theme.primary
                        : '#e2e2e5',
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
                        alignSelf: config.themeCatalog.unlockAllPremium
                          ? 'flex-end'
                          : 'flex-start',
                      }}
                    />
                  </View>
                </Pressable>
              ) : null}

              {colorFilter === 'premiumPro' &&
              themesForAccess(config.themeCatalog, 'premiumPro').length === 0 ? (
                <View
                  style={{
                    padding: 16,
                    borderRadius: 14,
                    borderWidth: 1.5,
                    borderColor: theme.line,
                    backgroundColor: theme.bg,
                    marginBottom: 8,
                  }}
                >
                  <Text style={{ color: theme.ink, fontWeight: '800', marginBottom: 6 }}>
                    Premium Pro — empty for now
                  </Text>
                  <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 18 }}>
                    Tell me which Pro colors to add later. You can still move any color into this
                    tier with the buttons below once colors exist.
                  </Text>
                </View>
              ) : null}

              {themesForAccess(config.themeCatalog, colorFilter).map((key) => {
                const t = THEMES[key];
                const access = themeAccessFor(key, config.themeCatalog);
                const selected = config.theme === key;
                const setAccess = (next: ThemeAccess) => {
                  if (access === next) return;
                  void updateConfig({
                    themeCatalog: {
                      ...config.themeCatalog,
                      access: { ...config.themeCatalog.access, [key]: next },
                    },
                  }).then((ok) => {
                    if (!ok) return;
                    const tier =
                      next === 'free'
                        ? 'Free'
                        : next === 'premium'
                          ? 'Premium'
                          : next === 'premiumPro'
                            ? 'Premium Pro'
                            : 'Hidden';
                    notifySaved(`${t.label} set to ${tier}.`);
                  });
                };
                return (
                  <View
                    key={key}
                    style={{
                      borderWidth: 1.5,
                      borderColor: selected ? theme.primary : theme.line,
                      borderRadius: 14,
                      padding: 12,
                      marginBottom: 10,
                      backgroundColor: theme.card,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 10,
                        marginBottom: 10,
                      }}
                    >
                      <View
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 10,
                          backgroundColor: t.primary,
                          borderWidth: 2,
                          borderColor: t.primaryDark,
                        }}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.ink, fontWeight: '800' }}>{t.label}</Text>
                        <Text style={{ color: theme.muted, fontSize: 12 }}>
                          {selected ? 'Active color' : t.primary}
                        </Text>
                      </View>
                      {!selected ? (
                        <Pressable
                          onPress={() => {
                            void updateConfig({ theme: key }).then((ok) => {
                              if (!ok) return;
                              notifySaved(`${t.label} is now the active color.`);
                            });
                          }}
                        >
                          <Text style={{ color: theme.primary, fontWeight: '800', fontSize: 12 }}>
                            Set active
                          </Text>
                        </Pressable>
                      ) : (
                        <Text style={{ color: theme.primary, fontWeight: '900' }}>✓</Text>
                      )}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {(
                        [
                          ['free', 'Free'],
                          ['premium', 'Premium'],
                          ['premiumPro', 'Pro'],
                          ['hidden', 'Hide'],
                        ] as const
                      ).map(([opt, label]) => {
                        const on = access === opt;
                        return (
                          <Pressable
                            key={opt}
                            onPress={() => setAccess(opt)}
                            style={{
                              flex: 1,
                              paddingVertical: 8,
                              borderRadius: 10,
                              alignItems: 'center',
                              backgroundColor: on ? theme.header : theme.bg,
                              borderWidth: 1.5,
                              borderColor: on ? theme.header : theme.line,
                            }}
                          >
                            <Text
                              style={{
                                fontWeight: '800',
                                fontSize: 10,
                                color: on ? '#fff' : theme.ink,
                              }}
                            >
                              {label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
            </Card>
          ) : null}

          {adminSection === 'ads' ? (
            <Card>
          <Text style={{ color: theme.ink, fontWeight: '800', fontSize: 16, marginBottom: 8 }}>
            Profile ad banner
          </Text>
          <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 18, marginBottom: 12 }}>
            Multiple ads play one after another on Profile: video → end card → wait → next ad
            (loops). Only admins can edit this.
          </Text>

          <Pressable
            onPress={() => {
              const next = !adEnabled;
              setAdEnabled(next);
              void updateConfig({ adBanner: buildAdDraft(next) }).then((ok) => {
                if (!ok) {
                  setAdEnabled(!next);
                  return;
                }
                notifySaved(next ? 'Profile ad banner turned on.' : 'Profile ad banner turned off.');
              });
            }}
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingVertical: 12,
              marginBottom: 8,
              borderBottomWidth: 1,
              borderBottomColor: theme.line,
            }}
          >
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={{ color: theme.ink, fontWeight: '700' }}>Show banner</Text>
              <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>
                {adEnabled ? 'Visible on Profile' : 'Hidden on Profile'}
              </Text>
            </View>
            <View
              style={{
                width: 44,
                height: 25,
                borderRadius: 20,
                backgroundColor: adEnabled ? theme.primary : '#e2e2e5',
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
                  alignSelf: adEnabled ? 'flex-end' : 'flex-start',
                }}
              />
            </View>
          </Pressable>

          <Field
            label="Seconds between ads (after end card)"
            value={adHoldSec}
            onChangeText={setAdHoldSec}
            keyboardType="number-pad"
          />
          <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 17, marginBottom: 12 }}>
            Default 120 (2 minutes). After an end card shows, the next ad starts after this delay.
          </Text>

          <Text style={{ color: theme.ink, fontWeight: '700', marginBottom: 8 }}>Playlist</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            {adItems.map((item, i) => (
              <Pressable
                key={item.id}
                onPress={() => setAdEditIndex(i)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 10,
                  borderWidth: 1.5,
                  borderColor: adEditIndex === i ? theme.primary : theme.line,
                  backgroundColor: adEditIndex === i ? theme.primary : theme.card,
                }}
              >
                <Text
                  style={{
                    fontWeight: '700',
                    color: adEditIndex === i ? '#fff' : theme.ink,
                    fontSize: 13,
                  }}
                >
                  Ad {i + 1}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
            <View style={{ flex: 1 }}>
              <PrimaryButton
                title="Add ad"
                onPress={() => {
                  const next = emptyAdCreative({ title: `Ad ${adItems.length + 1}` });
                  setAdItems((prev) => [...prev, next]);
                  setAdEditIndex(adItems.length);
                }}
              />
            </View>
            {adItems.length > 1 ? (
              <View style={{ flex: 1 }}>
                <PrimaryButton
                  title="Delete this ad"
                  danger
                  onPress={() => {
                    const removing = activeAd;
                    showAppDialog({
                      title: 'Delete ad',
                      message: `Remove “${removing.title || 'this ad'}” from the playlist?`,
                      icon: '🗑',
                      buttons: [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Delete',
                          style: 'destructive',
                          onPress: () => {
                            if (removing.mediaUri) void clearPersistedAdMedia(removing.mediaUri);
                            if (removing.endImageUri) {
                              void clearPersistedAdMedia(removing.endImageUri);
                            }
                            setAdItems((prev) => {
                              const next = prev.filter((_, i) => i !== adEditIndex);
                              return next.length ? next : [emptyAdCreative()];
                            });
                            setAdEditIndex((i) => Math.max(0, i - 1));
                          },
                        },
                      ],
                    });
                  }}
                />
              </View>
            ) : null}
          </View>

          <Text style={{ color: theme.muted, fontSize: 12, fontWeight: '800', marginBottom: 8 }}>
            EDITING AD {Math.min(adEditIndex, adItems.length - 1) + 1} OF {adItems.length}
          </Text>

          <Field
            label="Icon (emoji)"
            value={activeAd.icon}
            onChangeText={(v) => patchActiveAd({ icon: v })}
          />
          <Field
            label="Title"
            value={activeAd.title}
            onChangeText={(v) => patchActiveAd({ title: v })}
          />
          <Field
            label="Subtitle (shown if app not installed)"
            value={activeAd.subtitle}
            onChangeText={(v) => patchActiveAd({ subtitle: v })}
            multiline
            style={{ minHeight: 64, textAlignVertical: 'top' }}
          />
          <Field
            label="Button label (fallback)"
            value={activeAd.buttonLabel}
            onChangeText={(v) => patchActiveAd({ buttonLabel: v })}
          />
          <Field
            label="Store / web URL (Install)"
            value={activeAd.buttonUrl}
            onChangeText={(v) => patchActiveAd({ buttonUrl: v })}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <Field
            label="App scheme (optional, e.g. myapp://)"
            value={activeAd.appScheme || ''}
            onChangeText={(v) => patchActiveAd({ appScheme: v })}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 17, marginBottom: 10 }}>
            Leave blank to always use the button label. If the scheme opens on the device, Profile
            shows “Installed” + Open; otherwise Install uses the store URL.
          </Text>

          <Text style={{ color: theme.ink, fontWeight: '700', marginBottom: 8, marginTop: 4 }}>
            1) Intro video (muted by default)
          </Text>
          <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 17, marginBottom: 10 }}>
            Plays first with sound off (user can unmute). When it ends, the end-card image appears.
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
            <View style={{ flex: 1 }}>
              <PrimaryButton
                title={
                  activeAd.mediaType === 'video' && activeAd.mediaUri
                    ? 'Change video'
                    : 'Upload video'
                }
                onPress={() => {
                  void pickAdBannerVideo().then((picked) => {
                    if (!picked) return;
                    const prev =
                      activeAd.mediaType === 'video' ? activeAd.mediaUri : null;
                    patchActiveAd({ mediaUri: picked.uri, mediaType: 'video' });
                    if (prev && prev !== picked.uri) void clearPersistedAdMedia(prev);
                  });
                }}
              />
            </View>
            {activeAd.mediaType === 'video' && activeAd.mediaUri ? (
              <View style={{ flex: 1 }}>
                <PrimaryButton
                  title="Remove video"
                  danger
                  onPress={() => {
                    const prev = activeAd.mediaUri;
                    patchActiveAd({ mediaUri: null, mediaType: null });
                    if (prev) void clearPersistedAdMedia(prev);
                  }}
                />
              </View>
            ) : null}
          </View>
          {activeAd.mediaType === 'video' && activeAd.mediaUri ? (
            <Text style={{ color: theme.muted, fontSize: 12, marginBottom: 10 }}>Video selected</Text>
          ) : null}

          <Text style={{ color: theme.ink, fontWeight: '700', marginBottom: 8, marginTop: 4 }}>
            2) End-card image (after video)
          </Text>
          <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 17, marginBottom: 10 }}>
            Shown when the video finishes (or immediately if you skip video). Includes Open /
            Install.
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
            <View style={{ flex: 1 }}>
              <PrimaryButton
                title={activeAd.endImageUri ? 'Change end image' : 'Upload end image'}
                onPress={() => {
                  void pickAdBannerImage().then((picked) => {
                    if (!picked) return;
                    const prev = activeAd.endImageUri;
                    patchActiveAd({ endImageUri: picked.uri });
                    if (prev && prev !== picked.uri) void clearPersistedAdMedia(prev);
                  });
                }}
              />
            </View>
            {activeAd.endImageUri ? (
              <View style={{ flex: 1 }}>
                <PrimaryButton
                  title="Remove end image"
                  danger
                  onPress={() => {
                    const prev = activeAd.endImageUri;
                    patchActiveAd({ endImageUri: null });
                    if (prev) void clearPersistedAdMedia(prev);
                  }}
                />
              </View>
            ) : null}
          </View>
          {activeAd.endImageUri ? (
            <Text style={{ color: theme.muted, fontSize: 12, marginBottom: 10 }}>
              End-card image selected
            </Text>
          ) : null}

          <PrimaryButton
            title="Save & show on Profile"
            onPress={() => {
              const draft = buildAdDraft(true);
              for (const item of draft.items) {
                const url = item.buttonUrl.trim();
                if (url && !/^https?:\/\//i.test(url)) {
                  Alert.alert(
                    'Invalid URL',
                    `“${item.title}”: store / web URL must start with http:// or https://`,
                  );
                  return;
                }
              }
              const missingEnd = draft.items.find(
                (item) => item.mediaType === 'video' && item.mediaUri && !item.endImageUri,
              );
              if (missingEnd) {
                Alert.alert(
                  'End-card image recommended',
                  `“${missingEnd.title}” has a video but no end-card image. Save anyway?`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Save anyway',
                      onPress: () => {
                        setAdEnabled(true);
                        void updateConfig({ adBanner: draft }).then((ok) => {
                          if (ok) {
                            showAppInfo(
                              'Saved',
                              `${draft.items.length} ad(s) on. After each end card, the next starts in ${draft.endCardHoldSec}s.`,
                              '✅',
                            );
                          }
                        });
                      },
                    },
                  ],
                );
                return;
              }
              setAdEnabled(true);
              void updateConfig({ adBanner: draft }).then((ok) => {
                if (!ok) return;
                showAppInfo(
                  'Saved',
                  `${draft.items.length} ad(s) on. Profile plays each video → end card → waits ${draft.endCardHoldSec}s → next ad.`,
                  '✅',
                );
              });
            }}
          />

          <View style={{ marginTop: 14 }}>
            <Text style={{ color: theme.muted, fontSize: 11, fontWeight: '800', marginBottom: 8 }}>
              PREVIEW (current ad only — rotation runs on Profile)
            </Text>
            <ProfileAdBanner
              config={buildAdDraft(adEnabled)}
              previewIndex={Math.min(adEditIndex, Math.max(0, adItems.length - 1))}
              preview
            />
            {!adEnabled ? (
              <Text style={{ color: theme.muted, fontSize: 12, marginTop: 10, lineHeight: 17 }}>
                Banner is currently hidden. Tap “Save & show on Profile” or turn on Show banner.
              </Text>
            ) : null}
          </View>
        </Card>
          ) : null}

          {adminSection === 'features' ? (
        <Card>
          <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 18, marginBottom: 10 }}>
            Turn app modules on or off for everyone.
          </Text>
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
          ) : null}

          {adminSection === 'backup' ? (
        <Card>
          <PrimaryButton
            title="Export / Share backup JSON"
            onPress={async () => {
              await Share.share({ message: exportBackup(), title: 'Pulse Wallet Backup' });
              notifySaved('Backup JSON is ready to share.');
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
              if (ok) {
                setImportText('');
                showAppInfo('Imported', 'Backup imported successfully.', '✅');
              } else {
                showAppInfo('Import failed', 'Invalid backup file.', '⚠️');
              }
            }}
          />
        </Card>
          ) : null}

          {adminSection === 'danger' ? (
        <Card style={{ borderColor: theme.red, borderWidth: 1.5 }}>
          <Text style={{ color: theme.red, fontWeight: '800', marginBottom: 8 }}>Danger zone</Text>
          <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 18, marginBottom: 12 }}>
            Irreversible actions. Use with care.
          </Text>
          <PrimaryButton
            title="Delete all data"
            danger
            onPress={() =>
              showAppDialog({
                title: 'Delete everything?',
                message: 'This will clear all local app data and cannot be undone.',
                icon: '⚠️',
                buttons: [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => {
                      void resetAll().then(() => {
                        showAppInfo('Deleted', 'All local app data has been cleared.', '🗑');
                      });
                    },
                  },
                ],
              })
            }
          />
        </Card>
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  );
}
