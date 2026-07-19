/**
 * AdminScreen — password-protected admin panel.
 *
 * Sections (after successful auth):
 *   1. FEATURES     — toggle each app feature on/off
 *   2. APPEARANCE   — app name, theme swatches
 *   3. ALARM TIMES  — default medicine + alert times
 *   4. FINANCE      — default currency, monthly budget
 *   5. SECURITY     — change admin password
 *   6. DATA         — export JSON, sign out
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Alert,
  ActivityIndicator,
  Share,
  Platform,
} from 'react-native';
import { useAppContext } from '../../state/AppContext';
import { getTheme, THEMES } from '../../constants/colors';
import { CURRENCIES } from '../../constants/categories';
import { signOut } from '../../services/auth';

// ─── Theme swatches config ────────────────────────────────────────────────────

const THEME_SWATCHES = [
  { id: 'yellow', color: '#FFCD3C', label: 'Yellow' },
  { id: 'dark',   color: '#BB86FC', label: 'Dark'   },
  { id: 'blue',   color: '#3B82F6', label: 'Blue'   },
  { id: 'green',  color: '#2E9E5B', label: 'Green'  },
  { id: 'rose',   color: '#F43F5E', label: 'Rose'   },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SectionHeader({ title, theme }) {
  const s = sharedStyles(theme);
  return (
    <View style={s.sectionHeader}>
      <Text style={s.sectionTitle}>{title}</Text>
    </View>
  );
}

function Card({ children, theme }) {
  const s = sharedStyles(theme);
  return <View style={s.card}>{children}</View>;
}

function FieldLabel({ label, theme }) {
  const s = sharedStyles(theme);
  return <Text style={s.fieldLabel}>{label}</Text>;
}

function Divider({ theme }) {
  return (
    <View style={{ height: 1, backgroundColor: getTheme(theme?.id ?? 'yellow').line, marginHorizontal: 0 }} />
  );
}

// ─── Password Gate ────────────────────────────────────────────────────────────

function PasswordGate({ onUnlock, adminPassword, theme }) {
  const s = sharedStyles(theme);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  const handleUnlock = () => {
    const correct = adminPassword || 'admin123';
    if (input === correct) {
      setError('');
      onUnlock();
    } else {
      setError('Incorrect password. Please try again.');
      setInput('');
    }
  };

  return (
    <View style={s.gateContainer}>
      <Text style={s.gateIcon}>🔒</Text>
      <Text style={s.gateTitle}>Admin Panel</Text>
      <Text style={s.gateSubtitle}>Enter your admin password to continue</Text>

      <View style={s.gateInputWrapper}>
        <TextInput
          style={[s.input, error ? s.inputError : null]}
          placeholder="Admin password"
          placeholderTextColor={theme.placeholderText}
          value={input}
          onChangeText={(v) => {
            setInput(v);
            if (error) setError('');
          }}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          onSubmitEditing={handleUnlock}
          returnKeyType="go"
        />
        {!!error && <Text style={s.errorText}>{error}</Text>}
      </View>

      <TouchableOpacity style={s.unlockBtn} onPress={handleUnlock}>
        <Text style={s.unlockBtnText}>Unlock</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function AdminScreen() {
  const { config, updateConfig, buyList, accounts, transactions, expenseReminders, medReminders, groceryReminders } =
    useAppContext();

  const theme = getTheme(config.theme);

  // Auth gate
  const [unlocked, setUnlocked] = useState(false);

  // Section-level saving states
  const [savingTimes, setSavingTimes] = useState(false);
  const [savingFinance, setSavingFinance] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [savingAppName, setSavingAppName] = useState(false);

  // Local editable state (mirrors config, allows drafting before save)
  const [appName, setAppName] = useState(config.appName ?? '');
  const [features, setFeatures] = useState({ ...config.features });
  const [medicineTimes, setMedicineTimes] = useState({ ...config.medicineTimes });
  const [alertTime, setAlertTime] = useState(config.alertTime ?? '09:00');
  const [currency, setCurrency] = useState(config.currency ?? 'USD');
  const [budget, setBudget] = useState(String(config.budget?.amount ?? 0));
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const s = sharedStyles(theme);

  // ── Feature toggle ────────────────────────────────────────────────────────
  const handleFeatureToggle = useCallback(
    async (key, value) => {
      const updated = { ...features, [key]: value };
      setFeatures(updated);
      await updateConfig({ features: updated });
    },
    [features, updateConfig]
  );

  // ── App name save ─────────────────────────────────────────────────────────
  const handleSaveAppName = useCallback(async () => {
    setSavingAppName(true);
    await updateConfig({ appName: appName.trim() });
    setSavingAppName(false);
    Alert.alert('Saved', 'App name updated.');
  }, [appName, updateConfig]);

  // ── Theme ─────────────────────────────────────────────────────────────────
  const handleThemeSelect = useCallback(
    async (themeId) => {
      await updateConfig({ theme: themeId });
    },
    [updateConfig]
  );

  // ── Alarm times save ──────────────────────────────────────────────────────
  const handleSaveTimes = useCallback(async () => {
    setSavingTimes(true);
    await updateConfig({ medicineTimes, alertTime });
    setSavingTimes(false);
    Alert.alert('Saved', 'Default alarm times updated.');
  }, [medicineTimes, alertTime, updateConfig]);

  // ── Finance save ──────────────────────────────────────────────────────────
  const handleSaveFinance = useCallback(async () => {
    const amount = parseFloat(budget) || 0;
    setSavingFinance(true);
    await updateConfig({
      currency,
      budget: { ...(config.budget ?? {}), amount },
    });
    setSavingFinance(false);
    Alert.alert('Saved', 'Finance settings updated.');
  }, [currency, budget, config.budget, updateConfig]);

  // ── Password update ───────────────────────────────────────────────────────
  const handleUpdatePassword = useCallback(async () => {
    if (!newPassword) {
      Alert.alert('Required', 'Please enter a new password.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Mismatch', 'Passwords do not match.');
      return;
    }
    if (newPassword.length < 4) {
      Alert.alert('Too Short', 'Password must be at least 4 characters.');
      return;
    }
    setSavingPassword(true);
    await updateConfig({ adminPassword: newPassword });
    setSavingPassword(false);
    setNewPassword('');
    setConfirmPassword('');
    Alert.alert('Updated', 'Admin password has been changed.');
  }, [newPassword, confirmPassword, updateConfig]);

  // ── Export data ───────────────────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const payload = {
        exportedAt: new Date().toISOString(),
        config,
        accounts,
        transactions,
        expenseReminders,
        medReminders,
        groceryReminders,
        buyList,
      };
      const json = JSON.stringify(payload, null, 2);
      await Share.share({
        title: 'Finance Tracker Data Export',
        message: json,
      });
    } catch (err) {
      Alert.alert('Export Failed', err.message ?? 'Could not export data.');
    } finally {
      setExporting(false);
    }
  }, [config, accounts, transactions, expenseReminders, medReminders, groceryReminders, buyList]);

  // ── Sign out ──────────────────────────────────────────────────────────────
  const handleSignOut = useCallback(() => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            setSigningOut(true);
            const { error } = await signOut();
            if (error) {
              setSigningOut(false);
              Alert.alert('Error', 'Could not sign out. Please try again.');
            }
            // Auth state change handled by AppContext listener
          },
        },
      ]
    );
  }, []);

  // ── Password gate ─────────────────────────────────────────────────────────
  if (!unlocked) {
    return (
      <View style={s.screen}>
        <View style={s.header}>
          <Text style={s.headerTitle}>Admin</Text>
        </View>
        <PasswordGate
          onUnlock={() => setUnlocked(true)}
          adminPassword={config.adminPassword}
          theme={theme}
        />
      </View>
    );
  }

  // ── Admin panel ───────────────────────────────────────────────────────────
  return (
    <View style={s.screen}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>Admin Panel</Text>
        <TouchableOpacity
          style={s.lockBtn}
          onPress={() => setUnlocked(false)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={s.lockBtnText}>🔒 Lock</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── 1. FEATURES ───────────────────────────────────────────────── */}
        <SectionHeader title="Features" theme={theme} />
        <Card theme={theme}>
          {[
            { key: 'finance',          label: 'Personal Finance Tracker' },
            { key: 'expenseReminders', label: 'Expense Reminders'        },
            { key: 'medReminders',     label: 'Medicine Reminders'       },
            { key: 'groceryReminders', label: 'Grocery Reminders'        },
            { key: 'buyList',          label: 'List to Buy'              },
          ].map(({ key, label }, idx, arr) => (
            <View key={key}>
              <View style={s.toggleRow}>
                <Text style={s.toggleLabel}>{label}</Text>
                <Switch
                  value={!!features[key]}
                  onValueChange={(val) => handleFeatureToggle(key, val)}
                  trackColor={{ false: theme.toggleOff, true: theme.toggleOn }}
                  thumbColor={Platform.OS === 'android' ? theme.card : undefined}
                />
              </View>
              {idx < arr.length - 1 && <View style={s.divider} />}
            </View>
          ))}
        </Card>

        {/* ── 2. APPEARANCE ─────────────────────────────────────────────── */}
        <SectionHeader title="Appearance" theme={theme} />
        <Card theme={theme}>
          {/* App Name */}
          <FieldLabel label="App Name" theme={theme} />
          <View style={s.rowInput}>
            <TextInput
              style={[s.input, s.inputFlex]}
              value={appName}
              onChangeText={setAppName}
              placeholder="My Finance Tracker"
              placeholderTextColor={theme.placeholderText}
              autoCapitalize="words"
              returnKeyType="done"
            />
            <TouchableOpacity
              style={s.saveSmallBtn}
              onPress={handleSaveAppName}
              disabled={savingAppName}
            >
              {savingAppName ? (
                <ActivityIndicator color={theme.buttonText} size="small" />
              ) : (
                <Text style={s.saveSmallBtnText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={s.divider} />

          {/* Theme picker */}
          <FieldLabel label="Theme" theme={theme} />
          <View style={s.swatchRow}>
            {THEME_SWATCHES.map(({ id, color, label }) => (
              <TouchableOpacity
                key={id}
                style={[
                  s.swatch,
                  { backgroundColor: color },
                  config.theme === id && s.swatchSelected,
                ]}
                onPress={() => handleThemeSelect(id)}
                activeOpacity={0.8}
              >
                {config.theme === id && (
                  <Text style={s.swatchCheck}>✓</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
          <View style={s.swatchLabels}>
            {THEME_SWATCHES.map(({ id, label }) => (
              <Text key={id} style={[s.swatchLabel, config.theme === id && s.swatchLabelActive]}>
                {label}
              </Text>
            ))}
          </View>
        </Card>

        {/* ── 3. DEFAULT ALARM TIMES ────────────────────────────────────── */}
        <SectionHeader title="Default Alarm Times" theme={theme} />
        <Card theme={theme}>
          {[
            {
              label: 'Medicine — Morning',
              value: medicineTimes.morning,
              onChange: (v) => setMedicineTimes((p) => ({ ...p, morning: v })),
              placeholder: '08:00',
            },
            {
              label: 'Medicine — Afternoon',
              value: medicineTimes.afternoon,
              onChange: (v) => setMedicineTimes((p) => ({ ...p, afternoon: v })),
              placeholder: '13:00',
            },
            {
              label: 'Medicine — Evening',
              value: medicineTimes.evening,
              onChange: (v) => setMedicineTimes((p) => ({ ...p, evening: v })),
              placeholder: '19:00',
            },
            {
              label: 'Expense & Grocery Alert',
              value: alertTime,
              onChange: setAlertTime,
              placeholder: '09:00',
            },
          ].map(({ label, value, onChange, placeholder }, idx, arr) => (
            <View key={label}>
              <FieldLabel label={label} theme={theme} />
              <TextInput
                style={s.input}
                value={value}
                onChangeText={onChange}
                placeholder={placeholder}
                placeholderTextColor={theme.placeholderText}
                keyboardType="numbers-and-punctuation"
                maxLength={5}
                returnKeyType="done"
              />
              {idx < arr.length - 1 && <View style={[s.divider, { marginVertical: 8 }]} />}
            </View>
          ))}

          <TouchableOpacity
            style={[s.primaryBtn, { marginTop: 16 }]}
            onPress={handleSaveTimes}
            disabled={savingTimes}
          >
            {savingTimes ? (
              <ActivityIndicator color={theme.buttonText} size="small" />
            ) : (
              <Text style={s.primaryBtnText}>Save Alarm Times</Text>
            )}
          </TouchableOpacity>
        </Card>

        {/* ── 4. FINANCE SETTINGS ───────────────────────────────────────── */}
        <SectionHeader title="Finance Settings" theme={theme} />
        <Card theme={theme}>
          {/* Currency */}
          <FieldLabel label="Default Currency" theme={theme} />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={s.currencyScroll}
            contentContainerStyle={s.currencyRow}
          >
            {CURRENCIES.map((cur) => (
              <TouchableOpacity
                key={cur.code}
                style={[s.currencyChip, currency === cur.code && s.currencyChipSelected]}
                onPress={() => setCurrency(cur.code)}
              >
                <Text style={s.currencyFlag}>{cur.flag}</Text>
                <Text style={[s.currencyCode, currency === cur.code && s.currencyCodeSelected]}>
                  {cur.code}
                </Text>
                <Text style={[s.currencySymbol, currency === cur.code && s.currencySymbolSelected]}>
                  {cur.symbol}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={s.divider} />

          {/* Monthly Budget */}
          <FieldLabel label="Monthly Budget" theme={theme} />
          <TextInput
            style={s.input}
            value={budget}
            onChangeText={setBudget}
            placeholder="0.00"
            placeholderTextColor={theme.placeholderText}
            keyboardType="decimal-pad"
            returnKeyType="done"
          />

          <TouchableOpacity
            style={[s.primaryBtn, { marginTop: 16 }]}
            onPress={handleSaveFinance}
            disabled={savingFinance}
          >
            {savingFinance ? (
              <ActivityIndicator color={theme.buttonText} size="small" />
            ) : (
              <Text style={s.primaryBtnText}>Save Finance Settings</Text>
            )}
          </TouchableOpacity>
        </Card>

        {/* ── 5. SECURITY ───────────────────────────────────────────────── */}
        <SectionHeader title="Security" theme={theme} />
        <Card theme={theme}>
          <FieldLabel label="New Password" theme={theme} />
          <TextInput
            style={s.input}
            value={newPassword}
            onChangeText={setNewPassword}
            placeholder="Enter new password"
            placeholderTextColor={theme.placeholderText}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
          />

          <View style={[s.divider, { marginVertical: 12 }]} />

          <FieldLabel label="Confirm Password" theme={theme} />
          <TextInput
            style={s.input}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Re-enter new password"
            placeholderTextColor={theme.placeholderText}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={handleUpdatePassword}
          />

          <TouchableOpacity
            style={[s.primaryBtn, { marginTop: 16 }]}
            onPress={handleUpdatePassword}
            disabled={savingPassword}
          >
            {savingPassword ? (
              <ActivityIndicator color={theme.buttonText} size="small" />
            ) : (
              <Text style={s.primaryBtnText}>Update Password</Text>
            )}
          </TouchableOpacity>
        </Card>

        {/* ── 6. DATA MANAGEMENT ────────────────────────────────────────── */}
        <SectionHeader title="Data Management" theme={theme} />
        <Card theme={theme}>
          <TouchableOpacity
            style={s.dataBtn}
            onPress={handleExport}
            disabled={exporting}
          >
            {exporting ? (
              <ActivityIndicator color={theme.primary} size="small" />
            ) : (
              <Text style={s.dataBtnText}>📤  Export All Data (JSON)</Text>
            )}
          </TouchableOpacity>

          <View style={s.divider} />

          <TouchableOpacity
            style={[s.dataBtn, s.dataBtnDanger]}
            onPress={handleSignOut}
            disabled={signingOut}
          >
            {signingOut ? (
              <ActivityIndicator color={theme.red} size="small" />
            ) : (
              <Text style={[s.dataBtnText, s.dataBtnDangerText]}>
                🚪  Sign Out
              </Text>
            )}
          </TouchableOpacity>
        </Card>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function sharedStyles(theme) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.bg,
    },

    // Header
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: theme.headerBg,
      paddingHorizontal: 16,
      paddingTop: Platform.OS === 'ios' ? 52 : 16,
      paddingBottom: 14,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: theme.headerText,
    },
    lockBtn: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 8,
      backgroundColor: theme.card,
    },
    lockBtnText: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.primaryDark,
    },

    scroll: { flex: 1 },
    scrollContent: { padding: 16 },

    // Section header
    sectionHeader: {
      marginTop: 16,
      marginBottom: 8,
      marginLeft: 4,
    },
    sectionTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },

    // Card
    card: {
      backgroundColor: theme.card,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 16,
      shadowColor: theme.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 1,
      shadowRadius: 6,
      elevation: 3,
      marginBottom: 4,
    },

    // Feature toggles
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 8,
    },
    toggleLabel: {
      fontSize: 15,
      fontWeight: '500',
      color: theme.ink,
      flex: 1,
      marginRight: 12,
    },

    // Divider
    divider: {
      height: 1,
      backgroundColor: theme.line,
      marginVertical: 4,
    },

    // Field label
    fieldLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginBottom: 8,
      marginTop: 4,
    },

    // Input
    input: {
      backgroundColor: theme.inputBg,
      borderWidth: 1,
      borderColor: theme.inputBorder,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: theme.inputText,
      marginBottom: 4,
    },
    inputError: {
      borderColor: theme.red,
    },
    inputFlex: {
      flex: 1,
      marginBottom: 0,
      marginRight: 10,
    },
    rowInput: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 4,
    },

    // Save small button
    saveSmallBtn: {
      backgroundColor: theme.primary,
      borderRadius: 10,
      paddingHorizontal: 16,
      paddingVertical: 12,
      alignItems: 'center',
      minWidth: 64,
    },
    saveSmallBtnText: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.buttonText,
    },

    // Theme swatches
    swatchRow: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 4,
      marginBottom: 4,
    },
    swatch: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    swatchSelected: {
      borderWidth: 3,
      borderColor: theme.ink,
    },
    swatchCheck: {
      color: '#FFFFFF',
      fontSize: 18,
      fontWeight: '900',
      textShadowColor: 'rgba(0,0,0,0.4)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
    },
    swatchLabels: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 4,
    },
    swatchLabel: {
      width: 44,
      fontSize: 10,
      textAlign: 'center',
      color: theme.muted,
    },
    swatchLabelActive: {
      color: theme.primaryDark,
      fontWeight: '700',
    },

    // Currency
    currencyScroll: { marginBottom: 8 },
    currencyRow: {
      flexDirection: 'row',
      gap: 8,
      paddingBottom: 4,
    },
    currencyChip: {
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: theme.line,
      backgroundColor: theme.inputBg,
      minWidth: 64,
    },
    currencyChipSelected: {
      borderColor: theme.primaryDark,
      backgroundColor: theme.primaryLight,
    },
    currencyFlag: {
      fontSize: 20,
      marginBottom: 2,
    },
    currencyCode: {
      fontSize: 11,
      fontWeight: '700',
      color: theme.muted,
    },
    currencyCodeSelected: {
      color: theme.primaryDark,
    },
    currencySymbol: {
      fontSize: 11,
      color: theme.muted,
    },
    currencySymbolSelected: {
      color: theme.primaryDark,
    },

    // Primary action button
    primaryBtn: {
      backgroundColor: theme.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
    },
    primaryBtnText: {
      fontSize: 15,
      fontWeight: '700',
      color: theme.buttonText,
    },

    // Data management buttons
    dataBtn: {
      paddingVertical: 14,
      alignItems: 'center',
    },
    dataBtnDanger: {
      // subtle danger affordance
    },
    dataBtnText: {
      fontSize: 15,
      fontWeight: '600',
      color: theme.primary,
    },
    dataBtnDangerText: {
      color: theme.red,
    },

    // Password gate
    gateContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
    },
    gateIcon: {
      fontSize: 56,
      marginBottom: 12,
    },
    gateTitle: {
      fontSize: 22,
      fontWeight: '800',
      color: theme.ink,
      marginBottom: 6,
    },
    gateSubtitle: {
      fontSize: 14,
      color: theme.muted,
      textAlign: 'center',
      marginBottom: 28,
    },
    gateInputWrapper: {
      width: '100%',
      marginBottom: 16,
    },
    errorText: {
      color: theme.red,
      fontSize: 13,
      marginTop: 6,
      marginLeft: 4,
    },
    unlockBtn: {
      backgroundColor: theme.primary,
      borderRadius: 12,
      paddingVertical: 14,
      paddingHorizontal: 48,
      alignItems: 'center',
    },
    unlockBtnText: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.buttonText,
    },
  });
}
