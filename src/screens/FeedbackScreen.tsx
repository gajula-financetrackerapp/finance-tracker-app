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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import { useFinance } from '../FinanceContext';
import { Card, PrimaryButton, Screen } from '../components/ui';
import { requireAuthToSave } from '../authGate';
import { showAppInfo } from '../appDialog';
import { sendFeedbackMessage } from '../lib/feedbackChannel';
import { useT } from '../i18n/useT';
import type { ThemeTokens } from '../types';

const TOPICS = ['bug', 'idea', 'other'] as const;
type Topic = (typeof TOPICS)[number];

export function FeedbackScreen() {
  const insets = useSafeAreaInsets();
  const { theme, config } = useApp();
  const { session } = useFinance();
  const { t } = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [topic, setTopic] = useState<Topic>('idea');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const topicLabel = (id: Topic) => {
    if (id === 'bug') return t('feedback.topicBug');
    if (id === 'idea') return t('feedback.topicIdea');
    return t('feedback.topicOther');
  };

  const onSend = async () => {
    if (!requireAuthToSave('send feedback')) return;

    const text = message.trim();
    if (text.length < 5) {
      showAppInfo(t('settings.feedback'), t('feedback.tooShort'), '✍️');
      return;
    }

    setSending(true);
    const result = await sendFeedbackMessage({
      config: config.feedback,
      appName: config.appName || 'Pulse Wallet',
      topicLabel: topicLabel(topic),
      account: session?.user?.email || 'guest',
      message: text,
    });
    setSending(false);

    if (result === 'notConfigured') {
      showAppInfo(t('settings.feedback'), t('feedback.notConfigured'), '⚠️');
      return;
    }
    if (result === 'failed') {
      showAppInfo(t('settings.feedback'), t('feedback.sendFailed'), '⚠️');
      return;
    }
    setMessage('');
    showAppInfo(t('settings.feedback'), t('feedback.sentHint'), '✅');
  };

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
            <Text style={[styles.title, { color: theme.ink }]}>{t('settings.feedback')}</Text>
            <Text style={[styles.hint, { color: theme.muted }]}>{t('feedback.intro')}</Text>
          </Card>

          <Card>
            <Text style={[styles.label, { color: theme.muted }]}>{t('feedback.topic')}</Text>
            <View style={styles.topics}>
              {TOPICS.map((id) => {
                const on = topic === id;
                return (
                  <Pressable
                    key={id}
                    onPress={() => {
                      if (!requireAuthToSave('send feedback')) return;
                      setTopic(id);
                    }}
                    style={[
                      styles.topicChip,
                      {
                        borderColor: on ? theme.header : theme.line,
                        backgroundColor: on ? theme.accentSoft : theme.bg,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.topicChipText,
                        { color: on ? theme.header : theme.ink },
                      ]}
                    >
                      {topicLabel(id)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.label, { color: theme.muted }]}>{t('feedback.message')}</Text>
            <TextInput
              value={message}
              onChangeText={(text) => {
                if (!requireAuthToSave('send feedback')) return;
                setMessage(text);
              }}
              placeholder={t('feedback.placeholder')}
              placeholderTextColor={theme.muted}
              multiline
              textAlignVertical="top"
              style={[
                styles.input,
                { color: theme.ink, borderColor: theme.line, backgroundColor: theme.bg },
              ]}
            />

            <PrimaryButton
              title={sending ? t('common.saving') : t('feedback.send')}
              onPress={() => {
                if (!sending) void onSend();
              }}
            />
          </Card>
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
    topics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
    topicChip: {
      borderWidth: 1.5,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    topicChipText: { fontWeight: '800', fontSize: 13 },
    input: {
      minHeight: 140,
      borderWidth: 1.5,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 12,
      fontSize: 15,
      fontWeight: '600',
      marginBottom: 14,
    },
  });
}
