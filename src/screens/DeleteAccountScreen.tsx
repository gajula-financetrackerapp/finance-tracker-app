import React, { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import { useFinance } from '../FinanceContext';
import { Card, PrimaryButton, Screen, choiceLabel, choiceSurface } from '../components/ui';
import { showAppDialog, showAppInfo } from '../appDialog';
import {
  DELETION_REASON_CODES,
  requestAccountDeletion,
  wipeAccountFromDevice,
  type DeletionReasonCode,
} from '../lib/accountDeletion';
import { useT } from '../i18n/useT';
import type { TranslationKey } from '../i18n/translations';
import type { RootStackParamList } from '../navigation/types';
import type { ThemeTokens } from '../types';

/**
 * Closing an account, in the order the person leaving cares about.
 *
 * The reason is asked before the warning rather than after: someone who has
 * decided to go should not have to argue past a wall of consequences first, and
 * a reason picked while still deciding is a more honest answer than one
 * extracted at the end. Nothing happens until the final confirmation.
 */

const REASON_LABEL: Record<DeletionReasonCode, TranslationKey> = {
  another_app: 'deleteAccount.reasonAnotherApp',
  missing_features: 'deleteAccount.reasonMissingFeatures',
  too_many_bugs: 'deleteAccount.reasonBugs',
  privacy: 'deleteAccount.reasonPrivacy',
  too_expensive: 'deleteAccount.reasonExpensive',
  not_needed: 'deleteAccount.reasonNotNeeded',
  other: 'deleteAccount.reasonOther',
};

export function DeleteAccountScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { theme, resetAll } = useApp();
  const { session, isGuest, signOut } = useFinance();
  const { t } = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [reason, setReason] = useState<DeletionReasonCode | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const needsNote = reason === 'other';
  const ready = !!reason && (!needsNote || note.trim().length >= 3);

  const close = async () => {
    const userId = session?.user?.id || '';
    setBusy(true);
    const { error } = await requestAccountDeletion({
      reasonCode: reason || 'unsaid',
      note: note.trim(),
    });
    if (error) {
      setBusy(false);
      showAppInfo(t('deleteAccount.title'), error, '⚠️');
      return;
    }
    // The account is off from this moment, so the rest has to happen even if a
    // step stumbles. Signing out comes before the wipe on purpose: it stashes the
    // workspace under this user's keys on its way out, and the wipe is what takes
    // that stash with it.
    try {
      await resetAll('local');
    } catch {
      /* the wipe below is the one that must land */
    }
    await signOut();
    await wipeAccountFromDevice(userId);
    setBusy(false);
    showAppInfo(t('deleteAccount.doneTitle'), t('deleteAccount.doneBody'), '👋');
    // Nothing left to do on a screen about an account that is gone.
    navigation.popToTop();
  };

  const confirm = () => {
    showAppDialog({
      title: t('deleteAccount.confirmTitle'),
      message: t('deleteAccount.confirmBody'),
      icon: '⚠️',
      buttons: [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('deleteAccount.confirmCta'),
          style: 'destructive',
          onPress: () => void close(),
        },
      ],
    });
  };

  if (isGuest) {
    return (
      <Screen>
        <View style={styles.body}>
          <Card>
            <Text style={[styles.title, { color: theme.ink }]}>{t('deleteAccount.title')}</Text>
            <Text style={[styles.hint, { color: theme.muted }]}>
              {t('deleteAccount.guestBody')}
            </Text>
          </Card>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
      >
        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: 24 + insets.bottom }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Card>
            <Text style={[styles.title, { color: theme.ink }]}>{t('deleteAccount.title')}</Text>
            <Text style={[styles.hint, { color: theme.muted }]}>{t('deleteAccount.intro')}</Text>
          </Card>

          <Card>
            <Text style={[styles.label, { color: theme.muted }]}>{t('deleteAccount.reasonAsk')}</Text>
            <View style={styles.reasons}>
              {DELETION_REASON_CODES.map((code) => {
                const on = reason === code;
                return (
                  <Pressable
                    key={code}
                    onPress={() => setReason(code)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    style={[styles.reasonRow, choiceSurface(theme, on)]}
                  >
                    <View
                      style={[
                        styles.radio,
                        { borderColor: on ? theme.primary : theme.line },
                        on && { backgroundColor: theme.ink },
                      ]}
                    />
                    <Text style={[styles.reasonText, choiceLabel(theme, on)]}>
                      {t(REASON_LABEL[code])}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.label, { color: theme.muted }]}>
              {needsNote ? t('deleteAccount.noteRequired') : t('deleteAccount.noteOptional')}
            </Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder={t('deleteAccount.notePlaceholder')}
              placeholderTextColor={theme.muted}
              multiline
              textAlignVertical="top"
              style={[
                styles.input,
                { color: theme.ink, borderColor: theme.line, backgroundColor: theme.bg },
              ]}
            />
          </Card>

          <Card>
            <Text style={[styles.label, { color: theme.muted }]}>
              {t('deleteAccount.whatHappens')}
            </Text>
            {(
              [
                'deleteAccount.effectDisabled',
                'deleteAccount.effectQueued',
                'deleteAccount.effectDevice',
                'deleteAccount.effectSplit',
              ] as TranslationKey[]
            ).map((key) => (
              <View key={key} style={styles.bulletRow}>
                <Text style={[styles.bulletDot, { color: theme.red }]}>•</Text>
                <Text style={[styles.bulletText, { color: theme.ink }]}>{t(key)}</Text>
              </View>
            ))}
          </Card>

          <PrimaryButton
            title={busy ? t('common.saving') : t('deleteAccount.cta')}
            onPress={() => {
              if (busy) return;
              if (!ready) {
                showAppInfo(t('deleteAccount.title'), t('deleteAccount.pickReason'), '✍️');
                return;
              }
              confirm();
            }}
            danger
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function makeStyles(_theme: ThemeTokens) {
  return StyleSheet.create({
    body: { padding: 16, gap: 12 },
    title: { fontWeight: '900', fontSize: 20, marginBottom: 8 },
    hint: { fontSize: 14, lineHeight: 20 },
    label: {
      fontSize: 12,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.3,
      marginBottom: 8,
      marginTop: 4,
    },
    reasons: { gap: 8, marginBottom: 14 },
    reasonRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderWidth: 1.5,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 11,
    },
    radio: { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },
    reasonText: { fontWeight: '800', fontSize: 14, flex: 1 },
    input: {
      minHeight: 96,
      borderWidth: 1.5,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 12,
      fontSize: 15,
      fontWeight: '600',
      marginBottom: 4,
    },
    bulletRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
    bulletDot: { fontSize: 15, fontWeight: '900', lineHeight: 20 },
    bulletText: { fontSize: 14, lineHeight: 20, flex: 1, fontWeight: '600' },
  });
}
