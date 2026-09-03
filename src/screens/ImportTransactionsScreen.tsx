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
import { useRoute, type RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import { requireAuthToSave } from '../authGate';
import { showAppDialog, showAppInfo } from '../appDialog';
import { Card, PrimaryButton, Screen } from '../components/ui';
import { InfoPopup } from '../components/InfoPopup';
import { fmt } from '../theme';
import { useT } from '../i18n/useT';
import type { RootStackParamList } from '../navigation/types';
import {
  activeImportRules,
  DEFAULT_IMPORT_RULES,
  smsImportMonthBounds,
  splitPasteIntoMessages,
  type RawImportMessage,
} from '../lib/importRules';
import { isSmsInboxSupported, listRecentSms } from '../lib/smsInbox';
import {
  classifyImportMessages,
  forgetImportWriteMarks,
  writeImportRows,
  type ImportCandidateRow,
} from '../lib/autoSmsImport';
import { forgetImportFingerprints } from '../lib/importSeen';
import type { ThemeTokens, Transaction } from '../types';

/** A parsed match, plus whether it is already saved and so cannot be added again. */
type ImportRow = ImportCandidateRow;

/**
 * Primary flow: read Android SMS inbox → match credit/debit rules → add transactions.
 * Paste / screenshot are secondary fallbacks only.
 */
export function ImportTransactionsScreen() {
  const {
    theme,
    config,
    ready,
    finance,
    addTransaction,
    deleteTransaction,
    expenseCategories,
    incomeCategories,
    catMeta,
  } = useApp();
  const { t, catName } = useT();
  const route = useRoute<RouteProp<RootStackParamList, 'ImportTransactions'>>();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();

  const smsReady = Platform.OS === 'android' && isSmsInboxSupported();
  const [showFallbacks, setShowFallbacks] = useState(false);
  const [fallbackMode, setFallbackMode] = useState<'paste' | 'shot'>('paste');
  const [pasteText, setPasteText] = useState('');
  const [shotUri, setShotUri] = useState<string | null>(null);
  const [ocrText, setOcrText] = useState('');
  const [candidates, setCandidates] = useState<ImportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(
    null,
  );
  const [status, setStatus] = useState<string | null>(null);
  const [editingCatFp, setEditingCatFp] = useState<string | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const smsAskShown = useRef(false);
  const [lastImport, setLastImport] = useState<{
    ids: string[];
    fingerprints: string[];
    rows: ImportRow[];
  } | null>(null);
  const undoingRef = useRef(false);

  // Read through a ref so that saving a transaction does not rebuild the scan
  // callbacks underneath the effect that fires the first scan.
  const txnsRef = useRef<Transaction[]>(finance.transactions);
  txnsRef.current = finance.transactions;
  const importingRef = useRef(false);

  const setCandidateCategory = useCallback((fingerprint: string, category: string) => {
    setCandidates((prev) =>
      prev.map((c) => (c.fingerprint === fingerprint ? { ...c, category } : c)),
    );
    setEditingCatFp(null);
  }, []);

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

  const knownCategories = useMemo(
    () =>
      new Set([
        ...expenseCategories.map((c) => c.name),
        ...incomeCategories.map((c) => c.name),
      ]),
    [expenseCategories, incomeCategories],
  );

  const fallbackAccountId =
    finance.defaultAccountId ||
    finance.accounts.find((a) => !a.excluded)?.id ||
    finance.accounts[0]?.id;

  /**
   * The one place rows turn into transactions, shared by the Import button and
   * the automatic run, so an unattended import cannot drift from a reviewed one.
   * Returns counts and lets the caller word its own message.
   */
  const importRows = useCallback(
    async (rows: ImportRow[]) => {
      if (importingRef.current) {
        return { added: 0, skipped: 0, ids: [] as string[], fingerprints: [] as string[] };
      }
      importingRef.current = true;
      setImporting(true);
      setImportProgress({ current: 0, total: rows.length });
      try {
        const res = await writeImportRows(rows, {
          accounts: finance.accounts,
          fallbackAccountId,
          transactions: txnsRef.current,
          addTransaction,
          billImageUri: fallbackMode === 'shot' && shotUri ? shotUri : undefined,
          onProgress: (current, total) => setImportProgress({ current, total }),
        });
        // Drop what was added, and mark what was skipped so the row says why
        // rather than sitting there ticked and refusing to go in.
        setCandidates((prev) =>
          prev
            .filter((c) => !res.addedFingerprints.includes(c.fingerprint))
            .map((c) =>
              res.skippedFingerprints.includes(c.fingerprint)
                ? { ...c, alreadyImported: true, selected: false }
                : c,
            ),
        );
        return {
          added: res.added,
          skipped: res.skippedFingerprints.length,
          ids: res.addedIds,
          fingerprints: res.addedFingerprints,
        };
      } finally {
        setImporting(false);
        setImportProgress(null);
        importingRef.current = false;
      }
    },
    [addTransaction, fallbackAccountId, fallbackMode, finance.accounts, shotUri],
  );

  const applyMessages = useCallback(
    async (messages: RawImportMessage[], emptyHint: string) => {
      if (!rules.length) {
        setCandidates([]);
        setStatus(t('import.noRules'));
        return [];
      }
      const { rows: parsed, fresh, duplicates } = await classifyImportMessages(messages, {
        rules,
        knownCategories,
        transactions: txnsRef.current,
      });
      setCandidates(parsed);
      if (!parsed.length) {
        setStatus(emptyHint);
      } else if (!fresh.length) {
        setStatus(t('import.allSeen'));
      } else {
        const found = t('import.found').replace('{n}', String(fresh.length));
        setStatus(
          duplicates
            ? `${found} ${t('import.skippedDuplicates').replace('{n}', String(duplicates))}`
            : found,
        );
      }
      return fresh;
    },
    [rules, knownCategories, t],
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
    // Waiting for `ready` matters: the stored month range arrives from disk
    // after the first render. Never read SMS until the user says Yes.
    if (!ready || !smsReady || smsAskShown.current || config.features.smsImport === false) {
      return;
    }
    smsAskShown.current = true;
    if (route.params?.startSmsScan) {
      void scanSms();
      return;
    }
    showAppDialog({
      title: t('import.promptTitle'),
      message: t('import.promptBody'),
      icon: '📥',
      buttons: [
        { text: t('common.no'), style: 'cancel' },
        {
          text: t('common.yes'),
          style: 'primary',
          onPress: () => void scanSms(),
        },
      ],
    });
  }, [ready, smsReady, scanSms, config.features.smsImport, route.params?.startSmsScan, t]);

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
      prev.map((c) =>
        c.fingerprint === fp && !c.alreadyImported ? { ...c, selected: !c.selected } : c,
      ),
    );
  };

  // Select all used to tick everything, including rows it had already added, so
  // one tap after a second scan was enough to duplicate the month.
  const selectAllFresh = () => {
    setCandidates((prev) =>
      prev.map((c) => ({ ...c, selected: c.alreadyImported ? false : true })),
    );
  };

  const clearAllSelected = () => {
    setCandidates((prev) => prev.map((c) => ({ ...c, selected: false })));
  };

  const selected = candidates.filter((c) => c.selected);

  const undoImportBatch = useCallback(
    async (batch: { ids: string[]; fingerprints: string[]; rows: ImportRow[] }) => {
      if (undoingRef.current || !batch.ids.length) return;
      undoingRef.current = true;
      try {
        for (const id of batch.ids) {
          await deleteTransaction(id);
        }
        await forgetImportFingerprints(batch.fingerprints);
        forgetImportWriteMarks(batch.fingerprints);
        const fps = new Set(batch.rows.map((r) => r.fingerprint));
        setCandidates((prev) => {
          const restored = batch.rows.map((r) => ({
            ...r,
            selected: true,
            alreadyImported: false,
          }));
          return [...restored, ...prev.filter((c) => !fps.has(c.fingerprint))];
        });
        setLastImport((cur) =>
          cur && cur.ids.join() === batch.ids.join() ? null : cur,
        );
        showAppInfo(
          t('import.title'),
          t('import.undone').replace('{n}', String(batch.ids.length)),
          '↩️',
        );
      } finally {
        undoingRef.current = false;
      }
    },
    [deleteTransaction, t],
  );

  /**
   * Ledger rows a scanned SMS is responsible for. Newer imports carry the
   * fingerprint; ones added before that was stored are matched on what the SMS
   * itself decided, the same way the duplicate check finds them.
   */
  const importedTxnsFor = useCallback((row: ImportRow) => {
    const fingerprints = new Set([row.fingerprint, ...(row.relatedFingerprints || [])]);
    const keyed = txnsRef.current.filter(
      (txn) => !!txn.importKey && fingerprints.has(txn.importKey),
    );
    if (keyed.length) return keyed;

    // Same signature the duplicate check uses, and only the first match: two
    // real payments of the same amount on the same day must not both go.
    const note = (row.note || '').trim();
    const match = txnsRef.current.find(
      (txn) =>
        !txn.importKey &&
        txn.kind === row.kind &&
        txn.date === row.date &&
        Math.abs(txn.amount) === Math.abs(row.amount) &&
        (txn.note || '').trim() === note,
    );
    return match ? [match] : [];
  }, []);

  const forgetRow = useCallback(async (row: ImportRow) => {
    const fingerprints = [row.fingerprint, ...(row.relatedFingerprints || [])];
    await forgetImportFingerprints(fingerprints);
    forgetImportWriteMarks(fingerprints);
    setCandidates((prev) =>
      prev.map((c) =>
        c.fingerprint === row.fingerprint
          ? { ...c, alreadyImported: false, selected: false }
          : c,
      ),
    );
  }, []);

  /** Delete what an earlier scan added, so the row can be reviewed again. */
  const removeImportedRow = useCallback(
    (row: ImportRow) => {
      if (!requireAuthToSave('delete transactions')) return;
      const found = importedTxnsFor(row);
      if (!found.length) {
        void forgetRow(row);
        showAppInfo(t('import.title'), t('import.removeMissing'), 'ℹ️');
        return;
      }
      showAppDialog({
        title: t('import.removeTitle'),
        message: t('import.removeBody'),
        icon: '🗑',
        buttons: [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('common.delete'),
            style: 'destructive',
            onPress: () => {
              void (async () => {
                if (undoingRef.current) return;
                undoingRef.current = true;
                try {
                  for (const txn of found) {
                    await deleteTransaction(txn.id);
                  }
                  await forgetRow(row);
                  setLastImport((cur) =>
                    cur && cur.ids.some((id) => found.some((txn) => txn.id === id)) ? null : cur,
                  );
                  showAppInfo(
                    t('import.title'),
                    t('import.undone').replace('{n}', String(found.length)),
                    '🗑',
                  );
                } finally {
                  undoingRef.current = false;
                }
              })();
            },
          },
        ],
      });
    },
    [deleteTransaction, forgetRow, importedTxnsFor, t],
  );

  const runImport = () => {
    if (!requireAuthToSave('import transactions')) return;
    if (!selected.length) {
      showAppInfo(t('import.title'), t('import.noneSelected'), 'ℹ️');
      return;
    }
    const batch = selected;
    showAppDialog({
      title: t('import.confirmTitle'),
      message: t('import.confirmBody'),
      icon: '📥',
      buttons: [
        { text: t('common.no'), style: 'cancel' },
        {
          text: t('common.yes'),
          style: 'primary',
          onPress: () => {
            void (async () => {
              const { added, skipped, ids, fingerprints } = await importRows(batch);
              const done = t('import.done').replace('{n}', String(added));
              const body = skipped
                ? `${done} ${t('import.skippedDuplicates').replace('{n}', String(skipped))}`
                : done;
              if (!added) {
                showAppInfo(t('import.title'), body, 'ℹ️');
                return;
              }
              const saved = {
                ids,
                fingerprints,
                rows: batch.filter((r) => fingerprints.includes(r.fingerprint)),
              };
              setLastImport(saved);
              showAppDialog({
                title: t('import.title'),
                message: body,
                icon: '✅',
                buttons: [
                  {
                    text: t('import.undo'),
                    onPress: () => void undoImportBatch(saved),
                  },
                  { text: t('common.ok'), style: 'primary' },
                ],
              });
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
          <View style={styles.titleRow}>
            <Text style={[styles.smsTitle, { color: theme.ink }]}>{t('import.smsTitle')}</Text>
            <Pressable
              onPress={() => setAboutOpen(true)}
              hitSlop={8}
              style={[styles.infoBtn, { backgroundColor: theme.accentSoft }]}
              accessibilityRole="button"
              accessibilityLabel={t('import.aboutTitle')}
            >
              <Text style={[styles.infoMark, { color: theme.ink }]}>i</Text>
            </Pressable>
          </View>
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

        {lastImport && lastImport.ids.length > 0 ? (
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ color: theme.ink, flex: 1, lineHeight: 18 }}>
                {t('import.undoHint').replace('{n}', String(lastImport.ids.length))}
              </Text>
              <Pressable
                onPress={() => void undoImportBatch(lastImport)}
                hitSlop={8}
                disabled={undoingRef.current}
              >
                <Text style={{ color: theme.header, fontWeight: '800' }}>{t('import.undo')}</Text>
              </Pressable>
            </View>
          </Card>
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

        {candidates.length > 0 ? (
          <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 17, marginBottom: 8 }}>
            {t('import.categoryHint')}
          </Text>
        ) : null}

        {candidates.map((c) => {
          // A bill is a transfer with a fixed category, so there is nothing to
          // pick — it always settles the card.
          const isCardBill = c.kind === 'transfer';
          const meta = catMeta(c.category, c.kind === 'income' ? 'income' : 'expense');
          const editing = editingCatFp === c.fingerprint;
          const picker = c.kind === 'income' ? incomeCategories : expenseCategories;
          return (
            <View key={c.fingerprint}>
              <Pressable
                onPress={() => toggle(c.fingerprint)}
                disabled={c.alreadyImported}
                style={[
                  styles.row,
                  {
                    backgroundColor: theme.card,
                    borderColor: c.selected ? theme.primary : theme.line,
                    borderBottomLeftRadius: editing ? 0 : 14,
                    borderBottomRightRadius: editing ? 0 : 14,
                    borderBottomWidth: editing ? 0 : 1.5,
                    marginBottom: editing ? 0 : 10,
                    opacity: c.alreadyImported ? 0.55 : 1,
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
                  {c.alreadyImported ? (
                    <Text style={{ color: theme.muted, fontWeight: '800' }}>✓</Text>
                  ) : null}
                </View>
                {/* minWidth lets this column shrink; without it a long amount can
                    push the row wider than the screen and clip what follows. */}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: theme.ink, fontWeight: '700' }} numberOfLines={1}>
                    {c.kind === 'income' ? '+' : '-'}
                    {fmt(c.amount, config.currency)} ·{' '}
                    {isCardBill
                      ? t('import.kindCardBill')
                      : c.kind === 'income'
                        ? t('import.kindIncome')
                        : t('import.kindExpense')}
                  </Text>
                  <Text style={{ color: theme.muted, marginTop: 2 }} numberOfLines={2}>
                    {c.date} · {c.note} · {c.ruleName}
                  </Text>
                  <Text style={{ color: theme.muted, marginTop: 2, fontSize: 12 }} numberOfLines={2}>
                    {c.sourceLabel}
                  </Text>
                  {c.alreadyImported ? (
                    <View style={styles.dupeRow}>
                      <Text
                        style={[styles.dupeTag, { color: theme.muted, borderColor: theme.line }]}
                      >
                        {t('import.alreadyImported')}
                      </Text>
                      <Pressable onPress={() => removeImportedRow(c)} hitSlop={8}>
                        <Text style={{ color: theme.red, fontWeight: '800', fontSize: 12 }}>
                          {t('import.removeAdded')}
                        </Text>
                      </Pressable>
                    </View>
                  ) : null}
                  <Pressable
                    onPress={() => setEditingCatFp(editing ? null : c.fingerprint)}
                    disabled={c.alreadyImported || isCardBill}
                    hitSlop={6}
                    style={[
                      styles.catChip,
                      { borderColor: meta.color, backgroundColor: `${meta.color}1A` },
                    ]}
                  >
                    <Text style={styles.catChipIcon}>{meta.icon}</Text>
                    <Text
                      style={[styles.catChipLabel, { color: theme.ink }]}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {catName(c.category) || c.category}
                    </Text>
                    {isCardBill ? null : (
                      <Text style={[styles.catChipCaret, { color: theme.ink }]}>
                        {editing ? '▴' : '▾'}
                      </Text>
                    )}
                  </Pressable>
                </View>
              </Pressable>

              {editing ? (
                <View
                  style={[
                    styles.catPicker,
                    { backgroundColor: theme.card, borderColor: theme.primary },
                  ]}
                >
                  <Text style={{ color: theme.muted, fontSize: 12, marginBottom: 8 }}>
                    {t('import.pickCategory')}
                  </Text>
                  <View style={styles.catWrap}>
                    {picker.map((cat) => {
                      const on = cat.name === c.category;
                      return (
                        <Pressable
                          key={cat.name}
                          onPress={() => setCandidateCategory(c.fingerprint, cat.name)}
                          style={[
                            styles.catOption,
                            {
                              borderColor: on ? cat.color : theme.line,
                              backgroundColor: on ? `${cat.color}26` : 'transparent',
                            },
                          ]}
                        >
                          <Text style={{ color: theme.ink, fontSize: 12, fontWeight: on ? '800' : '600' }}>
                            {cat.icon} {catName(cat.name) || cat.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : null}
            </View>
          );
        })}

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
                ? t('import.importingProgress')
                    .replace(
                      '{current}',
                      String(
                        importProgress
                          ? Math.min(Math.max(importProgress.current, 1), importProgress.total)
                          : 1,
                      ),
                    )
                    .replace('{total}', String(importProgress?.total || selected.length))
                : t('import.importN').replace('{n}', String(selected.length))
            }
            onPress={() => {
              if (importing) return;
              runImport();
            }}
          />
        </View>
      ) : null}
      <InfoPopup
        visible={aboutOpen}
        onClose={() => setAboutOpen(false)}
        title={t('import.aboutTitle')}
        paragraphs={[t('import.aboutSms'), t('import.aboutMissing')]}
      />
    </Screen>
  );
}

function makeStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    pad: { padding: 16 },
    lead: { fontSize: 14, lineHeight: 20, marginBottom: 12 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
    smsTitle: { flex: 1, fontWeight: '800', fontSize: 16 },
    infoBtn: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    infoMark: { fontSize: 15, fontWeight: '800', lineHeight: 18 },
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
    // Icon, name and caret are separate children rather than one run of text, so
    // a narrow screen or a large system font shortens the name instead of
    // dropping it and leaving a bare caret behind.
    catChip: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      maxWidth: '100%',
      marginTop: 8,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      borderWidth: 1,
    },
    dupeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 10,
    },
    dupeTag: {
      alignSelf: 'flex-start',
      marginTop: 6,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderWidth: 1,
      borderRadius: 999,
      fontSize: 11,
      fontWeight: '700',
    },
    catChipIcon: { fontSize: 12 },
    catChipLabel: { flexShrink: 1, fontSize: 12, fontWeight: '700' },
    catChipCaret: { flexShrink: 0, fontSize: 12, fontWeight: '700' },
    catPicker: {
      marginBottom: 10,
      padding: 12,
      borderWidth: 1.5,
      borderTopWidth: 0,
      borderBottomLeftRadius: 14,
      borderBottomRightRadius: 14,
    },
    catWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    catOption: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
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
