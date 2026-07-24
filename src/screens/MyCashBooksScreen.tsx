import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useApp } from '../context/AppContext';
import { requireAuthToSave } from '../authGate';
import { showAppDialog, showAppInfo } from '../appDialog';
import { CASH_BOOK_ICONS } from '../cashBooks';
import { Card, PrimaryButton, Screen } from '../components/ui';
import type { CashBook } from '../types';
import { fmt } from '../theme';
import { useT } from '../i18n/useT';

export function MyCashBooksScreen() {
  const {
    theme,
    config,
    cashBooks,
    activeBook,
    setActiveBookId,
    createCashBook,
    renameCashBook,
    setCashBookIcon,
    setCashBookArchived,
    deleteCashBook,
  } = useApp();
  const { t } = useT();

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('📒');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const activeBooks = useMemo(
    () => cashBooks.books.filter((b) => !b.archived),
    [cashBooks.books],
  );
  const archivedBooks = useMemo(
    () => cashBooks.books.filter((b) => b.archived),
    [cashBooks.books],
  );

  const monthBalance = (book: CashBook) => {
    let income = 0;
    let expense = 0;
    for (const t of book.finance.transactions) {
      if (t.kind === 'income') income += t.amount;
      else if (t.kind === 'expense') expense += t.amount;
    }
    return income - expense;
  };

  const submitCreate = async () => {
    const err = await createCashBook({ name: newName, icon: newIcon });
    if (err) {
      showAppInfo(t('common.couldNotSave'), err, '⚠️');
      return;
    }
    setNewName('');
    setNewIcon('📒');
    setCreating(false);
  };

  const startRename = (book: CashBook) => {
    setEditingId(book.id);
    setEditName(book.name);
  };

  const submitRename = async () => {
    if (!editingId) return;
    const err = await renameCashBook(editingId, editName);
    if (err) {
      showAppInfo(t('common.couldNotSave'), err, '⚠️');
      return;
    }
    setEditingId(null);
    setEditName('');
  };

  const confirmArchive = (book: CashBook) => {
    showAppDialog({
      title: t('cashBooks.archiveTitle'),
      message: `Archive “${book.name}”? You can restore it later.`,
      icon: '📦',
      buttons: [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('cashBooks.archive'),
          style: 'destructive',
          onPress: () => {
            void setCashBookArchived(book.id, true).then((err) => {
              if (err) showAppInfo(t('common.couldNotSave'), err, '⚠️');
            });
          },
        },
      ],
    });
  };

  const confirmDelete = (book: CashBook) => {
    showAppDialog({
      title: t('cashBooks.deleteTitle'),
      message: `Permanently delete “${book.name}” and all of its transactions? This cannot be undone.`,
      icon: '🗑',
      buttons: [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            void deleteCashBook(book.id).then((err) => {
              if (err) showAppInfo(t('common.couldNotSave'), err, '⚠️');
            });
          },
        },
      ],
    });
  };

  const renderBook = (book: CashBook, archived: boolean) => {
    const selected = book.id === activeBook.id;
    const editing = editingId === book.id;
    return (
      <View
        key={book.id}
        style={[
          styles.bookRow,
          {
            borderColor: selected ? theme.primary : theme.line,
            backgroundColor: selected ? theme.bg : theme.card,
          },
        ]}
      >
        <Pressable
          disabled={archived}
          onPress={() => void setActiveBookId(book.id)}
          style={styles.bookMain}
        >
          <Text style={styles.bookIcon}>{book.icon}</Text>
          <View style={{ flex: 1 }}>
            {editing ? (
              <TextInput
                value={editName}
                onChangeText={setEditName}
                autoFocus
                style={[styles.editInput, { color: theme.ink, borderColor: theme.line }]}
                placeholderTextColor={theme.muted}
              />
            ) : (
              <Text style={[styles.bookName, { color: theme.ink }]}>
                {book.name}
                {selected ? ` (${t('common.default')})` : ''}
              </Text>
            )}
            <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>
              {book.finance.transactions.length} txn
              {book.finance.transactions.length === 1 ? '' : 's'} · net{' '}
              {fmt(monthBalance(book), config.currency)}
            </Text>
          </View>
        </Pressable>

        {editing ? (
          <View style={styles.actions}>
            <Pressable onPress={() => void submitRename()} style={styles.actionBtn}>
              <Text style={{ color: theme.primaryDark, fontWeight: '800' }}>{t('common.save')}</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setEditingId(null);
                setEditName('');
              }}
              style={styles.actionBtn}
            >
              <Text style={{ color: theme.muted, fontWeight: '700' }}>{t('common.cancel')}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.actions}>
            {!archived ? (
              <>
                <Pressable onPress={() => startRename(book)} style={styles.actionBtn}>
                  <Text style={{ color: theme.ink, fontWeight: '700', fontSize: 12 }}>
                    {t('cashBooks.rename')}
                  </Text>
                </Pressable>
                <Pressable onPress={() => confirmArchive(book)} style={styles.actionBtn}>
                  <Text style={{ color: theme.muted, fontWeight: '700', fontSize: 12 }}>
                    {t('cashBooks.archive')}
                  </Text>
                </Pressable>
              </>
            ) : (
              <Pressable
                onPress={() => void setCashBookArchived(book.id, false)}
                style={styles.actionBtn}
              >
                <Text style={{ color: theme.primaryDark, fontWeight: '700', fontSize: 12 }}>
                  {t('common.restore')}
                </Text>
              </Pressable>
            )}
            <Pressable onPress={() => confirmDelete(book)} style={styles.actionBtn}>
              <Text style={{ color: theme.red, fontWeight: '700', fontSize: 12 }}>
                {t('common.delete')}
              </Text>
            </Pressable>
          </View>
        )}

        {!archived && !editing ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.iconRow}
          >
            {CASH_BOOK_ICONS.map((ic) => (
              <Pressable
                key={ic}
                onPress={() => void setCashBookIcon(book.id, ic)}
                style={[
                  styles.iconChip,
                  {
                    borderColor: book.icon === ic ? theme.primary : theme.line,
                    backgroundColor: book.icon === ic ? theme.bg : theme.card,
                  },
                ]}
              >
                <Text style={{ fontSize: 16 }}>{ic}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
      </View>
    );
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.body}>
        <Card>
          <Text style={[styles.title, { color: theme.ink }]}>{t('cashBooks.title')}</Text>
          <Text style={[styles.hint, { color: theme.muted }]}>{t('cashBooks.hint')}</Text>
          <Text style={[styles.activeLine, { color: theme.ink }]}>
            {t('cashBooks.active')}: {activeBook.icon} {activeBook.name} ({t('common.default')})
          </Text>
        </Card>

        <Card>
          <View style={styles.sectionHead}>
            <Text style={[styles.sectionTitle, { color: theme.ink }]}>{t('cashBooks.books')}</Text>
            {!creating ? (
              <Pressable
                onPress={() => {
                  if (!requireAuthToSave('create a cash book')) return;
                  setCreating(true);
                }}
              >
                <Text style={{ color: theme.primaryDark, fontWeight: '800' }}>{t('cashBooks.new')}</Text>
              </Pressable>
            ) : null}
          </View>

          {creating ? (
            <View style={[styles.createBox, { borderColor: theme.line, backgroundColor: theme.bg }]}>
              <Text style={[styles.fieldLabel, { color: theme.muted }]}>{t('common.name')}</Text>
              <TextInput
                value={newName}
                onChangeText={setNewName}
                placeholder={t('cashBooks.namePlaceholder')}
                placeholderTextColor={theme.muted}
                style={[styles.editInput, { color: theme.ink, borderColor: theme.line }]}
              />
              <Text style={[styles.fieldLabel, { color: theme.muted, marginTop: 10 }]}>
                {t('common.icon')}
              </Text>
              <View style={styles.iconWrap}>
                {CASH_BOOK_ICONS.map((ic) => (
                  <Pressable
                    key={ic}
                    onPress={() => setNewIcon(ic)}
                    style={[
                      styles.iconChip,
                      {
                        borderColor: newIcon === ic ? theme.primary : theme.line,
                        backgroundColor: newIcon === ic ? theme.card : theme.bg,
                      },
                    ]}
                  >
                    <Text style={{ fontSize: 16 }}>{ic}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                <View style={{ flex: 1 }}>
                  <PrimaryButton title={t('cashBooks.create')} onPress={() => void submitCreate()} />
                </View>
                <View style={{ flex: 1 }}>
                  <PrimaryButton
                    title={t('common.cancel')}
                    danger
                    onPress={() => {
                      setCreating(false);
                      setNewName('');
                      setNewIcon('📒');
                    }}
                  />
                </View>
              </View>
            </View>
          ) : null}

          {activeBooks.map((b) => renderBook(b, false))}
          {activeBooks.length === 0 ? (
            <Text style={{ color: theme.muted }}>{t('cashBooks.empty')}</Text>
          ) : null}
        </Card>

        {archivedBooks.length > 0 ? (
          <Card>
            <Text style={[styles.sectionTitle, { color: theme.ink, marginBottom: 10 }]}>
              {t('cashBooks.archived')}
            </Text>
            {archivedBooks.map((b) => renderBook(b, true))}
          </Card>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 40 },
  title: { fontWeight: '900', fontSize: 18, marginBottom: 6 },
  hint: { lineHeight: 20, marginBottom: 10, fontSize: 13 },
  activeLine: { fontWeight: '800', fontSize: 14 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: { fontWeight: '900', fontSize: 16 },
  createBox: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  bookRow: {
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  bookMain: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bookIcon: { fontSize: 28 },
  bookName: { fontWeight: '800', fontSize: 16 },
  editInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontWeight: '700',
    fontSize: 15,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 10,
  },
  actionBtn: { paddingVertical: 2 },
  iconRow: { gap: 8, paddingTop: 10 },
  iconWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  iconChip: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
