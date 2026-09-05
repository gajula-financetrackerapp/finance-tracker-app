import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useApp } from '../context/AppContext';
import { showAppInfo } from '../appDialog';
import { adminSetUserPremium, isPremiumCurrentlyActive, type PremiumBilling } from '../lib/premium';
import type { SignedInUserRow } from '../lib/profile';
import type { ThemeTokens } from '../types';
import { choiceLabel, choiceSurface } from './ui';

type DurationMode = 'days' | 'months' | 'range' | 'forever';

type Props = {
  user: SignedInUserRow | null;
  visible: boolean;
  onClose: () => void;
  onUpdated: (next: SignedInUserRow) => void;
};

function toDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  return iso.slice(0, 10);
}

function endOfDayIso(yyyyMmDd: string): string {
  return `${yyyyMmDd}T23:59:59.999Z`;
}

function startOfDayIso(yyyyMmDd: string): string {
  return `${yyyyMmDd}T00:00:00.000Z`;
}

export function AdminUserDetailsModal({ user, visible, onClose, onUpdated }: Props) {
  const { theme } = useApp();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [premiumOn, setPremiumOn] = useState(false);
  const [billing, setBilling] = useState<PremiumBilling>('year');
  const [mode, setMode] = useState<DurationMode>('months');
  const [days, setDays] = useState('30');
  const [months, setMonths] = useState('12');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user || !visible) return;
    const on = isPremiumCurrentlyActive({
      is_premium: user.is_premium,
      premium_until: user.premium_until,
    });
    setPremiumOn(on);
    const b = user.premium_billing === 'month' ? 'month' : 'year';
    setBilling(b);
    setMode(user.premium_until ? 'range' : 'forever');
    setFromDate(toDateInput(user.premium_since) || new Date().toISOString().slice(0, 10));
    setToDate(toDateInput(user.premium_until));
    setDays(b === 'month' ? '30' : '365');
    setMonths(b === 'month' ? '1' : '12');
  }, [user, visible]);

  if (!user) return null;

  const name =
    (user.full_name || '').trim() || (user.email || '').split('@')[0] || 'User';

  const applyBillingPreset = (next: PremiumBilling) => {
    setBilling(next);
    if (next === 'month') {
      setMode('months');
      setMonths('1');
      setDays('30');
    } else {
      setMode('months');
      setMonths('12');
      setDays('365');
    }
  };

  const computeUntil = (): string | null => {
    if (!premiumOn) return null;
    if (mode === 'forever') return null;
    if (mode === 'days') {
      const n = Math.max(1, Math.floor(Number(days) || 0));
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + n);
      return d.toISOString();
    }
    if (mode === 'months') {
      const n = Math.max(1, Math.floor(Number(months) || 0));
      const d = new Date();
      d.setUTCMonth(d.getUTCMonth() + n);
      return d.toISOString();
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(toDate)) return null;
    return endOfDayIso(toDate);
  };

  const computeSince = (): string | null => {
    if (!premiumOn) return null;
    if (mode === 'range' && /^\d{4}-\d{2}-\d{2}$/.test(fromDate)) {
      return startOfDayIso(fromDate);
    }
    return null;
  };

  const onSave = async () => {
    if (premiumOn && mode === 'range') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
        showAppInfo('Premium', 'Enter From and To dates as YYYY-MM-DD.', '⚠️');
        return;
      }
      if (fromDate > toDate) {
        showAppInfo('Premium', 'From date must be on or before To date.', '⚠️');
        return;
      }
    }
    if (premiumOn && mode === 'days' && !(Number(days) > 0)) {
      showAppInfo('Premium', 'Enter days greater than 0.', '⚠️');
      return;
    }
    if (premiumOn && mode === 'months' && !(Number(months) > 0)) {
      showAppInfo('Premium', 'Enter months greater than 0.', '⚠️');
      return;
    }

    setSaving(true);
    const res = await adminSetUserPremium({
      userId: user.id,
      enable: premiumOn,
      sinceAt: computeSince(),
      untilAt: computeUntil(),
      billing: premiumOn ? billing : null,
    });
    setSaving(false);
    if (!res.ok) {
      showAppInfo('Premium', res.error || 'Could not update user.', '⚠️');
      return;
    }
    const nextRow: SignedInUserRow = {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      created_at: user.created_at,
      is_premium: premiumOn,
      premium_since:
        res.profile?.premium_since ??
        (premiumOn ? computeSince() || new Date().toISOString() : user.premium_since || null),
      premium_until: premiumOn ? computeUntil() : null,
      premium_billing: premiumOn ? billing : null,
    };
    if (res.profile) {
      nextRow.is_premium = !!res.profile.is_premium;
      nextRow.premium_since = res.profile.premium_since ?? null;
      nextRow.premium_until = res.profile.premium_until ?? null;
      nextRow.premium_billing = res.profile.premium_billing ?? (premiumOn ? billing : null);
    }
    showAppInfo(
      'Premium',
      premiumOn
        ? `Premium (${billing === 'month' ? 'monthly' : 'yearly'}) enabled for ${name}.`
        : `Premium disabled for ${name}.`,
      '✅',
    );
    onUpdated(nextRow);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <View style={[styles.card, { backgroundColor: theme.card }]}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={[styles.title, { color: theme.ink }]}>{name}</Text>
            <Text style={[styles.sub, { color: theme.muted }]}>
              {(user.email || '—').trim()}
            </Text>
            <Text style={[styles.sub, { color: theme.muted }]}>
              Role: {user.role === 'admin' ? 'Admin' : 'User'}
              {user.is_premium ? ' · Premium on file' : ''}
              {user.premium_billing === 'month'
                ? ' · Monthly'
                : user.premium_billing === 'year'
                  ? ' · Yearly'
                  : ''}
            </Text>

            <Text style={[styles.section, { color: theme.ink }]}>Premium access</Text>
            <View style={styles.row}>
              {(['off', 'on'] as const).map((id) => {
                const on = (id === 'on') === premiumOn;
                return (
                  <Pressable
                    key={id}
                    onPress={() => setPremiumOn(id === 'on')}
                    style={[styles.chip, choiceSurface(theme, on)]}
                  >
                    <Text style={choiceLabel(theme, on)}>
                      {id === 'on' ? 'Enabled' : 'Disabled'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {premiumOn ? (
              <>
                <Text style={[styles.section, { color: theme.ink }]}>Plan type</Text>
                <Text style={[styles.hint, { color: theme.muted }]}>
                  Match the email request (Monthly ₹39 vs Yearly ₹399). Used for Users filters.
                </Text>
                <View style={styles.row}>
                  {(
                    [
                      ['month', 'Monthly'],
                      ['year', 'Yearly'],
                    ] as const
                  ).map(([id, label]) => {
                    const on = billing === id;
                    return (
                      <Pressable
                        key={id}
                        onPress={() => applyBillingPreset(id)}
                        style={[styles.chip, { flex: 1, alignItems: 'center' }, choiceSurface(theme, on)]}
                      >
                        <Text style={choiceLabel(theme, on)}>
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={[styles.section, { color: theme.ink }]}>Duration</Text>
                <View style={styles.rowWrap}>
                  {(
                    [
                      ['days', 'Days'],
                      ['months', 'Months'],
                      ['range', 'From → To'],
                      ['forever', 'No end'],
                    ] as const
                  ).map(([id, label]) => {
                    const on = mode === id;
                    return (
                      <Pressable
                        key={id}
                        onPress={() => setMode(id)}
                        style={[styles.chip, choiceSurface(theme, on)]}
                      >
                        <Text
                          style={[{ fontSize: 12 }, choiceLabel(theme, on)]}
                        >
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {mode === 'days' ? (
                  <TextInput
                    value={days}
                    onChangeText={setDays}
                    keyboardType="number-pad"
                    placeholder="30"
                    placeholderTextColor={theme.muted}
                    style={[
                      styles.input,
                      { color: theme.ink, borderColor: theme.line, backgroundColor: theme.bg },
                    ]}
                  />
                ) : null}
                {mode === 'months' ? (
                  <TextInput
                    value={months}
                    onChangeText={setMonths}
                    keyboardType="number-pad"
                    placeholder="12"
                    placeholderTextColor={theme.muted}
                    style={[
                      styles.input,
                      { color: theme.ink, borderColor: theme.line, backgroundColor: theme.bg },
                    ]}
                  />
                ) : null}
                {mode === 'range' ? (
                  <>
                    <Text style={[styles.label, { color: theme.muted }]}>From (YYYY-MM-DD)</Text>
                    <TextInput
                      value={fromDate}
                      onChangeText={setFromDate}
                      autoCapitalize="none"
                      placeholder="2026-07-25"
                      placeholderTextColor={theme.muted}
                      style={[
                        styles.input,
                        { color: theme.ink, borderColor: theme.line, backgroundColor: theme.bg },
                      ]}
                    />
                    <Text style={[styles.label, { color: theme.muted }]}>To (YYYY-MM-DD)</Text>
                    <TextInput
                      value={toDate}
                      onChangeText={setToDate}
                      autoCapitalize="none"
                      placeholder="2027-07-25"
                      placeholderTextColor={theme.muted}
                      style={[
                        styles.input,
                        { color: theme.ink, borderColor: theme.line, backgroundColor: theme.bg },
                      ]}
                    />
                  </>
                ) : null}
              </>
            ) : null}

            <Pressable
              onPress={() => {
                if (!saving) void onSave();
              }}
              style={[styles.saveBtn, { backgroundColor: theme.header, opacity: saving ? 0.6 : 1 }]}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveText}>Apply to user</Text>
              )}
            </Pressable>
            <Pressable onPress={onClose} style={styles.cancelBtn}>
              <Text style={{ color: theme.muted, fontWeight: '700' }}>Cancel</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(_theme: ThemeTokens) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'center',
      padding: 20,
    },
    card: {
      borderRadius: 16,
      padding: 16,
      maxHeight: '88%',
    },
    title: { fontSize: 18, fontWeight: '900' },
    sub: { marginTop: 4, fontSize: 13, fontWeight: '600' },
    hint: { fontSize: 12, lineHeight: 17, marginBottom: 8, fontWeight: '600' },
    section: { marginTop: 16, marginBottom: 8, fontWeight: '800', fontSize: 14 },
    row: { flexDirection: 'row', gap: 8 },
    rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 10,
      borderWidth: 1.5,
    },
    label: {
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      marginBottom: 6,
      marginTop: 4,
    },
    input: {
      borderWidth: 1.5,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontWeight: '600',
      marginBottom: 8,
    },
    saveBtn: {
      marginTop: 16,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
    },
    saveText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    cancelBtn: { alignItems: 'center', paddingVertical: 12 },
  });
}
