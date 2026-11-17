import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { BottomSheet } from './BottomSheet';
import { useApp } from '../context/AppContext';

type Props = {
  visible: boolean;
  mode: 'export' | 'import';
  busy?: boolean;
  onClose: () => void;
  onSubmit: (password: string) => void;
};

export function BackupPasswordSheet({ visible, mode, busy, onClose, onSubmit }: Props) {
  const { theme } = useApp();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    if (!visible) {
      setPassword('');
      setConfirmPassword('');
    }
  }, [visible]);
  const valid =
    password.length >= 8 && (mode === 'import' || password === confirmPassword);

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.body}>
        <Text style={[styles.title, { color: theme.ink }]}>
          {mode === 'export' ? 'Encrypt backup' : 'Unlock backup'}
        </Text>
        <Text style={[styles.note, { color: theme.muted }]}>
          {mode === 'export'
            ? 'Use at least 8 characters. MoneyLit cannot recover a forgotten backup password.'
            : 'Enter the password that was used when this backup was created.'}
        </Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Backup password"
          placeholderTextColor={theme.muted}
          style={[
            styles.input,
            { color: theme.ink, borderColor: theme.line, backgroundColor: theme.card },
          ]}
        />
        {mode === 'export' ? (
          <TextInput
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Confirm backup password"
            placeholderTextColor={theme.muted}
            style={[
              styles.input,
              { color: theme.ink, borderColor: theme.line, backgroundColor: theme.card },
            ]}
          />
        ) : null}
        {mode === 'export' && confirmPassword && password !== confirmPassword ? (
          <Text style={{ color: theme.red, fontSize: 12 }}>Passwords do not match.</Text>
        ) : null}
        <View style={styles.actions}>
          <Pressable
            disabled={busy}
            onPress={onClose}
            style={[styles.button, { borderColor: theme.line }]}
          >
            <Text style={{ color: theme.ink, fontWeight: '700' }}>Cancel</Text>
          </Pressable>
          <Pressable
            disabled={busy || !valid}
            onPress={() => onSubmit(password)}
            style={[
              styles.button,
              {
                backgroundColor: theme.primary,
                opacity: busy || !valid ? 0.5 : 1,
              },
            ]}
          >
            <Text style={{ color: '#fff', fontWeight: '800' }}>
              {busy ? 'Working…' : mode === 'export' ? 'Encrypt & share' : 'Unlock'}
            </Text>
          </Pressable>
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 14 },
  title: { fontSize: 20, fontWeight: '900' },
  note: { fontSize: 13, lineHeight: 19 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  button: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
