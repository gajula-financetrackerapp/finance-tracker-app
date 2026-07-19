/**
 * AccountsScreen — Manage financial accounts.
 *
 * Features
 * ────────
 * • Total balance header across all accounts
 * • 2-column card grid: icon, name, type, balance
 * • FAB → Add account modal
 * • Tap an account card → Edit / Delete options (Alert)
 * • Edit modal pre-filled with existing account data
 * • Delete with confirmation; warns if transactions exist for that account
 * • Empty state when no accounts
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
  ScrollView,
  KeyboardAvoidingView,
  SafeAreaView,
  StatusBar,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../../state/AppContext';
import { getTheme } from '../../constants/colors';
import { CURRENCIES, ACCOUNT_ICONS } from '../../constants/categories';

const { width: SCREEN_W } = Dimensions.get('window');

const ACCOUNT_TYPES = [
  { id: 'cash', label: 'Cash', icon: 'cash' },
  { id: 'bank', label: 'Bank', icon: 'business' },
  { id: 'card', label: 'Card', icon: 'card' },
  { id: 'savings', label: 'Savings', icon: 'save' },
  { id: 'investment', label: 'Investment', icon: 'trending-up' },
  { id: 'crypto', label: 'Crypto', icon: 'logo-bitcoin' },
  { id: 'loan', label: 'Loan', icon: 'git-compare' },
  { id: 'other', label: 'Other', icon: 'wallet' },
];

const TYPE_COLORS = {
  cash: '#2E9E5B',
  bank: '#3B82F6',
  card: '#8B5CF6',
  savings: '#0EA5E9',
  investment: '#F59E0B',
  crypto: '#F97316',
  loan: '#EF4444',
  other: '#78716C',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getCurrencySymbol(code) {
  return CURRENCIES.find(c => c.code === code)?.symbol ?? '$';
}

function fmtMoney(amount, symbol) {
  const neg = amount < 0;
  const str = Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${neg ? '-' : ''}${symbol}${str}`;
}

function getTypeColor(typeId) {
  return TYPE_COLORS[typeId] ?? '#94A3B8';
}

// ─── AccountModal ─────────────────────────────────────────────────────────────

function AccountModal({ visible, onClose, onSave, initial, defaultCurrency, theme }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('bank');
  const [currency, setCurrency] = useState(defaultCurrency ?? 'USD');
  const [balance, setBalance] = useState('');
  const [icon, setIcon] = useState('business');
  const [saving, setSaving] = useState(false);
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);

  useEffect(() => {
    if (visible) {
      setName(initial?.name ?? '');
      setType(initial?.type ?? 'bank');
      setCurrency(initial?.currency ?? defaultCurrency ?? 'USD');
      setBalance(initial?.balance != null ? String(initial.balance) : '');
      setIcon(initial?.icon ?? 'business');
      setSaving(false);
      setShowCurrencyPicker(false);
    }
  }, [visible, initial]);

  // Auto-suggest icon when type changes (only if not editing)
  useEffect(() => {
    if (!initial) {
      const t = ACCOUNT_TYPES.find(at => at.id === type);
      if (t) setIcon(t.icon);
    }
  }, [type]);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Missing name', 'Please enter an account name.');
      return;
    }
    const parsed = parseFloat(balance);
    if (balance && (isNaN(parsed))) {
      Alert.alert('Invalid balance', 'Please enter a valid number for the balance.');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        type,
        currency,
        balance: balance ? parsed : 0,
        icon,
      });
    } finally {
      setSaving(false);
    }
  };

  const selectedCurrency = CURRENCIES.find(c => c.code === currency);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: theme.overlay }}
          activeOpacity={1}
          onPress={onClose}
        />
        <View
          style={{
            backgroundColor: theme.card,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            maxHeight: '88%',
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 20,
              borderBottomWidth: 1,
              borderBottomColor: theme.line,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: '700', color: theme.ink }}>
              {initial ? 'Edit Account' : 'New Account'}
            </Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
            >
              <Ionicons name="close" size={24} color={theme.muted} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={{ padding: 20 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Preview card */}
            <View
              style={{
                borderRadius: 18,
                padding: 18,
                backgroundColor: getTypeColor(type),
                marginBottom: 22,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
              }}
            >
              <View
                style={{
                  width: 50,
                  height: 50,
                  borderRadius: 16,
                  backgroundColor: 'rgba(255,255,255,0.25)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name={icon} size={24} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#fff', opacity: 0.8, fontSize: 12, fontWeight: '500' }}>
                  {ACCOUNT_TYPES.find(t => t.id === type)?.label ?? 'Account'}
                </Text>
                <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700', marginTop: 2 }}>
                  {name || 'Account Name'}
                </Text>
              </View>
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>
                {selectedCurrency?.symbol ?? '$'}{balance ? parseFloat(balance || '0').toLocaleString() : '0'}
              </Text>
            </View>

            {/* Name */}
            <Text style={[mStyles.label, { color: theme.muted }]}>ACCOUNT NAME</Text>
            <TextInput
              style={[mStyles.input, { backgroundColor: theme.inputBg, color: theme.inputText }]}
              placeholder="e.g. Main Checking"
              placeholderTextColor={theme.placeholderText}
              value={name}
              onChangeText={setName}
              returnKeyType="next"
            />

            {/* Type */}
            <Text style={[mStyles.label, { color: theme.muted }]}>ACCOUNT TYPE</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
              {ACCOUNT_TYPES.map(at => {
                const sel = type === at.id;
                return (
                  <TouchableOpacity
                    key={at.id}
                    onPress={() => setType(at.id)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 20,
                      backgroundColor: sel ? getTypeColor(at.id) : theme.inputBg,
                      borderWidth: 1.5,
                      borderColor: sel ? getTypeColor(at.id) : theme.line,
                    }}
                  >
                    <Ionicons name={at.icon} size={14} color={sel ? '#fff' : getTypeColor(at.id)} />
                    <Text style={{ fontSize: 13, color: sel ? '#fff' : theme.ink }}>{at.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Initial balance */}
            <Text style={[mStyles.label, { color: theme.muted }]}>
              {initial ? 'CURRENT BALANCE' : 'INITIAL BALANCE'}
            </Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: theme.inputBg,
                borderRadius: 12,
                paddingHorizontal: 14,
                marginBottom: 18,
              }}
            >
              <Text style={{ fontSize: 18, color: theme.muted, marginRight: 4 }}>
                {selectedCurrency?.symbol ?? '$'}
              </Text>
              <TextInput
                style={{
                  flex: 1,
                  fontSize: 22,
                  fontWeight: '700',
                  color: theme.inputText,
                  paddingVertical: 14,
                }}
                placeholder="0.00"
                placeholderTextColor={theme.placeholderText}
                keyboardType="decimal-pad"
                value={balance}
                onChangeText={setBalance}
              />
            </View>

            {/* Currency */}
            <Text style={[mStyles.label, { color: theme.muted }]}>CURRENCY</Text>
            <TouchableOpacity
              onPress={() => setShowCurrencyPicker(v => !v)}
              style={[
                mStyles.input,
                {
                  backgroundColor: theme.inputBg,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                },
              ]}
            >
              <Text style={{ color: theme.inputText, fontSize: 14 }}>
                {selectedCurrency
                  ? `${selectedCurrency.flag} ${selectedCurrency.code} — ${selectedCurrency.label}`
                  : currency}
              </Text>
              <Ionicons
                name={showCurrencyPicker ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={theme.muted}
              />
            </TouchableOpacity>

            {showCurrencyPicker && (
              <View
                style={{
                  backgroundColor: theme.inputBg,
                  borderRadius: 12,
                  marginBottom: 16,
                  maxHeight: 180,
                  overflow: 'hidden',
                }}
              >
                <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                  {CURRENCIES.map(c => (
                    <TouchableOpacity
                      key={c.code}
                      onPress={() => { setCurrency(c.code); setShowCurrencyPicker(false); }}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 10,
                        paddingHorizontal: 16,
                        paddingVertical: 12,
                        borderBottomWidth: 1,
                        borderBottomColor: theme.line,
                        backgroundColor: currency === c.code ? theme.primaryLight : 'transparent',
                      }}
                    >
                      <Text style={{ fontSize: 16 }}>{c.flag}</Text>
                      <Text style={{ color: theme.ink, fontSize: 14, fontWeight: '500' }}>
                        {c.code}
                      </Text>
                      <Text style={{ color: theme.muted, fontSize: 13, flex: 1 }}>{c.label}</Text>
                      <Text style={{ color: theme.muted, fontSize: 13 }}>{c.symbol}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Icon picker */}
            <Text style={[mStyles.label, { color: theme.muted }]}>ICON</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 22 }}>
              {ACCOUNT_ICONS.map(ai => {
                const sel = icon === ai.icon;
                return (
                  <TouchableOpacity
                    key={ai.id}
                    onPress={() => setIcon(ai.icon)}
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: 14,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: sel ? getTypeColor(type) : theme.inputBg,
                      borderWidth: 1.5,
                      borderColor: sel ? getTypeColor(type) : theme.line,
                    }}
                  >
                    <Ionicons
                      name={ai.icon}
                      size={22}
                      color={sel ? '#fff' : theme.muted}
                    />
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Save */}
            <TouchableOpacity
              onPress={handleSave}
              disabled={saving}
              style={{
                backgroundColor: theme.primary,
                borderRadius: 14,
                padding: 16,
                alignItems: 'center',
                marginBottom: 30,
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? (
                <ActivityIndicator color={theme.buttonText} />
              ) : (
                <Text style={{ color: theme.buttonText, fontWeight: '700', fontSize: 16 }}>
                  {initial ? 'Update Account' : 'Add Account'}
                </Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const mStyles = StyleSheet.create({
  label: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    letterSpacing: 0.4,
  },
  input: {
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    marginBottom: 18,
  },
});

// ─── AccountsScreen ───────────────────────────────────────────────────────────

export default function AccountsScreen({ navigation }) {
  const {
    config,
    accounts,
    transactions,
    totalBalance,
    loading,
    addAccount,
    editAccount,
    removeAccount,
  } = useAppContext();

  const theme = getTheme(config.theme);
  const globalSymbol = getCurrencySymbol(config.currency);

  const [showModal, setShowModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);

  const openAdd = () => { setEditingAccount(null); setShowModal(true); };
  const openEdit = (acc) => { setEditingAccount(acc); setShowModal(true); };

  // Count transactions per account
  const txCountByAccount = useMemo(() => {
    const map = {};
    transactions.forEach(t => {
      if (t.account_id) map[t.account_id] = (map[t.account_id] ?? 0) + 1;
    });
    return map;
  }, [transactions]);

  // ── CRUD ─────────────────────────────────────────────────────────────────
  const handleSave = useCallback(
    async (data) => {
      const result = editingAccount
        ? await editAccount(editingAccount.id, data)
        : await addAccount(data);
      if (result?.error) {
        Alert.alert('Error', result.error.message ?? 'Failed to save account.');
        return;
      }
      setShowModal(false);
    },
    [editingAccount, addAccount, editAccount]
  );

  const handleDelete = useCallback(
    (acc) => {
      const txCount = txCountByAccount[acc.id] ?? 0;
      const warningMsg =
        txCount > 0
          ? `This account has ${txCount} transaction${txCount !== 1 ? 's' : ''}. Deleting it will not remove those transactions but they will lose their account reference. Continue?`
          : 'Are you sure you want to delete this account?';

      Alert.alert('Delete Account', warningMsg, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error } = await removeAccount(acc.id);
            if (error) Alert.alert('Error', error.message ?? 'Failed to delete account.');
          },
        },
      ]);
    },
    [removeAccount, txCountByAccount]
  );

  const handleCardPress = (acc) => {
    Alert.alert(acc.name, `${acc.type ?? ''} · ${getCurrencySymbol(acc.currency ?? config.currency)}${(acc.balance ?? 0).toLocaleString()}`, [
      { text: 'Edit', onPress: () => openEdit(acc) },
      { text: 'Delete', style: 'destructive', onPress: () => handleDelete(acc) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // ── Render item ───────────────────────────────────────────────────────────
  const renderAccount = ({ item: acc }) => {
    const sym = getCurrencySymbol(acc.currency ?? config.currency);
    const color = getTypeColor(acc.type ?? 'other');
    const txCount = txCountByAccount[acc.id] ?? 0;
    const accType = ACCOUNT_TYPES.find(t => t.id === acc.type);

    return (
      <TouchableOpacity
        onPress={() => handleCardPress(acc)}
        activeOpacity={0.8}
        style={[styles.accountCard, { backgroundColor: color }]}
      >
        {/* Icon */}
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            backgroundColor: 'rgba(255,255,255,0.22)',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 10,
          }}
        >
          <Ionicons name={acc.icon ?? accType?.icon ?? 'wallet'} size={22} color="#fff" />
        </View>

        {/* Name */}
        <Text
          style={{ color: '#fff', fontWeight: '700', fontSize: 14, marginBottom: 2 }}
          numberOfLines={1}
        >
          {acc.name}
        </Text>

        {/* Type */}
        <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11, marginBottom: 10 }}>
          {accType?.label ?? acc.type ?? 'Account'}
          {txCount > 0 ? `  ·  ${txCount} txn${txCount !== 1 ? 's' : ''}` : ''}
        </Text>

        {/* Balance */}
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 18 }}>
          {fmtMoney(acc.balance ?? 0, sym)}
        </Text>

        {/* Edit button */}
        <TouchableOpacity
          onPress={() => openEdit(acc)}
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            width: 28,
            height: 28,
            borderRadius: 8,
            backgroundColor: 'rgba(255,255,255,0.2)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          hitSlop={{ top: 5, right: 5, bottom: 5, left: 5 }}
        >
          <Ionicons name="pencil" size={13} color="#fff" />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyState}>
      <Ionicons name="wallet-outline" size={64} color={theme.line} />
      <Text style={[styles.emptyTitle, { color: theme.ink }]}>No accounts yet</Text>
      <Text style={[styles.emptySubtitle, { color: theme.muted }]}>
        Tap + to add your first account and start tracking balances.
      </Text>
    </View>
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]}>
      <StatusBar barStyle={theme.statusBar === 'dark' ? 'dark-content' : 'light-content'} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.headerBg }]}>
        {navigation?.canGoBack?.() && (
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={{ marginRight: 10, padding: 4 }}
          >
            <Ionicons name="chevron-back" size={24} color={theme.headerText} />
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: theme.headerText }]}>Accounts</Text>
        </View>
        <TouchableOpacity
          onPress={openAdd}
          style={[styles.addBtn, { backgroundColor: 'rgba(255,255,255,0.2)' }]}
        >
          <Ionicons name="add" size={20} color={theme.headerText} />
          <Text style={{ color: theme.headerText, fontWeight: '600', fontSize: 13 }}>
            Add
          </Text>
        </TouchableOpacity>
      </View>

      {/* Total balance banner */}
      <View style={[styles.totalBanner, { backgroundColor: theme.card, borderBottomColor: theme.line }]}>
        <Text style={{ color: theme.muted, fontSize: 13, marginBottom: 4 }}>
          Total Balance
        </Text>
        <Text
          style={{
            fontSize: 32,
            fontWeight: '800',
            color: totalBalance >= 0 ? theme.ink : theme.red,
            letterSpacing: 0.5,
          }}
        >
          {fmtMoney(totalBalance, globalSymbol)}
        </Text>
        <Text style={{ color: theme.muted, fontSize: 12, marginTop: 4 }}>
          {accounts.length} account{accounts.length !== 1 ? 's' : ''}
        </Text>
      </View>

      {/* Account type distribution */}
      {accounts.length > 1 && (
        <View
          style={[
            styles.typeBar,
            { backgroundColor: theme.card, borderBottomColor: theme.line },
          ]}
        >
          {ACCOUNT_TYPES.filter(at => accounts.some(a => a.type === at.id)).map(at => {
            const typeAccs = accounts.filter(a => a.type === at.id);
            return (
              <View key={at.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: getTypeColor(at.id),
                  }}
                />
                <Text style={{ color: theme.muted, fontSize: 11 }}>
                  {at.label} ({typeAccs.length})
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Grid */}
      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} size="large" color={theme.primary} />
      ) : (
        <FlatList
          data={accounts}
          keyExtractor={item => item.id}
          renderItem={renderAccount}
          numColumns={2}
          columnWrapperStyle={{ gap: 12 }}
          contentContainerStyle={{
            padding: 14,
            gap: 12,
            paddingBottom: 100,
            flexGrow: 1,
          }}
          ListEmptyComponent={renderEmpty}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        onPress={openAdd}
        style={[styles.fab, { backgroundColor: theme.primary, shadowColor: theme.shadow }]}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color={theme.buttonText} />
      </TouchableOpacity>

      {/* Add / Edit Modal */}
      <AccountModal
        key={editingAccount?.id ?? 'new-account'}
        visible={showModal}
        onClose={() => setShowModal(false)}
        onSave={handleSave}
        initial={editingAccount}
        defaultCurrency={config.currency}
        theme={theme}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const CARD_W = (SCREEN_W - 28 - 12) / 2; // 14px side padding × 2, 12px gap

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  totalBanner: {
    alignItems: 'center',
    paddingVertical: 20,
    borderBottomWidth: 1,
  },
  typeBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  accountCard: {
    width: CARD_W,
    borderRadius: 18,
    padding: 16,
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 5,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 10,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  fab: {
    position: 'absolute',
    bottom: 28,
    right: 22,
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
});
