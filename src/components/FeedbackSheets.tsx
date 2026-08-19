import React, { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import { useFinance } from '../FinanceContext';
import { PrimaryButton } from './ui';
import { showAppInfo } from '../appDialog';
import { sendFeedbackMessage } from '../lib/feedbackChannel';
import { FEATURE_IDEAS } from '../lib/featureIdeas';
import { useT } from '../i18n/useT';
import type { ThemeTokens } from '../types';

/** Shared shell: dimmed backdrop, sheet from the bottom, themed like a card. */
function Sheet({
  open,
  onClose,
  title,
  sub,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  const { theme } = useApp();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheetWrap}
        >
          <View style={[styles.sheet, { paddingBottom: 18 + insets.bottom }]}>
            <View style={styles.grabber} />
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>{title}</Text>
              <Pressable onPress={onClose} hitSlop={10} style={styles.close}>
                <Text style={styles.closeText}>✕</Text>
              </Pressable>
            </View>
            <Text style={styles.sheetSub}>{sub}</Text>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.sheetBody}
            >
              {children}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

/** Tells the user where our reply will land before they spend time typing. */
function ReplyNote({ email }: { email: string | null }) {
  const { theme } = useApp();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { t } = useT();

  // Split on the placeholder so the address can carry its own weight while the
  // sentence around it stays in the translator's word order.
  const [before, after] = t('feedbackHub.replyTo').split('{email}');

  return (
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
  );
}

export function ReportIssueSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { theme, config } = useApp();
  const { session } = useFinance();
  const { t } = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const email = session?.user?.email || null;

  const submit = async () => {
    const text = message.trim();
    if (text.length < 5) {
      showAppInfo(t('feedbackHub.issueTitle'), t('feedback.tooShort'), '✍️');
      return;
    }
    setSending(true);
    const result = await sendFeedbackMessage({
      config: config.feedback,
      appName: config.appName || 'Pulse Wallet',
      topicLabel: t('feedback.topicBug'),
      account: email || 'guest',
      message: text,
    });
    setSending(false);
    if (result === 'notConfigured') {
      showAppInfo(t('feedbackHub.issueTitle'), t('feedback.notConfigured'), '⚠️');
      return;
    }
    if (result === 'failed') {
      showAppInfo(t('feedbackHub.issueTitle'), t('feedback.sendFailed'), '⚠️');
      return;
    }
    setMessage('');
    onClose();
    showAppInfo(t('feedbackHub.issueTitle'), t('feedback.sentHint'), '✅');
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('feedbackHub.issueTitle')}
      sub={t('feedbackHub.issueBody')}
    >
      <ReplyNote email={email} />

      <TextInput
        value={message}
        onChangeText={setMessage}
        placeholder={t('feedbackHub.issuePlaceholder')}
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
    </Sheet>
  );
}

export function RequestFeatureSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { theme, config } = useApp();
  const { session } = useFinance();
  const { t } = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const email = session?.user?.email || null;

  const toggle = (id: string) =>
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const submit = async () => {
    const extra = note.trim();
    if (!picked.length && extra.length < 5) {
      showAppInfo(t('feedbackHub.featureTitle'), t('feedbackHub.pickSomething'), '✍️');
      return;
    }
    // Send the English ids as well as the labels: the inbox stays countable
    // even when the sender's app is in another language.
    const chosen = FEATURE_IDEAS.filter((idea) => picked.includes(idea.id));
    const lines = [
      ...chosen.map((idea) => `- ${idea.id} (${t(idea.titleKey)})`),
      ...(extra ? ['', extra] : []),
    ];

    setSending(true);
    const result = await sendFeedbackMessage({
      config: config.feedback,
      appName: config.appName || 'Pulse Wallet',
      topicLabel: t('feedback.topicIdea'),
      account: email || 'guest',
      message: lines.join('\n'),
    });
    setSending(false);
    if (result === 'notConfigured') {
      showAppInfo(t('feedbackHub.featureTitle'), t('feedback.notConfigured'), '⚠️');
      return;
    }
    if (result === 'failed') {
      showAppInfo(t('feedbackHub.featureTitle'), t('feedback.sendFailed'), '⚠️');
      return;
    }
    setPicked([]);
    setNote('');
    onClose();
    showAppInfo(t('feedbackHub.featureTitle'), t('feedbackHub.featureSent'), '✅');
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('feedbackHub.featureTitle')}
      sub={t('feedbackHub.featureBody')}
    >
      <View style={styles.ideaList}>
        {FEATURE_IDEAS.map((idea) => {
          const on = picked.includes(idea.id);
          return (
            <Pressable
              key={idea.id}
              onPress={() => toggle(idea.id)}
              style={[styles.ideaRow, on ? styles.ideaRowOn : null]}
            >
              <Text style={[styles.ideaTitle, on ? styles.ideaTitleOn : null]}>
                {t(idea.titleKey)}
              </Text>
              <View style={[styles.tick, on ? styles.tickOn : null]}>
                {on ? <Text style={styles.tickMark}>✓</Text> : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>{t('feedbackHub.otherIdea')}</Text>
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder={t('feedbackHub.otherIdeaPlaceholder')}
        placeholderTextColor={theme.muted}
        multiline
        textAlignVertical="top"
        style={[styles.input, styles.inputShort]}
      />

      <ReplyNote email={email} />

      <PrimaryButton
        title={sending ? t('common.saving') : t('feedbackHub.submit')}
        onPress={() => {
          if (!sending) void submit();
        }}
      />
    </Sheet>
  );
}

function makeStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
    sheetWrap: { width: '100%' },
    sheet: {
      backgroundColor: theme.card,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      borderWidth: 1.5,
      borderBottomWidth: 0,
      borderColor: theme.line,
      paddingHorizontal: 18,
      paddingTop: 8,
      paddingBottom: 18,
      maxHeight: '86%',
    },
    grabber: {
      alignSelf: 'center',
      width: 42,
      height: 4,
      borderRadius: 999,
      backgroundColor: theme.line,
      marginBottom: 10,
    },
    sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    sheetTitle: { flex: 1, color: theme.header, fontSize: 19, fontWeight: '900' },
    close: {
      width: 30,
      height: 30,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.accentSoft,
    },
    closeText: { color: theme.header, fontSize: 14, fontWeight: '900' },
    sheetSub: { color: theme.muted, fontSize: 13, lineHeight: 19, marginTop: 6 },
    sheetBody: { paddingTop: 14, gap: 12 },
    note: {
      backgroundColor: theme.accentSoft,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    noteText: { color: theme.ink, fontSize: 12.5, lineHeight: 18, fontWeight: '600' },
    noteEmail: { color: theme.header, fontWeight: '900' },
    label: {
      color: theme.muted,
      fontSize: 12,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
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
    inputShort: { minHeight: 76 },
    ideaList: { gap: 8 },
    ideaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderWidth: 1.5,
      borderColor: theme.line,
      backgroundColor: theme.bg,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 11,
    },
    ideaRowOn: { borderColor: theme.primary, backgroundColor: theme.accentSoft },
    ideaTitle: { flex: 1, color: theme.ink, fontSize: 14, fontWeight: '700' },
    ideaTitleOn: { color: theme.header, fontWeight: '900' },
    tick: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 1.5,
      borderColor: theme.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tickOn: { borderColor: theme.primary, backgroundColor: theme.primary },
    tickMark: { color: theme.ink, fontSize: 13, fontWeight: '900' },
  });
}
