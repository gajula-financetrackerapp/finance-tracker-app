import React, { useCallback, useMemo, useState } from 'react';
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
import { useApp } from '../context/AppContext';
import { Card, PrimaryButton, Screen } from '../components/ui';
import { ProfileAvatar } from '../components/ProfileAvatar';
import { ensureUserProfile, fetchUserProfile, updateUserFullName } from '../lib/profile';
import { userInitial } from '../data/avatars';
import type { Profile } from '../lib/supabase';
import type { ThemeTokens } from '../types';
import { useT } from '../i18n/useT';

export function MyProfileScreen() {
  const navigation = useNavigation();
  const { theme } = useApp();
  const { t } = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
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
      Alert.alert(t('common.nameRequired'), 'Please enter your name.');
      return;
    }
    if (trimmed === (profile?.full_name || '').trim()) {
      setEditing(false);
      return;
    }

    setSaving(true);
    const { error, profile: next } = await updateUserFullName(
      session.user.id,
      trimmed,
      session.user.email,
    );
    setSaving(false);
    if (error || !next) {
      Alert.alert(t('common.couldNotSave'), error || 'Please try again.');
      return;
    }
    setProfile(next);
    setNameDraft(next.full_name || trimmed);
    setEditing(false);
    Alert.alert('Saved', 'Your profile was updated.');
  };

  if (isGuest) {
    return (
      <Screen>
        <ScrollView contentContainerStyle={styles.body}>
          <Card>
            <Text style={styles.h2}>{t('myProfile.title')}</Text>
            <Text style={styles.hint}>{t('myProfile.guestHint')}</Text>
            <PrimaryButton
              title={t('profile.signIn')}
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
          <View style={styles.avatarWrap}>
            <ProfileAvatar
              initial={userInitial(nameDraft || profile?.full_name, email)}
              size={72}
            />
          </View>

          {loading ? (
            <ActivityIndicator color={theme.header} style={{ marginVertical: 20 }} />
          ) : (
            <>
              <View style={styles.fieldBlock}>
                <Text style={styles.label}>{t('common.name')}</Text>
                {editing ? (
                  <TextInput
                    value={nameDraft}
                    onChangeText={setNameDraft}
                    placeholder={t('myProfile.namePlaceholder')}
                    placeholderTextColor={theme.muted}
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
                <Text style={styles.label}>{t('myProfile.email')}</Text>
                <Text style={styles.value}>{email || '—'}</Text>
                <Text style={styles.lockHint}>{t('myProfile.emailHint')}</Text>
              </View>

              {editing ? (
                <View style={styles.actions}>
                  <PrimaryButton
                    title={saving ? t('common.saving') : t('home.save')}
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
                    <Text style={styles.cancelText}>{t('home.cancel')}</Text>
                  </Pressable>
                </View>
              ) : (
                <PrimaryButton title={t('home.edit')} onPress={() => setEditing(true)} />
              )}
            </>
          )}
        </Card>

        <Pressable onPress={() => navigation.goBack()} style={styles.backLink}>
          <Text style={styles.backText}>← {t('home.back')}</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

function makeStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    body: { padding: 16, paddingBottom: 40 },
    h2: { fontWeight: '900', fontSize: 18, color: theme.ink, marginBottom: 8 },
    hint: { color: theme.muted, lineHeight: 20, marginBottom: 14 },
    avatarWrap: {
      alignSelf: 'center',
      marginBottom: 18,
    },
    fieldBlock: { marginBottom: 16 },
    label: {
      color: theme.muted,
      fontSize: 12,
      fontWeight: '800',
      textTransform: 'uppercase',
      marginBottom: 6,
      letterSpacing: 0.3,
    },
    value: { fontSize: 16, fontWeight: '700', color: theme.ink },
    lockHint: { color: theme.muted, fontSize: 12, marginTop: 4 },
    input: {
      borderWidth: 1,
      borderColor: theme.line,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      fontWeight: '700',
      color: theme.ink,
      backgroundColor: '#fff',
    },
    actions: { gap: 10, marginTop: 4 },
    cancelBtn: {
      borderWidth: 1.5,
      borderColor: theme.line,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
      backgroundColor: '#fff',
    },
    cancelText: { color: theme.ink, fontWeight: '700' },
    backLink: { alignItems: 'center', marginTop: 8, padding: 8 },
    backText: { color: theme.muted, fontWeight: '700' },
  });
}
