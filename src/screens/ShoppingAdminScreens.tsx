import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { useApp } from '../context/AppContext';
import { useFinance } from '../FinanceContext';
import { CURRENCIES, THEMES } from '../constants';
import { ThemeKey } from '../types';
import { Card, EmptyState, Field, PrimaryButton, Screen } from '../components/ui';
import { uid } from '../utils';
import { openAuthModal } from '../authGate';

export function ShoppingListScreen() {
  const { theme, shoppingList, setShoppingList } = useApp();
  const [name, setName] = useState('');
  const [qty, setQty] = useState('1');
  const [store, setStore] = useState('');

  const save = async () => {
    if (!name.trim()) return Alert.alert('Item name required');
    await setShoppingList([
      {
        id: uid(),
        name: name.trim(),
        qty,
        unit: '',
        price: '',
        store,
        bought: false,
      },
      ...shoppingList,
    ]);
    setName('');
    setQty('1');
    setStore('');
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Card>
          <Field label="Item" value={name} onChangeText={setName} placeholder="e.g. Rice bag" />
          <Field label="Qty" value={qty} onChangeText={setQty} />
          <Field label="Store" value={store} onChangeText={setStore} placeholder="Optional" />
          <PrimaryButton title="+ Add to list" onPress={save} />
        </Card>

        {shoppingList.length === 0 ? (
          <EmptyState icon="🛒" title="Shopping list is empty" />
        ) : (
          shoppingList.map((item) => (
            <Card key={item.id} style={{ opacity: item.bought ? 0.7 : 1 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: theme.ink,
                      fontWeight: '800',
                      textDecorationLine: item.bought ? 'line-through' : 'none',
                    }}
                  >
                    {item.name}
                  </Text>
                  <Text style={{ color: theme.muted }}>
                    Qty {item.qty}
                    {item.store ? ` · ${item.store}` : ''}
                  </Text>
                </View>
                <Pressable
                  onPress={() =>
                    setShoppingList(
                      shoppingList.map((x) => (x.id === item.id ? { ...x, bought: !x.bought } : x)),
                    )
                  }
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    borderWidth: 1.5,
                    borderColor: item.bought ? theme.green : theme.line,
                    backgroundColor: item.bought ? theme.green : theme.card,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 8,
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '800' }}>{item.bought ? '✓' : ''}</Text>
                </Pressable>
                <PrimaryButton
                  title="✕"
                  danger
                  onPress={() => setShoppingList(shoppingList.filter((x) => x.id !== item.id))}
                />
              </View>
            </Card>
          ))
        )}
      </ScrollView>
    </Screen>
  );
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
                  onPress: async () => {
                    await resetAll();
                    Alert.alert('All data deleted');
                  },
                },
              ])
            }
          />
        </Card>
      </ScrollView>
    </Screen>
  );
}
