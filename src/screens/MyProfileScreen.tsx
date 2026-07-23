import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useFinance } from '../FinanceContext';
import { Card, PrimaryButton, Screen } from '../components/ui';
import { ensureUserProfile, fetchUserProfile, updateUserFullName } from '../lib/profile';
import type { Profile } from '../lib/supabase';
import { theme as pulse } from '../theme';

export function MyProfileScreen() {
  const navigation = useNavigation();
  const { isGuest, session, setShowAuth, setAuthMode } = useFinance();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [nameDraft, setNameDraft] = useState('');

  const email = session?.user?.email || profile?.email || '';

  const load = useCallback(async () => {
    if (isGuest || !session?.user?.id) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const row =
      (await ensureUserProfile({
        userId: session.user.id,
        email: session.user.email,
      })) || (await fetchUserProfile(session.user.id));
    setProfile(row);
    setNameDraft(row?.full_name || session.user.email?.split('@')[0] || '');
    setLoading(false);
  }, [isGuest, session?.user?.id, session?.user?.email]);

  useFocusEffect(
    useCallback(() => {
      void load();
      setEditing(false);
    }, [load]),
  );

  const onSave = async () => {
    if (!session?.user?.id) return;
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      Alert.alert('Name required', 'Please enter your name.');
      return;
    }
    if (trimmed === (profile?.full_name || '').trim()) {
      setEditing(false);
      return;
    }

    setSaving(true);
    const err = await updateUserFullName(session.user.id, trimmed);
    setSaving(false);
    if (err) {
      Alert.alert('Could not save', err);
      return;
    }
    setProfile((prev) => (prev ? { ...prev, full_name: trimmed } : prev));
    setEditing(false);
    Alert.alert('Saved', 'Your profile was updated.');
  };

  if (isGuest) {
    return (
      <Screen>
        <ScrollView contentContainerStyle={styles.body}>
          <Card>
            <Text style={styles.h2}>My Profile</Text>
            <Text style={styles.hint}>
              Sign in to view and edit your name. Email is your login and cannot be changed.
            </Text>
            <PrimaryButton
              title="Login / Sign up"
              onPress={() => {
                setAuthMode('login');
                setShowAuth(true);
              }}
            />
          </Card>
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Card>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(nameDraft || email || '?').trim().charAt(0).toUpperCase()}
            </Text>
          </View>

          {loading ? (
            <ActivityIndicator color={pulse.header} style={{ marginVertical: 20 }} />
          ) : (
            <>
              <View style={styles.fieldBlock}>
                <Text style={styles.label}>Name</Text>
                {editing ? (
                  <TextInput
                    value={nameDraft}
                    onChangeText={setNameDraft}
                    placeholder="Your name"
                    placeholderTextColor={pulse.muted}
                    autoCapitalize="words"
                    autoCorrect={false}
                    style={styles.input}
                    editable={!saving}
                  />
                ) : (
                  <Text style={styles.value}>{profile?.full_name || nameDraft || '—'}</Text>
                )}
              </View>

              <View style={styles.fieldBlock}>
                <Text style={styles.label}>Email</Text>
                <Text style={styles.value}>{email || '—'}</Text>
                <Text style={styles.lockHint}>Used for login · cannot be edited</Text>
              </View>

              {editing ? (
                <View style={styles.actions}>
                  <PrimaryButton
                    title={saving ? 'Saving…' : 'Save changes'}
                    onPress={() => {
                      if (!saving) void onSave();
                    }}
                  />
                  <Pressable
                    style={styles.cancelBtn}
                    disabled={saving}
                    onPress={() => {
                      setNameDraft(profile?.full_name || email.split('@')[0] || '');
                      setEditing(false);
                    }}
                  >
                    <Text style={styles.cancelText}>Cancel</Text>
                  </Pressable>
                </View>
              ) : (
                <PrimaryButton title="Edit profile" onPress={() => setEditing(true)} />
              )}
            </>
          )}
        </Card>

        <Pressable onPress={() => navigation.goBack()} style={styles.backLink}>
          <Text style={styles.backText}>← Back to Settings</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 40 },
  h2: { fontWeight: '900', fontSize: 18, color: pulse.ink, marginBottom: 8 },
  hint: { color: pulse.muted, lineHeight: 20, marginBottom: 14 },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: pulse.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 18,
  },
  avatarText: { fontSize: 28, fontWeight: '900', color: pulse.header },
  fieldBlock: { marginBottom: 16 },
  label: {
    color: pulse.muted,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  value: { fontSize: 16, fontWeight: '700', color: pulse.ink },
  lockHint: { color: pulse.muted, fontSize: 12, marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: pulse.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '700',
    color: pulse.ink,
    backgroundColor: '#fff',
  },
  actions: { gap: 10, marginTop: 4 },
  cancelBtn: {
    borderWidth: 1.5,
    borderColor: pulse.line,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  cancelText: { color: pulse.ink, fontWeight: '700' },
  backLink: { alignItems: 'center', marginTop: 8, padding: 8 },
  backText: { color: pulse.muted, fontWeight: '700' },
});
