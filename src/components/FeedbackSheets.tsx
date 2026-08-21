import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useApp } from '../context/AppContext';
import { useFinance } from '../FinanceContext';
import { BottomSheet } from './BottomSheet';
import { PrimaryButton } from './ui';
import { showAppInfo } from '../appDialog';
import { requireAuthToSave } from '../authGate';
import {
  feedbackFailureKey,
  sendFeedbackMessage,
  type FeedbackTopic,
} from '../lib/feedbackChannel';
import { useT } from '../i18n/useT';
import type { ThemeTokens } from '../types';

/**
 * One sheet body for both asks: say what it's for, say where the reply lands,
 * then get out of the way of the box the user came to type in. BottomSheet
 * carries the keyboard lift, so the box stays visible while typing.
 */
function MessageSheet({
  open,
  onClose,
  title,
  sub,
  placeholder,
  topic,
  sentMessage,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  sub: string;
  placeholder: string;
  topic: FeedbackTopic;
  sentMessage: string;
}) {
  const { theme } = useApp();
  const { session } = useFinance();
  const { t } = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const email = session?.user?.email || null;

  // Split on the placeholder so the address can carry its own weight while the
  // sentence around it stays in the translator's word order.
  const [before, after] = t('feedbackHub.replyTo').split('{email}');

  const submit = async () => {
    // The message is filed against an account, so there has to be one.
    if (!requireAuthToSave('send feedback')) return;

    const text = message.trim();
    if (text.length < 5) {
      showAppInfo(title, t('feedback.tooShort'), '✍️');
      return;
    }
    setSending(true);
    const result = await sendFeedbackMessage({ topic, message: text });
    setSending(false);

    if (result !== 'sent') {
      // The typed text is left in the box: it is the one thing here that cannot
      // be recovered if this closes.
      showAppInfo(title, t(feedbackFailureKey(result)), '⚠️');
      return;
    }
    setMessage('');
    onClose();
    showAppInfo(title, sentMessage, '✅');
  };

  return (
    <BottomSheet visible={open} onClose={onClose}>
      <View style={styles.head}>
        <Text style={styles.title}>{title}</Text>
        <Pressable onPress={onClose} hitSlop={10} style={styles.close}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.body}
      >
        <Text style={styles.sub}>{sub}</Text>

        <View style={styles.note}>
          <Text style={styles.noteText}>
            {email ? (
              <>
                {before}
                <Text style={styles.noteEmail}>{email}</Text>
                {after ?? ''}
              </>
            ) : (
              t('feedbackHub.replyToGuest')
            )}
          </Text>
        </View>

        <TextInput
          value={message}
          onChangeText={setMessage}
          placeholder={placeholder}
          placeholderTextColor={theme.muted}
          multiline
          textAlignVertical="top"
          style={styles.input}
        />

        <PrimaryButton
          title={sending ? t('common.saving') : t('feedbackHub.submit')}
          onPress={() => {
            if (!sending) void submit();
          }}
        />
      </ScrollView>
    </BottomSheet>
  );
}

export function ReportIssueSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT();
  return (
    <MessageSheet
      open={open}
      onClose={onClose}
      title={t('feedbackHub.issueTitle')}
      sub={t('feedbackHub.issueBody')}
      placeholder={t('feedbackHub.issuePlaceholder')}
      topic="bug"
      sentMessage={t('feedback.sentHint')}
    />
  );
}

export function RequestFeatureSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT();
  return (
    <MessageSheet
      open={open}
      onClose={onClose}
      title={t('feedbackHub.featureTitle')}
      sub={t('feedbackHub.featureBody')}
      placeholder={t('feedbackHub.featurePlaceholder')}
      topic="idea"
      sentMessage={t('feedbackHub.featureSent')}
    />
  );
}

function makeStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 4 },
    title: { flex: 1, color: theme.header, fontSize: 19, fontWeight: '900' },
    close: {
      width: 30,
      height: 30,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.accentSoft,
    },
    closeText: { color: theme.header, fontSize: 14, fontWeight: '900' },
    body: { paddingTop: 10, gap: 12 },
    sub: { color: theme.muted, fontSize: 13, lineHeight: 19 },
    note: {
      backgroundColor: theme.accentSoft,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    noteText: { color: theme.ink, fontSize: 12.5, lineHeight: 18, fontWeight: '600' },
    noteEmail: { color: theme.header, fontWeight: '900' },
    input: {
      minHeight: 120,
      borderWidth: 1.5,
      borderRadius: 12,
      borderColor: theme.line,
      backgroundColor: theme.bg,
      color: theme.ink,
      paddingHorizontal: 12,
      paddingVertical: 12,
      fontSize: 15,
      fontWeight: '600',
    },
  });
}
