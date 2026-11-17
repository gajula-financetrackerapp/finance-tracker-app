import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useApp } from '../context/AppContext';
import {
  enrollAdminTotp,
  getAdminMfaState,
  verifyAdminTotp,
  type AdminMfaState,
} from '../lib/adminMfa';
import { showAppInfo } from '../appDialog';

export function AdminMfaPanel() {
  const { theme } = useApp();
  const [state, setState] = useState<AdminMfaState | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const next = await getAdminMfaState();
    setState(next);
    setFactorId(next.factorId);
  };

  useEffect(() => {
    void refresh().catch(() => undefined);
  }, []);

  const enroll = () => {
    void (async () => {
      setBusy(true);
      try {
        const next = await enrollAdminTotp();
        setFactorId(next.factorId);
        setSecret(next.secret);
      } catch (error) {
        showAppInfo('Administrator MFA', error instanceof Error ? error.message : 'Could not enroll', '⚠️');
      } finally {
        setBusy(false);
      }
    })();
  };

  const verify = () => {
    if (!factorId || code.replace(/\D/g, '').length !== 6) return;
    void (async () => {
      setBusy(true);
      try {
        await verifyAdminTotp(factorId, code);
        setCode('');
        setSecret('');
        await refresh();
        showAppInfo('Administrator MFA', 'Sensitive administrator actions are unlocked.', '🔐');
      } catch (error) {
        showAppInfo('Administrator MFA', error instanceof Error ? error.message : 'Invalid code', '⚠️');
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.line }]}>
      <Text style={[styles.title, { color: theme.ink }]}>Administrator MFA</Text>
      <Text style={[styles.note, { color: theme.muted }]}>
        {state?.aal === 'aal2' && state.recent
          ? 'Verified for this session.'
          : state?.verified
            ? 'Enter the current authenticator code to unlock sensitive actions.'
            : 'Enroll a TOTP authenticator before enabling the server MFA migration.'}
      </Text>
      {secret ? (
        <View>
          <Text style={[styles.label, { color: theme.muted }]}>Authenticator setup key</Text>
          <Text selectable style={[styles.secret, { color: theme.ink, borderColor: theme.line }]}>
            {secret}
          </Text>
        </View>
      ) : null}
      {(!state || state.aal !== 'aal2' || !state.recent) && !factorId ? (
        <Pressable disabled={busy} onPress={enroll} style={[styles.button, { backgroundColor: theme.primary }]}>
          <Text style={styles.buttonText}>{busy ? 'Preparing…' : 'Enroll authenticator'}</Text>
        </Pressable>
      ) : null}
      {(!state || state.aal !== 'aal2' || !state.recent) && factorId ? (
        <View style={styles.verifyRow}>
          <TextInput
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            maxLength={6}
            placeholder="6-digit code"
            placeholderTextColor={theme.muted}
            style={[styles.input, { color: theme.ink, borderColor: theme.line }]}
          />
          <Pressable disabled={busy} onPress={verify} style={[styles.button, { backgroundColor: theme.primary }]}>
            <Text style={styles.buttonText}>{busy ? 'Checking…' : 'Verify'}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 12, marginBottom: 14 },
  title: { fontSize: 17, fontWeight: '900' },
  note: { fontSize: 13, lineHeight: 18 },
  label: { fontSize: 12, marginBottom: 5 },
  secret: { borderWidth: 1, borderRadius: 10, padding: 10, fontFamily: 'monospace' },
  verifyRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, minHeight: 44 },
  button: { minHeight: 44, borderRadius: 10, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#fff', fontWeight: '800' },
});
