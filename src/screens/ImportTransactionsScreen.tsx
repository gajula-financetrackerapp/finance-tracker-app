import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import { requireAuthToSave } from '../authGate';
import { showAppDialog, showAppInfo } from '../appDialog';
import { Card, PrimaryButton, Screen } from '../components/ui';
import { fmt } from '../theme';
import { useT } from '../i18n/useT';
import {
  activeImportRules,
  DEFAULT_IMPORT_RULES,
  parseImportMessages,
  resolveImportAccountId,
  smsImportMonthBounds,
  splitPasteIntoMessages,
  type ParsedImportCandidate,
  type RawImportMessage,
} from '../lib/importRules';
import { isSmsInboxSupported, listRecentSms } from '../lib/smsInbox';
import { loadSeenImportFingerprints, rememberImportFingerprints } from '../lib/importSeen';
import type { ThemeTokens } from '../types';

/**
 * Primary flow: read Android SMS inbox → match credit/debit rules → add transactions.
 * Paste / screenshot are secondary fallbacks only.
 */
export function ImportTransactionsScreen() {
  const { theme, config, finance, addTransaction } = useApp();
  const { t } = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();

  const smsReady = Platform.OS === 'android' && isSmsInboxSupported();
  const [showFallbacks, setShowFallbacks] = useState(false);
  const [fallbackMode, setFallbackMode] = useState<'paste' | 'shot'>('paste');
  const [pasteText, setPasteText] = useState('');
  const [shotUri, setShotUri] = useState<string | null>(null);
  const [ocrText, setOcrText] = useState('');
  const [candidates, setCandidates] = useState<ParsedImportCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const autoScanned = useRef(false);

  const monthRange =
    config.importRules?.smsMonthRange ?? DEFAULT_IMPORT_RULES.smsMonthRange;

  const rules = useMemo(
    () =>
      activeImportRules(
        config.importRules || {
          enabled: true,
          smsMonthRange: DEFAULT_IMPORT_RULES.smsMonthRange,
          rules: [],
        },
      ),
    [config.importRules],
  );

  const applyMessages = useCallback(
    async (messages: RawImportMessage[], emptyHint: string) => {
      if (!rules.length) {
        setCandidates([]);
        setStatus(t('import.noRules'));
        return;
      }
      const seen = await loadSeenImportFingerprints();
      const isSeen = (c: ParsedImportCandidate) =>
        seen.has(c.fingerprint) ||
        (c.relatedFingerprints || []).some((fp) => seen.has(fp));
      const parsed = parseImportMessages(messages, rules).map((c) => ({
        ...c,
        selected: !isSeen(c),
      }));
      const fresh = parsed.filter((c) => !isSeen(c));
      setCandidates(parsed);
      if (!parsed.length) {
        setStatus(emptyHint);
      } else if (!fresh.length) {
        setStatus(t('import.allSeen'));
      } else {
        setStatus(t('import.found').replace('{n}', String(fresh.length)));
      }
    },
    [rules, t],
  );

  const scanSms = useCallback(async () => {
    setLoading(true);
    setStatus(null);
    try {
      const range =
        config.importRules?.smsMonthRange ?? DEFAULT_IMPORT_RULES.smsMonthRange;
      const { minDateMs, maxDateMs } = smsImportMonthBounds(range);
      const res = await listRecentSms(minDateMs, maxDateMs, 400);
      if (res.error) {
        setCandidates([]);
        if (res.error === 'SMS_MODULE_MISSING') {
          setStatus(t('import.smsNeedBuild'));
          return;
        }
        if (res.error === 'SMS_PERMISSION_DENIED') {
          // Android never shows the dialog again after two denials, and never shows it
          // at all if READ_SMS is missing from the manifest — send the user to Settings.
          setStatus(t('import.smsDenied'));
          showAppDialog({
            title: t('import.smsDeniedTitle'),
            message: t('import.smsDenied'),
            icon: '🔒',
            buttons: [
              { text: t('common.cancel'), style: 'cancel' },
              { text: t('import.openSettings'), onPress: () => void Linking.openSettings() },
            ],
          });
          return;
        }
        setStatus(res.error);
        return;
      }
      await applyMessages(res.messages, t('import.smsEmpty'));
    } finally {
      setLoading(false);
    }
  }, [applyMessages, config.importRules?.smsMonthRange, t]);

  useEffect(() => {
    if (!smsReady || autoScanned.current || config.features.smsImport === false) return;
    autoScanned.current = true;
    void scanSms();
  }, [smsReady, scanSms, config.features.smsImport]);

  const scanPaste = async () => {
    setLoading(true);
    setStatus(null);
    try {
      await applyMessages(splitPasteIntoMessages(pasteText), t('import.pasteEmpty'));
    } finally {
      setLoading(false);
    }
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (!text.trim()) {
        showAppInfo(t('import.title'), t('import.clipboardEmpty'), '📋');
        return;
      }
      setPasteText(text);
    } catch {
      showAppInfo(t('import.title'), t('import.clipboardEmpty'), '📋');
    }
  };

  const pickScreenshot = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showAppInfo(t('import.title'), t('import.photoDenied'), '📷');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    });
    if (res.canceled || !res.assets?.[0]?.uri) return;
    setShotUri(res.assets[0].uri);
    try {
      const clip = await Clipboard.getStringAsync();
      if (clip.trim().length > 12) setOcrText(clip.trim());
    } catch {
      // ignore
    }
  };

  const scanScreenshotText = async () => {
    setLoading(true);
    setStatus(null);
    try {
      await applyMessages(splitPasteIntoMessages(ocrText), t('import.ocrEmpty'));
    } finally {
      setLoading(false);
    }
  };

  const toggle = (fp: string) => {
    setCandidates((prev) =>
      prev.map((c) => (c.fingerprint === fp ? { ...c, selected: !c.selected } : c)),
    );
  };

  const selectAllFresh = () => {
    setCandidates((prev) => prev.map((c) => ({ ...c, selected: true })));
  };

  const clearAllSelected = () => {
    setCandidates((prev) => prev.map((c) => ({ ...c, selected: false })));
  };

  const selected = candidates.filter((c) => c.selected);
  const fallbackAccountId =
    finance.defaultAccountId ||
    finance.accounts.find((a) => !a.excluded)?.id ||
    finance.accounts[0]?.id;

  const runImport = () => {
    if (!requireAuthToSave('import transactions')) return;
    if (!selected.length) {
      showAppInfo(t('import.title'), t('import.noneSelected'), 'ℹ️');
      return;
    }
    showAppDialog({
      title: t('import.confirmTitle'),
      message: t('import.confirmBody').replace('{n}', String(selected.length)),
      icon: '📥',
      buttons: [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('import.importBtn'),
          onPress: () => {
            void (async () => {
              setImporting(true);
              let ok = 0;
              const fps: string[] = [];
              for (const c of selected) {
                try {
                  const accountId =
                    resolveImportAccountId(finance.accounts, c.paymentType) || fallbackAccountId;
                  await addTransaction({
                    kind: c.kind,
                    category: c.category,
                    amount: c.amount,
                    date: c.date,
                    note: c.note,
                    accountId,
                    billImageUri: fallbackMode === 'shot' && shotUri ? shotUri : undefined,
                  });
                  ok += 1;
                  fps.push(c.fingerprint);
                  for (const rel of c.relatedFingerprints || []) fps.push(rel);
                } catch {
                  // continue
                }
              }
              await rememberImportFingerprints(fps);
              setCandidates((prev) => prev.filter((c) => !fps.includes(c.fingerprint)));
              setImporting(false);
              showAppInfo(t('import.title'), t('import.done').replace('{n}', String(ok)), '✅');
            })();
          },
        },
      ],
    });
  };

  if (config.features.smsImport === false) {
    return (
      <Screen>
        <View style={[styles.pad, { paddingBottom: insets.bottom + 24 }]}>
          <Card>
            <Text style={{ color: theme.ink, fontWeight: '700', fontSize: 16 }}>
              {t('import.disabledTitle')}
            </Text>
            <Text style={{ color: theme.muted, marginTop: 8, lineHeight: 20 }}>
              {t('import.disabledBody')}
            </Text>
          </Card>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[styles.pad, { paddingBottom: insets.bottom + 120 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.lead, { color: theme.muted }]}>{t('import.leadAuto')}</Text>

        <Card>
          <Text style={{ color: theme.ink, fontWeight: '800', fontSize: 16, marginBottom: 6 }}>
            {t('import.smsTitle')}
          </Text>
          {Platform.OS !== 'android' ? (
            <Text style={{ color: theme.muted, lineHeight: 20 }}>{t('import.smsIos')}</Text>
          ) : smsReady ? (
            <>
              <Text style={{ color: theme.muted, lineHeight: 20, marginBottom: 12 }}>
                {t(
                  monthRange === 'previous_month'
                    ? 'import.smsHintPreviousMonth'
                    : 'import.smsHintThisMonth',
                )}
              </Text>
              <PrimaryButton
                title={loading ? t('import.scanning') : t('import.scanSmsAuto')}
                onPress={() => {
                  if (loading) return;
                  void scanSms();
                }}
              />
            </>
          ) : (
            <>
              <Text style={{ color: theme.muted, lineHeight: 20, marginBottom: 8 }}>
                {t('import.smsNeedBuildDetail')}
              </Text>
              <Text style={{ color: theme.ink, fontWeight: '600', lineHeight: 20 }}>
                {t('import.smsNeedBuildAction')}
              </Text>
            </>
          )}
        </Card>

        {loading ? <ActivityIndicator color={theme.primary} style={{ marginVertical: 12 }} /> : null}

        {status ? (
          <Text style={{ color: theme.muted, marginBottom: 10, lineHeight: 18 }}>{status}</Text>
        ) : null}

        {candidates.length > 0 ? (
          <View style={styles.listHeader}>
            <Text style={{ color: theme.ink, fontWeight: '700' }}>
              {t('import.matches').replace('{n}', String(candidates.length))}
            </Text>
            <View style={styles.listHeaderActions}>
              <Pressable onPress={selectAllFresh} hitSlop={8}>
                <Text style={{ color: theme.primary, fontWeight: '700' }}>
                  {t('import.selectAll')}
                </Text>
              </Pressable>
              <Text style={{ color: theme.line, fontWeight: '700' }}>|</Text>
              <Pressable onPress={clearAllSelected} hitSlop={8} disabled={!selected.length}>
                <Text
                  style={{
                    color: selected.length ? theme.primary : theme.muted,
                    fontWeight: '700',
                  }}
                >
                  {t('import.clearAll')}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {candidates.map((c) => (
          <Pressable
            key={c.fingerprint}
            onPress={() => toggle(c.fingerprint)}
            style={[
              styles.row,
              {
                backgroundColor: theme.card,
                borderColor: c.selected ? theme.primary : theme.line,
              },
            ]}
          >
            <View
              style={[
                styles.check,
                {
                  backgroundColor: c.selected ? theme.primary : 'transparent',
                  borderColor: c.selected ? theme.primary : theme.line,
                },
              ]}
            >
              {c.selected ? <Text style={{ color: '#fff', fontWeight: '800' }}>✓</Text> : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.ink, fontWeight: '700' }}>
                {c.kind === 'income' ? '+' : '-'}
                {fmt(c.amount, config.currency)} ·{' '}
                {c.kind === 'income' ? 'Income' : 'Expense'} · {c.category}
              </Text>
              <Text style={{ color: theme.muted, marginTop: 2 }} numberOfLines={2}>
                {c.date} · {c.note} · {c.ruleName}
              </Text>
              <Text style={{ color: theme.muted, marginTop: 2, fontSize: 12 }} numberOfLines={2}>
                {c.sourceLabel}
              </Text>
            </View>
          </Pressable>
        ))}

        <Pressable onPress={() => setShowFallbacks((v) => !v)} style={{ marginTop: 8, marginBottom: 8 }}>
          <Text style={{ color: theme.muted, fontWeight: '600' }}>
            {showFallbacks ? t('import.hideFallbacks') : t('import.showFallbacks')}
          </Text>
        </Pressable>

        {showFallbacks ? (
          <Card>
            <View style={styles.tabs}>
              {(['paste', 'shot'] as const).map((key) => {
                const on = fallbackMode === key;
                return (
                  <Pressable
                    key={key}
                    onPress={() => setFallbackMode(key)}
                    style={[
                      styles.tab,
                      {
                        backgroundColor: on ? theme.primary : theme.bg,
                        borderColor: on ? theme.primary : theme.line,
                      },
                    ]}
                  >
                    <Text style={{ color: on ? '#fff' : theme.ink, fontWeight: '700', fontSize: 13 }}>
                      {key === 'paste' ? t('import.tabPaste') : t('import.tabShot')}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {fallbackMode === 'paste' ? (
              <>
                <Text style={{ color: theme.muted, lineHeight: 18, marginBottom: 10 }}>
                  {t('import.pasteHint')}
                </Text>
                <TextInput
                  value={pasteText}
                  onChangeText={setPasteText}
                  multiline
                  placeholder={t('import.pastePlaceholder')}
                  placeholderTextColor={theme.muted}
                  style={[
                    styles.input,
                    { color: theme.ink, borderColor: theme.line, backgroundColor: theme.bg },
                  ]}
                />
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                  <View style={{ flex: 1 }}>
                    <PrimaryButton title={t('import.fromClipboard')} onPress={() => void pasteFromClipboard()} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <PrimaryButton
                      title={loading ? t('import.scanning') : t('import.parsePaste')}
                      onPress={() => {
                        if (loading || !pasteText.trim()) return;
                        void scanPaste();
                      }}
                    />
                  </View>
                </View>
              </>
            ) : (
              <>
                <Text style={{ color: theme.muted, lineHeight: 18, marginBottom: 10 }}>
                  {t('import.shotHint')}
                </Text>
                <PrimaryButton title={t('import.pickShot')} onPress={() => void pickScreenshot()} />
                {shotUri ? (
                  <Image source={{ uri: shotUri }} style={styles.preview} resizeMode="cover" />
                ) : null}
                <Text style={{ color: theme.ink, fontWeight: '600', marginTop: 12, marginBottom: 6 }}>
                  {t('import.ocrLabel')}
                </Text>
                <TextInput
                  value={ocrText}
                  onChangeText={setOcrText}
                  multiline
                  placeholder={t('import.ocrPlaceholder')}
                  placeholderTextColor={theme.muted}
                  style={[
                    styles.input,
                    { color: theme.ink, borderColor: theme.line, backgroundColor: theme.bg },
                  ]}
                />
                <View style={{ marginTop: 10 }}>
                  <PrimaryButton
                    title={loading ? t('import.scanning') : t('import.parseOcr')}
                    onPress={() => {
                      if (loading || !ocrText.trim()) return;
                      void scanScreenshotText();
                    }}
                  />
                </View>
              </>
            )}
          </Card>
        ) : null}
      </ScrollView>

      {selected.length > 0 ? (
        <View
          style={[
            styles.footer,
            {
              backgroundColor: theme.card,
              borderTopColor: theme.line,
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
        >
          <PrimaryButton
            title={
              importing
                ? t('import.importing')
                : t('import.importN').replace('{n}', String(selected.length))
            }
            onPress={() => {
              if (importing) return;
              runImport();
            }}
          />
        </View>
      ) : null}
    </Screen>
  );
}

function makeStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    pad: { padding: 16 },
    lead: { fontSize: 14, lineHeight: 20, marginBottom: 12 },
    tabs: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    tab: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1,
      alignItems: 'center',
    },
    input: {
      minHeight: 100,
      borderWidth: 1,
      borderRadius: 12,
      padding: 12,
      textAlignVertical: 'top',
      fontSize: 14,
    },
    preview: {
      width: '100%',
      height: 160,
      borderRadius: 12,
      marginTop: 12,
      backgroundColor: theme.line,
    },
    listHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
      marginTop: 4,
    },
    listHeaderActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    row: {
      flexDirection: 'row',
      gap: 12,
      padding: 12,
      borderRadius: 14,
      borderWidth: 1.5,
      marginBottom: 10,
      alignItems: 'flex-start',
    },
    check: {
      width: 24,
      height: 24,
      borderRadius: 8,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },
    footer: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: 16,
      paddingTop: 12,
      borderTopWidth: 1,
    },
  });
}
