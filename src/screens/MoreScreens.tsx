import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useApp } from '../context/AppContext';
import { useAlarms } from '../alarms/AlarmContext';
import { daysUntil } from '../alarms/engine';
import { GROCERY_CATEGORIES } from '../constants';
import { Card, EmptyState, Field, PrimaryButton, Screen } from '../components/ui';
import { DateField } from '../components/DateField';
import { TimeField, formatTime12h } from '../components/TimeField';
import { DropdownSelect } from '../components/DropdownSelect';
import {
  ChipRow,
  HintBox,
  MED_SLOTS,
  ModeToggle,
  OffsetPicker,
  ReminderPaneTabs,
  SectionLabel,
  WEEK_DAYS,
  offsetsLabel,
} from '../components/ReminderFormBits';
import { fmt, todayStr, uid } from '../utils';
import { requireAuthToSave } from '../authGate';
import { useFinance } from '../FinanceContext';
import { showAppDialog, showAppInfo } from '../appDialog';
import {
  confirmMarkExpensePaid,
  expensePaidSuccessMessage,
} from '../utils/markExpensePaid';
import {
  DEFAULT_FAMILY_MEMBER_OPTIONS,
  EXPENSE_REPEAT_OPTIONS,
  RECURRING_EXPENSE_TEMPLATES,
  getExpenseRepeat,
  isRepeatingExpense,
  nextDueDateForDayOfMonth,
  ordinalDay,
  templateForName,
  templateShowsPeople,
} from '../utils/recurringExpense';
import type {
  ExpenseReminder,
  ExpenseRepeat,
  GeneralReminder,
  GroceryReminder,
  MedReminder,
  ThemeTokens,
} from '../types';
import { useT } from '../i18n/useT';
import {
  medSlotLabel,
  personDisplayName,
  repeatOptionLabel,
  repeatShortLabel,
  templateDetailKeys,
  templateDisplayName,
  weekDayLabel,
} from '../i18n/reminderLabels';

function DueBadge({ date }: { date: string }) {
  const { theme } = useApp();
  const { t } = useT();
  const d = daysUntil(date);
  let label = '';
  let color = theme.muted;
  if (d < 0) {
    label = t('reminders.overdueNd').replace('{n}', String(Math.abs(d)));
    color = theme.red;
  } else if (d === 0) {
    label = t('reminders.today');
    color = theme.red;
  } else if (d === 1) {
    label = t('reminders.tomorrow');
    color = '#E5A100';
  } else if (d <= 3) {
    label = t('reminders.ndLeft').replace('{n}', String(d));
    color = '#E5A100';
  } else {
    label = t('reminders.ndLeft').replace('{n}', String(d));
    color = theme.green;
  }
  return <Text style={{ color, fontWeight: '800', fontSize: 12, marginTop: 4 }}>{label}</Text>;
}

function SearchField({
  value,
  onChangeText,
  placeholder,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
}) {
  const { theme } = useApp();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={theme.muted}
      style={{
        borderWidth: 1.5,
        borderColor: theme.line,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 11,
        marginBottom: 12,
        color: theme.ink,
        backgroundColor: theme.card,
        fontWeight: '600',
      }}
    />
  );
}

function ModeTag({ mode }: { mode: 'default' | 'custom' }) {
  const { theme } = useApp();
  const { t } = useT();
  return (
    <Text
      style={{
        marginTop: 4,
        fontSize: 11,
        fontWeight: '800',
        color: mode === 'custom' ? theme.accent : theme.muted,
      }}
    >
      {mode === 'custom' ? t('reminders.customTiming') : t('reminders.defaultTiming')}
    </Text>
  );
}

/* ---------------- Expense ---------------- */
export function ExpenseReminderScreen() {
  const { theme, config, finance, expenseReminders, setExpenseReminders, addTransaction, deleteTransaction } =
    useApp();
  const { t, lang } = useT();
  const expenseStyles = useMemo(() => makeExpenseStyles(theme), [theme]);
  const { isGuest } = useFinance();
  const { syncAlarmIfType } = useAlarms();
  const translatedOffsets = (offsets: number[], expiry = false) =>
    offsetsLabel(
      offsets,
      expiry ? t('reminders.offsetExpiry') : t('reminders.offsetDue'),
      t('reminders.offset1'),
      t('reminders.offsetNd'),
    );
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState(todayStr());
  const [repeat, setRepeat] = useState<ExpenseRepeat>('monthly');
  const [dayOfMonth, setDayOfMonth] = useState(String(new Date().getDate()));
  const [mode, setMode] = useState<'default' | 'custom'>('default');
  const [customTime, setCustomTime] = useState(config.alertTime);
  const [offsets, setOffsets] = useState<number[]>(config.expenseOffsets);
  const [alarmDurationSec, setAlarmDurationSec] = useState(String(config.alarmDurationSec));
  const [templateKey, setTemplateKey] = useState('');
  const [pane, setPane] = useState<'new' | 'existing'>(isGuest ? 'existing' : 'new');
  const [detail, setDetail] = useState('');
  const [forPeople, setForPeople] = useState<string[]>([]);
  const [customPerson, setCustomPerson] = useState('');
  const [peopleOptions, setPeopleOptions] = useState<string[]>([...DEFAULT_FAMILY_MEMBER_OPTIONS]);

  const templateOptions = useMemo(
    () => [
      ...RECURRING_EXPENSE_TEMPLATES.map((tmpl) => ({
        value: tmpl.name,
        label: `${tmpl.icon}  ${templateDisplayName(lang, tmpl.name)}`,
      })),
      { value: '__others__', label: `➕  ${t('reminders.others')}` },
    ],
    [lang, t],
  );

  const activeTemplate =
    templateKey === '__others__'
      ? undefined
      : templateForName(templateKey) || templateForName(name);
  const showPeoplePicker = !!(activeTemplate?.showPeople || templateShowsPeople(name));
  const detailKeys = activeTemplate ? templateDetailKeys(activeTemplate.name) : {};
  const detailLabel = detailKeys.label ? t(detailKeys.label) : t('reminders.detailsOptional');
  const detailHint = detailKeys.hint ? t(detailKeys.hint) : t('reminders.detailsPh');

  const reset = () => {
    setEditingId(null);
    setName('');
    setAmount('');
    setDueDate(todayStr());
    setRepeat('monthly');
    setDayOfMonth(String(new Date().getDate()));
    setMode('default');
    setCustomTime(config.alertTime);
    setOffsets(config.expenseOffsets);
    setAlarmDurationSec(String(config.alarmDurationSec));
    setTemplateKey('');
    setDetail('');
    setForPeople([]);
    setCustomPerson('');
  };

  const applyTemplate = (templateName: string) => {
    if (templateName === '__others__') {
      const dom = new Date().getDate();
      setTemplateKey('__others__');
      setName('');
      setAmount('');
      setRepeat('monthly');
      setDayOfMonth(String(dom));
      setDueDate(nextDueDateForDayOfMonth(dom));
      setDetail('');
      setForPeople([]);
      setCustomPerson('');
      return;
    }
    const tmpl = RECURRING_EXPENSE_TEMPLATES.find((x) => x.name === templateName);
    if (!tmpl) return;
    setTemplateKey(tmpl.name);
    setName(tmpl.name);
    setAmount(String(tmpl.amount));
    setRepeat(tmpl.defaultRepeat || 'monthly');
    setDayOfMonth(String(tmpl.dayOfMonth));
    setDueDate(nextDueDateForDayOfMonth(tmpl.dayOfMonth));
    setDetail('');
    setForPeople([]);
    setCustomPerson('');
  };

  const togglePerson = (person: string) => {
    setForPeople((prev) =>
      prev.includes(person) ? prev.filter((p) => p !== person) : [...prev, person],
    );
  };

  const addCustomPerson = () => {
    const p = customPerson.trim();
    if (!p) return;
    setPeopleOptions((prev) => (prev.includes(p) ? prev : [...prev, p]));
    setForPeople((prev) => (prev.includes(p) ? prev : [...prev, p]));
    setCustomPerson('');
  };

  const startEdit = (r: ExpenseReminder) => {
    if (!requireAuthToSave('edit reminders')) return;
    setEditingId(r.id);
    setName(r.name);
    setAmount(String(r.amount || ''));
    setDueDate(r.dueDate);
    setRepeat(getExpenseRepeat(r));
    const dom =
      r.dayOfMonth ||
      (r.dueDate ? parseInt(r.dueDate.split('-')[2], 10) : new Date().getDate());
    setDayOfMonth(String(dom));
    setMode(r.mode || 'default');
    setCustomTime(r.customTime || config.alertTime);
    setOffsets(r.offsets?.length ? r.offsets : config.expenseOffsets);
    setAlarmDurationSec(String(r.alarmDurationSec ?? config.alarmDurationSec));
    setTemplateKey(templateForName(r.name)?.name || '');
    setDetail(r.detail || '');
    setForPeople(r.forPeople || []);
    if (r.forPeople?.length) {
      setPeopleOptions((prev) => {
        const next = [...prev];
        r.forPeople!.forEach((p) => {
          if (!next.includes(p)) next.push(p);
        });
        return next;
      });
    }
    setCustomPerson('');
    setPane('new');
  };

  const save = async () => {
    if (!requireAuthToSave('save reminders')) return;
    if (!name.trim()) {
      Alert.alert(t('reminders.required'), t('reminders.enterName'));
      return;
    }
    if (showPeoplePicker && forPeople.length === 0) {
      Alert.alert(t('reminders.familyMembers'), t('reminders.selectPerson'));
      return;
    }
    const isRepeating = repeat !== 'once';
    const usesCalendarDate =
      repeat === 'once' ||
      repeat === 'quarterly' ||
      repeat === 'half_yearly' ||
      repeat === 'yearly';
    const domFromDue = dueDate ? parseInt(dueDate.split('-')[2], 10) : NaN;
    const dom = usesCalendarDate
      ? Math.min(31, Math.max(1, Number.isFinite(domFromDue) ? domFromDue : new Date().getDate()))
      : Math.min(31, Math.max(1, parseInt(dayOfMonth, 10) || 1));
    const resolvedDue = usesCalendarDate
      ? dueDate
      : editingId
        ? dueDate || nextDueDateForDayOfMonth(dom)
        : nextDueDateForDayOfMonth(dom);
    if (!resolvedDue) {
      Alert.alert(t('reminders.required'), t('reminders.pickDueDate'));
      return;
    }
    const existing = editingId ? expenseReminders.find((x) => x.id === editingId) : null;
    const payload: ExpenseReminder = {
      id: editingId || uid(),
      name: name.trim(),
      amount: parseFloat(amount) || 0,
      dueDate: resolvedDue,
      paid: existing?.paid || false,
      linkedTxnId: existing?.linkedTxnId ?? null,
      repeat,
      recurring: isRepeating,
      dayOfMonth: isRepeating ? dom : undefined,
      detail: detail.trim() || undefined,
      forPeople: showPeoplePicker && forPeople.length ? forPeople : undefined,
      mode,
      offsets: mode === 'custom' ? (offsets.length ? offsets : config.expenseOffsets) : config.expenseOffsets,
      customTime: mode === 'custom' ? customTime || config.alertTime : undefined,
      alarmDurationSec:
        mode === 'custom' ? parseInt(alarmDurationSec, 10) || 0 : undefined,
    };
    if (editingId) {
      await setExpenseReminders(expenseReminders.map((x) => (x.id === editingId ? payload : x)));
    } else {
      await setExpenseReminders([payload, ...expenseReminders]);
    }
    reset();
    setPane('existing');
  };

  const markPaid = (r: ExpenseReminder) => {
    confirmMarkExpensePaid(
      r,
      {
        expenseReminders,
        setExpenseReminders,
        finance,
        addTransaction,
        syncAlarmIfType,
        language: lang,
      },
      (result) => {
        if (result.nextDue) {
          Alert.alert(
            t('reminders.paidNextTitle'),
            expensePaidSuccessMessage(r, result, lang),
          );
        }
      },
    );
  };

  const list = useMemo(() => {
    const term = search.trim().toLowerCase();
    return expenseReminders
      .filter((r) => !term || r.name.toLowerCase().includes(term))
      .sort((a, b) => {
        // Active (unpaid / repeating) first, then by due date
        const aDone = a.paid && !isRepeatingExpense(a) ? 1 : 0;
        const bDone = b.paid && !isRepeatingExpense(b) ? 1 : 0;
        if (aDone !== bDone) return aDone - bDone;
        return a.dueDate.localeCompare(b.dueDate);
      });
  }, [expenseReminders, search]);

  const pending = expenseReminders
    .filter((r) => !r.paid || isRepeatingExpense(r))
    .reduce((s, r) => s + (r.paid && !isRepeatingExpense(r) ? 0 : r.amount), 0);

  const dayChoices = useMemo(() => Array.from({ length: 28 }, (_, i) => i + 1), []);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <ReminderPaneTabs
          pane={pane}
          onChange={(p) => {
            if (p === 'new' && !requireAuthToSave('add reminders')) return;
            if (p === 'new' && !editingId) reset();
            setPane(p);
          }}
          existingCount={expenseReminders.length}
        />

        {pane === 'new' ? (
          <Card>
            <DropdownSelect
              label={t('reminders.quickTemplates')}
              value={templateKey}
              placeholder={t('reminders.chooseTemplate')}
              options={templateOptions}
              onChange={applyTemplate}
            />
            <HintBox>{t('reminders.templateHint')}</HintBox>

            <Field
              label={t('reminders.expenseName')}
              value={name}
              onChangeText={setName}
              placeholder={t('reminders.expenseNamePh')}
            />
            <Field
              label={t('reminders.amountEditable')}
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
              placeholder={t('reminders.amountPh')}
            />

            <Field
              label={detailLabel}
              value={detail}
              onChangeText={setDetail}
              placeholder={detailHint}
            />

            {showPeoplePicker ? (
              <>
                <SectionLabel>{t('reminders.familyMembers')}</SectionLabel>
                <HintBox>{t('reminders.familyHint')}</HintBox>
                <ChipRow
                  options={peopleOptions}
                  selected={forPeople}
                  onToggle={togglePerson}
                  labelFor={(p) => personDisplayName(lang, p)}
                />
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Field
                      label={t('reminders.addPerson')}
                      value={customPerson}
                      onChangeText={setCustomPerson}
                      placeholder={t('reminders.addPersonPh')}
                    />
                  </View>
                  <PrimaryButton
                    title={t('common.add')}
                    onPress={addCustomPerson}
                    style={{ alignSelf: 'flex-end', marginBottom: 12, minWidth: 72 }}
                  />
                </View>
              </>
            ) : null}

            <SectionLabel>{t('reminders.schedule')}</SectionLabel>
            <ChipRow
              options={EXPENSE_REPEAT_OPTIONS.map((o) => o.id)}
              selected={[repeat]}
              multi={false}
              labelFor={(id) => repeatOptionLabel(lang, id as ExpenseRepeat)}
              onToggle={(id) => {
                const next = (id as ExpenseRepeat) || 'monthly';
                setRepeat(next);
                if (next === 'monthly') {
                  const dom = parseInt(dayOfMonth, 10) || new Date().getDate();
                  setDueDate(nextDueDateForDayOfMonth(dom));
                } else if (!dueDate) {
                  setDueDate(todayStr());
                }
              }}
            />

            {repeat === 'monthly' ? (
              <>
                <SectionLabel>{t('reminders.monthlyDay')}</SectionLabel>
                <View style={expenseStyles.dayGrid}>
                  {dayChoices.map((d) => {
                    const on = String(d) === dayOfMonth;
                    return (
                      <Pressable
                        key={d}
                        style={[expenseStyles.dayCell, on && expenseStyles.dayCellOn]}
                        onPress={() => {
                          setDayOfMonth(String(d));
                          setDueDate(nextDueDateForDayOfMonth(d));
                        }}
                      >
                        <Text style={[expenseStyles.dayCellText, on && expenseStyles.dayCellTextOn]}>{d}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <HintBox>
                  {t('reminders.nextDueMonthly')
                    .replace(
                      '{date}',
                      dueDate || nextDueDateForDayOfMonth(parseInt(dayOfMonth, 10) || 1),
                    )
                    .replace('{day}', ordinalDay(parseInt(dayOfMonth, 10) || 1))}
                </HintBox>
              </>
            ) : (
              <>
                <DateField
                  label={
                    repeat === 'once'
                      ? t('reminders.dueDate')
                      : t('reminders.nextDueDate').replace(
                          '{repeat}',
                          repeatShortLabel(lang, repeat).toLowerCase(),
                        )
                  }
                  value={dueDate}
                  onChange={(d) => {
                    setDueDate(d);
                    const day = parseInt(d.split('-')[2], 10);
                    if (Number.isFinite(day)) setDayOfMonth(String(day));
                  }}
                />
                {repeat !== 'once' ? (
                  <HintBox>
                    {t('reminders.pickNextPayment').replace(
                      '{period}',
                      repeat === 'quarterly'
                        ? t('reminders.period3m')
                        : repeat === 'half_yearly'
                          ? t('reminders.period6m')
                          : t('reminders.period1y'),
                    )}
                  </HintBox>
                ) : null}
              </>
            )}

            <SectionLabel>{t('reminders.remindTiming')}</SectionLabel>
            <ModeToggle mode={mode} onChange={setMode} />
            {mode === 'default' ? (
              <HintBox>
                {t('reminders.usesAdminSchedule')
                  .replace('{time}', formatTime12h(config.alertTime))
                  .replace('{offsets}', translatedOffsets(config.expenseOffsets))}
              </HintBox>
            ) : (
              <>
                <TimeField label={t('reminders.alertTime')} value={customTime} onChange={setCustomTime} />
                <SectionLabel>{t('reminders.remindMe')}</SectionLabel>
                <OffsetPicker selected={offsets} onChange={setOffsets} />
                <Field
                  label={t('reminders.alarmDuration')}
                  value={alarmDurationSec}
                  onChangeText={setAlarmDurationSec}
                  keyboardType="number-pad"
                />
              </>
            )}

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <PrimaryButton
                title={editingId ? t('reminders.updateReminder') : t('reminders.saveReminder')}
                onPress={save}
                style={{ flex: 1 }}
              />
              {editingId ? (
                <PrimaryButton
                  title={t('common.cancel')}
                  danger
                  onPress={() => {
                    reset();
                    setPane('existing');
                  }}
                />
              ) : null}
            </View>
          </Card>
        ) : (
          <>
            <SearchField
              value={search}
              onChangeText={setSearch}
              placeholder={t('reminders.searchExpense')}
            />
            <Text style={{ color: theme.muted, fontWeight: '700', marginBottom: 8 }}>
              {t('reminders.activePending')} {fmt(pending, config.currency)}
            </Text>

            {list.length === 0 ? (
              <EmptyState
                icon="💸"
                title={search ? t('reminders.noMatch') : t('reminders.noExpenseYet')}
                subtitle={t('reminders.emptyExpense')}
              />
            ) : (
              list.map((r) => (
                <Card key={r.id}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={{ color: theme.ink, fontWeight: '800' }}>
                        {templateDisplayName(lang, r.name)}
                        {r.detail?.trim() ? ` · ${r.detail.trim()}` : ''}
                      </Text>
                      <Text style={{ color: theme.muted }}>
                        {isRepeatingExpense(r)
                          ? `${repeatShortLabel(lang, getExpenseRepeat(r))} · ${ordinalDay(r.dayOfMonth || parseInt(r.dueDate.split('-')[2], 10) || 1)} · ${r.dueDate}`
                          : t('reminders.dueOn').replace('{date}', r.dueDate)}
                      </Text>
                      {r.forPeople?.length ? (
                        <Text style={{ color: theme.muted, marginTop: 2, fontSize: 12 }}>
                          {t('reminders.people').replace(
                            '{list}',
                            r.forPeople.map((p) => personDisplayName(lang, p)).join(', '),
                          )}
                        </Text>
                      ) : null}
                      <ModeTag mode={r.mode || 'default'} />
                      {isRepeatingExpense(r) ? (
                        <Text style={{ color: theme.accent, fontWeight: '700', marginTop: 4 }}>
                          🔁 {repeatShortLabel(lang, getExpenseRepeat(r))}
                        </Text>
                      ) : !r.paid ? (
                        <DueBadge date={r.dueDate} />
                      ) : (
                        <Text style={{ color: theme.green, fontWeight: '700', marginTop: 4 }}>
                          {t('reminders.paid')}
                        </Text>
                      )}
                    </View>
                    <Text style={{ color: theme.ink, fontWeight: '800' }}>
                      {fmt(r.amount, config.currency)}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    {(!r.paid || isRepeatingExpense(r)) && (
                      <PrimaryButton
                        title={
                          isRepeatingExpense(r) ? t('reminders.markPaidNext') : t('reminders.markPaid')
                        }
                        onPress={() => markPaid(r)}
                        style={{ flex: 1, minWidth: 140 }}
                      />
                    )}
                    {!isRepeatingExpense(r) && r.paid ? (
                      <PrimaryButton
                        title={t('reminders.paidCheck')}
                        onPress={async () => {
                          if (r.linkedTxnId) {
                            await deleteTransaction(r.linkedTxnId);
                          }
                          await setExpenseReminders(
                            expenseReminders.map((x) =>
                              x.id === r.id ? { ...x, paid: false, linkedTxnId: null } : x,
                            ),
                          );
                        }}
                        style={{ flex: 1, minWidth: 120 }}
                      />
                    ) : null}
                    <PrimaryButton title={t('common.edit')} onPress={() => startEdit(r)} />
                    <PrimaryButton
                      title={t('common.delete')}
                      danger
                      onPress={() => {
                        showAppDialog({
                          title: t('reminders.deleteReminder'),
                          message: t('reminders.deleteMsg').replace(
                            '{name}',
                            templateDisplayName(lang, r.name),
                          ),
                          icon: '🗑',
                          buttons: [
                            { text: t('common.cancel'), style: 'cancel' },
                            {
                              text: t('common.delete'),
                              style: 'destructive',
                              onPress: () => {
                                void setExpenseReminders(
                                  expenseReminders.filter((x) => x.id !== r.id),
                                );
                                if (editingId === r.id) reset();
                                syncAlarmIfType('expense', r.id);
                              },
                            },
                          ],
                        });
                      }}
                    />
                  </View>
                </Card>
              ))
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function makeExpenseStyles(theme: ThemeTokens) {
  return {
    dayGrid: {
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      gap: 6,
      marginBottom: 10,
    },
    dayCell: {
      width: 36,
      height: 36,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.line,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: '#fff',
    },
    dayCellOn: { backgroundColor: theme.header, borderColor: theme.header },
    dayCellText: { fontWeight: '800' as const, color: theme.ink, fontSize: 13 },
    dayCellTextOn: { color: '#fff' },
  };
}

/* ---------------- Medicine ---------------- */
export function MedicineReminderScreen() {
  const { theme, config, medReminders, setMedReminders } = useApp();
  const { t, lang } = useT();
  const { isGuest } = useFinance();
  const { syncAlarmIfType } = useAlarms();
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [frequency, setFrequency] = useState<'daily' | 'weekly'>('daily');
  const [days, setDays] = useState<string[]>([]);
  const [times, setTimes] = useState<string[]>(['Morning']);
  const [mode, setMode] = useState<'default' | 'custom'>('default');
  const [customTimes, setCustomTimes] = useState<Record<string, string>>({});
  const [alarmDurationSec, setAlarmDurationSec] = useState(String(config.alarmDurationSec));
  const [pane, setPane] = useState<'new' | 'existing'>(isGuest ? 'existing' : 'new');

  const reset = () => {
    setEditingId(null);
    setName('');
    setFrequency('daily');
    setDays([]);
    setTimes(['Morning']);
    setMode('default');
    setCustomTimes({});
    setAlarmDurationSec(String(config.alarmDurationSec));
  };

  const toggleTime = (slot: string) => {
    setTimes((prev) => (prev.includes(slot) ? prev.filter((t) => t !== slot) : [...prev, slot]));
  };

  const toggleDay = (d: string) => {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  };

  const startEdit = (m: MedReminder) => {
    if (!requireAuthToSave('edit reminders')) return;
    setEditingId(m.id);
    setName(m.name);
    setFrequency(m.frequency);
    setDays(m.days || []);
    setTimes(m.times?.length ? m.times : ['Morning']);
    setMode(m.mode || 'default');
    setCustomTimes(m.customTimes || {});
    setAlarmDurationSec(String(m.alarmDurationSec ?? config.alarmDurationSec));
    setPane('new');
  };

  const save = async () => {
    if (!requireAuthToSave('save reminders')) return;
    if (!name.trim() || times.length === 0) {
      Alert.alert(t('reminders.required'), t('reminders.enterNameTime'));
      return;
    }
    if (frequency === 'weekly' && days.length === 0) {
      Alert.alert(t('reminders.required'), t('reminders.selectWeeklyDay'));
      return;
    }
    const builtCustom: Record<string, string> = {};
    if (mode === 'custom') {
      times.forEach((slot) => {
        builtCustom[slot] =
          customTimes[slot] ||
          config.medicineTimes[slot as keyof typeof config.medicineTimes] ||
          '08:00';
      });
    }
    const payload: MedReminder = {
      id: editingId || uid(),
      name: name.trim(),
      frequency,
      days: frequency === 'weekly' ? days : [],
      times,
      customTimes: builtCustom,
      done: editingId ? medReminders.find((x) => x.id === editingId)?.done || {} : {},
      mode,
      alarmDurationSec: mode === 'custom' ? parseInt(alarmDurationSec, 10) || 0 : undefined,
    };
    if (editingId) {
      await setMedReminders(medReminders.map((x) => (x.id === editingId ? payload : x)));
    } else {
      await setMedReminders([payload, ...medReminders]);
    }
    reset();
    setPane('existing');
  };

  const markDone = async (id: string, slot: string) => {
    const day = todayStr();
    await setMedReminders(
      medReminders.map((m) => {
        if (m.id !== id) return m;
        const done = { ...(m.done || {}) };
        const dayMap = { ...(done[day] || {}) };
        dayMap[slot] = !dayMap[slot];
        done[day] = dayMap;
        return { ...m, done };
      }),
    );
    syncAlarmIfType('medicine', id);
  };

  const list = useMemo(() => {
    const term = search.trim().toLowerCase();
    return medReminders.filter((m) => !term || m.name.toLowerCase().includes(term));
  }, [medReminders, search]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <ReminderPaneTabs
          pane={pane}
          onChange={(p) => {
            if (p === 'new' && !requireAuthToSave('add reminders')) return;
            if (p === 'new' && !editingId) reset();
            setPane(p);
          }}
          existingCount={medReminders.length}
        />

        {pane === 'new' ? (
          <Card>
            <Field
              label={t('reminders.medicineName')}
              value={name}
              onChangeText={setName}
              placeholder={t('reminders.medicineNamePh')}
            />

            <SectionLabel>{t('reminders.frequency')}</SectionLabel>
            <ChipRow
              options={['daily', 'weekly']}
              selected={[frequency]}
              multi={false}
              labelFor={(v) => (v === 'daily' ? t('reminders.daily') : t('reminders.weekly'))}
              onToggle={(v) => setFrequency(v as 'daily' | 'weekly')}
            />
            {frequency === 'weekly' ? (
              <>
                <SectionLabel>{t('reminders.selectDays')}</SectionLabel>
                <ChipRow
                  options={[...WEEK_DAYS]}
                  selected={days}
                  onToggle={toggleDay}
                  labelFor={(d) => weekDayLabel(lang, d)}
                />
              </>
            ) : null}

            <SectionLabel>{t('reminders.times')}</SectionLabel>
            <ChipRow
              options={[...MED_SLOTS]}
              selected={times}
              onToggle={toggleTime}
              labelFor={(s) => medSlotLabel(lang, s)}
            />

            <SectionLabel>{t('reminders.remindTiming')}</SectionLabel>
            <ModeToggle mode={mode} onChange={setMode} />
            {mode === 'default' ? (
              <HintBox>
                {t('reminders.usesAdminMedTimes')
                  .replace('{morning}', formatTime12h(config.medicineTimes.Morning))
                  .replace('{afternoon}', formatTime12h(config.medicineTimes.Afternoon))
                  .replace('{evening}', formatTime12h(config.medicineTimes.Evening))}
              </HintBox>
            ) : (
              <>
                {times.length === 0 ? (
                  <HintBox>{t('reminders.selectTimeFirst')}</HintBox>
                ) : (
                  times.map((slot) => (
                    <TimeField
                      key={slot}
                      label={t('reminders.slotTime').replace('{slot}', medSlotLabel(lang, slot))}
                      value={
                        customTimes[slot] ||
                        config.medicineTimes[slot as keyof typeof config.medicineTimes] ||
                        '08:00'
                      }
                      onChange={(v) => setCustomTimes((prev) => ({ ...prev, [slot]: v }))}
                    />
                  ))
                )}
                <Field
                  label={t('reminders.alarmDuration')}
                  value={alarmDurationSec}
                  onChangeText={setAlarmDurationSec}
                  keyboardType="number-pad"
                />
              </>
            )}

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <PrimaryButton
                title={editingId ? t('reminders.updateMedicine') : t('reminders.addMedicine')}
                onPress={save}
                style={{ flex: 1 }}
              />
              {editingId ? (
                <PrimaryButton
                  title={t('common.cancel')}
                  danger
                  onPress={() => {
                    reset();
                    setPane('existing');
                  }}
                />
              ) : null}
            </View>
          </Card>
        ) : (
          <>
            <SearchField
              value={search}
              onChangeText={setSearch}
              placeholder={t('reminders.searchMedicine')}
            />

            {list.length === 0 ? (
              <EmptyState
                icon="💊"
                title={search ? t('reminders.noMedMatch') : t('reminders.noMedYet')}
                subtitle={t('reminders.emptyMedicine')}
              />
            ) : (
              list.map((m) => {
                const doneToday = m.done?.[todayStr()] || {};
                return (
                  <Card key={m.id}>
                    <Text style={{ color: theme.ink, fontWeight: '800', fontSize: 16 }}>{m.name}</Text>
                    <Text style={{ color: theme.muted, marginTop: 2 }}>
                      {m.frequency === 'weekly'
                        ? t('reminders.weeklyDays').replace(
                            '{days}',
                            m.days.map((d) => weekDayLabel(lang, d)).join(', '),
                          )
                        : t('reminders.daily')}
                    </Text>
                    <ModeTag mode={m.mode || 'default'} />
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                      {m.times.map((slot) => {
                        const label =
                          m.mode === 'custom' && m.customTimes?.[slot]
                            ? `${medSlotLabel(lang, slot)} (${formatTime12h(m.customTimes[slot])})`
                            : medSlotLabel(lang, slot);
                        return (
                          <Pressable
                            key={slot}
                            onPress={() => markDone(m.id, slot)}
                            style={{
                              backgroundColor: doneToday[slot] ? '#D6F0DF' : '#FBD8D8',
                              paddingHorizontal: 12,
                              paddingVertical: 8,
                              borderRadius: 8,
                            }}
                          >
                            <Text style={{ fontWeight: '700' }}>
                              {doneToday[slot] ? `✓ ${label}` : label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                      <PrimaryButton title={t('common.edit')} onPress={() => startEdit(m)} style={{ flex: 1 }} />
                      <PrimaryButton
                        title={t('common.delete')}
                        danger
                        onPress={() => {
                          showAppDialog({
                            title: t('reminders.deleteMedicine'),
                            message: t('reminders.deleteMsg').replace('{name}', m.name),
                            icon: '🗑',
                            buttons: [
                              { text: t('common.cancel'), style: 'cancel' },
                              {
                                text: t('common.delete'),
                                style: 'destructive',
                                onPress: () => {
                                  void setMedReminders(medReminders.filter((x) => x.id !== m.id));
                                  if (editingId === m.id) reset();
                                  syncAlarmIfType('medicine', m.id);
                                },
                              },
                            ],
                          });
                        }}
                      />
                    </View>
                  </Card>
                );
              })
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

/* ---------------- Grocery ---------------- */
export function GroceryReminderScreen() {
  const { theme, config, groceryReminders, setGroceryReminders } = useApp();
  const { t, catName } = useT();
  const { syncAlarmIfType } = useAlarms();
  const translatedOffsets = (offsets: number[]) =>
    offsetsLabel(
      offsets,
      t('reminders.offsetExpiry'),
      t('reminders.offset1'),
      t('reminders.offsetNd'),
    );
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [step, setStep] = useState<'list' | 'category' | 'item' | 'details'>('list');
  const [category, setCategory] = useState('');
  const [item, setItem] = useState('');
  const [icon, setIcon] = useState('🛒');
  const [customName, setCustomName] = useState('');
  const [expiryDate, setExpiryDate] = useState(todayStr());
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [mode, setMode] = useState<'default' | 'custom'>('default');
  const [customTime, setCustomTime] = useState(config.alertTime);
  const [offsets, setOffsets] = useState<number[]>(config.groceryOffsets);
  const [alarmDurationSec, setAlarmDurationSec] = useState(String(config.alarmDurationSec));

  const resetForm = () => {
    setEditingId(null);
    setStep('list');
    setCategory('');
    setItem('');
    setIcon('🛒');
    setCustomName('');
    setExpiryDate(todayStr());
    setQuantity('');
    setNote('');
    setMode('default');
    setCustomTime(config.alertTime);
    setOffsets(config.groceryOffsets);
    setAlarmDurationSec(String(config.alarmDurationSec));
  };

  const startAdd = () => {
    if (!requireAuthToSave('add reminders')) return;
    resetForm();
    setStep('category');
  };

  const startEdit = (g: GroceryReminder) => {
    if (!requireAuthToSave('edit reminders')) return;
    setEditingId(g.id);
    setCategory(g.category);
    setItem(g.item);
    setIcon(g.icon || '🛒');
    setExpiryDate(g.expiryDate);
    setQuantity(g.quantity || '');
    setNote(g.note || '');
    setMode(g.mode || 'default');
    setCustomTime(g.customTime || config.alertTime);
    setOffsets(g.offsets?.length ? g.offsets : config.groceryOffsets);
    setAlarmDurationSec(String(g.alarmDurationSec ?? config.alarmDurationSec));
    setStep('details');
  };

  const save = async () => {
    if (!requireAuthToSave('save reminders')) return;
    const finalItem = item.trim() || customName.trim();
    if (!finalItem || !expiryDate || !category) {
      Alert.alert(t('reminders.required'), t('reminders.pickGroceryFields'));
      return;
    }
    const payload: GroceryReminder = {
      id: editingId || uid(),
      category,
      item: finalItem,
      icon,
      expiryDate,
      quantity: quantity.trim() || undefined,
      note: note.trim() || undefined,
      mode,
      offsets: mode === 'custom' ? (offsets.length ? offsets : config.groceryOffsets) : config.groceryOffsets,
      customTime: mode === 'custom' ? customTime || config.alertTime : undefined,
      alarmDurationSec: mode === 'custom' ? parseInt(alarmDurationSec, 10) || 0 : undefined,
    };
    if (editingId) {
      await setGroceryReminders(groceryReminders.map((x) => (x.id === editingId ? payload : x)));
    } else {
      await setGroceryReminders([payload, ...groceryReminders]);
    }
    resetForm();
  };

  const list = useMemo(() => {
    const term = search.trim().toLowerCase();
    return groceryReminders
      .filter(
        (g) =>
          !term ||
          g.item.toLowerCase().includes(term) ||
          g.category.toLowerCase().includes(term),
      )
      .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
  }, [groceryReminders, search]);

  const groups = useMemo(() => {
    const expired: GroceryReminder[] = [];
    const soon: GroceryReminder[] = [];
    const fresh: GroceryReminder[] = [];
    list.forEach((g) => {
      const d = daysUntil(g.expiryDate);
      if (d < 0) expired.push(g);
      else if (d <= 3) soon.push(g);
      else fresh.push(g);
    });
    return { expired, soon, fresh };
  }, [list]);

  const cat = GROCERY_CATEGORIES.find((c) => c.name === category);

  if (step !== 'list') {
    return (
      <Screen>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <ReminderPaneTabs
            pane="new"
            onChange={(p) => {
              if (p === 'existing') resetForm();
            }}
            existingCount={groceryReminders.length}
          />
          <Pressable onPress={() => (step === 'category' ? resetForm() : setStep(step === 'details' ? (editingId ? 'list' : 'item') : 'category'))}>
            <Text style={{ color: theme.header, fontWeight: '800', marginBottom: 12 }}>
              ‹ {t('home.back')}
            </Text>
          </Pressable>

          {step === 'category' ? (
            <Card>
              <Text style={{ fontWeight: '800', fontSize: 18, marginBottom: 12, color: theme.ink }}>
                {t('reminders.selectCategoryTitle')}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {GROCERY_CATEGORIES.map((c) => (
                  <Pressable
                    key={c.name}
                    onPress={() => {
                      setCategory(c.name);
                      setStep('item');
                    }}
                    style={{
                      width: '47%',
                      backgroundColor: theme.bg,
                      borderRadius: 14,
                      padding: 14,
                      borderWidth: 1,
                      borderColor: theme.line,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 28 }}>{c.icon}</Text>
                    <Text style={{ fontWeight: '800', marginTop: 6, color: theme.ink }}>
                      {catName(c.name)}
                    </Text>
                    <Text style={{ color: theme.muted, fontSize: 11 }}>
                      {c.items.length} {t('reminders.itemsCount')}
                    </Text>
                  </Pressable>
                ))}
                <Pressable
                  onPress={() => {
                    setCategory('Others');
                    setIcon('🥡');
                    setItem('');
                    setStep('details');
                  }}
                  style={{
                    width: '47%',
                    backgroundColor: theme.bg,
                    borderRadius: 14,
                    padding: 14,
                    borderWidth: 1,
                    borderColor: theme.line,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontSize: 28 }}>🥡</Text>
                  <Text style={{ fontWeight: '800', marginTop: 6, color: theme.ink }}>
                    {t('reminders.others')}
                  </Text>
                  <Text style={{ color: theme.muted, fontSize: 11 }}>{t('reminders.customItem')}</Text>
                </Pressable>
              </View>
            </Card>
          ) : null}

          {step === 'item' && cat ? (
            <Card>
              <Text style={{ fontWeight: '800', fontSize: 18, marginBottom: 12, color: theme.ink }}>
                {catName(cat.name)}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {cat.items.map((it) => (
                  <Pressable
                    key={it.name}
                    onPress={() => {
                      setItem(it.name);
                      setIcon(it.icon);
                      setStep('details');
                    }}
                    style={{
                      width: '30%',
                      alignItems: 'center',
                      padding: 10,
                      borderRadius: 12,
                      backgroundColor: theme.bg,
                      borderWidth: 1,
                      borderColor: theme.line,
                    }}
                  >
                    <Text style={{ fontSize: 24 }}>{it.icon}</Text>
                    <Text style={{ fontSize: 11, fontWeight: '700', marginTop: 4, textAlign: 'center' }}>
                      {it.name}
                    </Text>
                  </Pressable>
                ))}
                <Pressable
                  onPress={() => {
                    setItem('');
                    setIcon('➕');
                    setStep('details');
                  }}
                  style={{
                    width: '30%',
                    alignItems: 'center',
                    padding: 10,
                    borderRadius: 12,
                    backgroundColor: theme.bg,
                    borderWidth: 1,
                    borderColor: theme.line,
                  }}
                >
                  <Text style={{ fontSize: 24 }}>➕</Text>
                  <Text style={{ fontSize: 11, fontWeight: '700', marginTop: 4 }}>
                    {t('reminders.others')}
                  </Text>
                </Pressable>
              </View>
            </Card>
          ) : null}

          {step === 'details' ? (
            <Card>
              <Text style={{ fontWeight: '800', fontSize: 16, color: theme.ink, marginBottom: 4 }}>
                {icon} {item || t('reminders.customItem')} · {catName(category)}
              </Text>
              {!item ? (
                <Field
                  label={t('reminders.itemName')}
                  value={customName}
                  onChangeText={setCustomName}
                  placeholder={t('reminders.itemNamePh')}
                />
              ) : null}
              <DateField
                label={t('reminders.expiryDate')}
                value={expiryDate}
                onChange={setExpiryDate}
              />
              <Field
                label={t('reminders.qtyOptional')}
                value={quantity}
                onChangeText={setQuantity}
                placeholder={t('reminders.qtyPh')}
              />
              <Field
                label={t('reminders.noteOptional')}
                value={note}
                onChangeText={setNote}
                placeholder={t('reminders.notePhSimple')}
              />

              <SectionLabel>{t('reminders.remindTiming')}</SectionLabel>
              <ModeToggle mode={mode} onChange={setMode} />
              {mode === 'default' ? (
                <HintBox>
                {t('reminders.usesAdminSchedule')
                  .replace('{time}', formatTime12h(config.alertTime))
                  .replace('{offsets}', translatedOffsets(config.groceryOffsets))}
              </HintBox>
              ) : (
                <>
                  <TimeField
                    label={t('reminders.alertTime')}
                    value={customTime}
                    onChange={setCustomTime}
                  />
                  <SectionLabel>{t('reminders.remindMe')}</SectionLabel>
                  <OffsetPicker selected={offsets} onChange={setOffsets} forExpiry />
                  <Field
                    label={t('reminders.alarmDuration')}
                    value={alarmDurationSec}
                    onChangeText={setAlarmDurationSec}
                    keyboardType="number-pad"
                  />
                </>
              )}
              <PrimaryButton
                title={editingId ? t('reminders.updateItem') : t('reminders.saveItem')}
                onPress={save}
              />
            </Card>
          ) : null}
        </ScrollView>
      </Screen>
    );
  }

  const renderGroup = (title: string, items: GroceryReminder[]) => {
    if (!items.length) return null;
    return (
      <View key={title} style={{ marginBottom: 8 }}>
        <Text style={{ fontWeight: '800', color: theme.ink, marginBottom: 8 }}>
          {title} ({items.length})
        </Text>
        {items.map((g) => (
          <Card key={g.id}>
            <Pressable onPress={() => startEdit(g)}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', gap: 12, flex: 1 }}>
                  <Text style={{ fontSize: 28 }}>{g.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.ink, fontWeight: '800' }}>{g.item}</Text>
                    <Text style={{ color: theme.muted }}>
                      {catName(g.category)}
                      {g.quantity ? ` · ${g.quantity}` : ''}
                    </Text>
                    <ModeTag mode={g.mode || 'default'} />
                    <DueBadge date={g.expiryDate} />
                  </View>
                </View>
              </View>
            </Pressable>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <PrimaryButton title={t('common.edit')} onPress={() => startEdit(g)} style={{ flex: 1 }} />
              <PrimaryButton
                title={t('common.delete')}
                danger
                onPress={() => {
                  showAppDialog({
                    title: t('reminders.deleteGrocery'),
                    message: t('reminders.deleteMsg').replace('{name}', g.item),
                    icon: '🗑',
                    buttons: [
                      { text: t('common.cancel'), style: 'cancel' },
                      {
                        text: t('common.delete'),
                        style: 'destructive',
                        onPress: () => {
                          void setGroceryReminders(groceryReminders.filter((x) => x.id !== g.id));
                          syncAlarmIfType('grocery', g.id);
                        },
                      },
                    ],
                  });
                }}
              />
            </View>
          </Card>
        ))}
      </View>
    );
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <ReminderPaneTabs
          pane="existing"
          onChange={(p) => {
            if (p === 'new') startAdd();
          }}
          existingCount={groceryReminders.length}
        />
        <SearchField
          value={search}
          onChangeText={setSearch}
          placeholder={t('reminders.searchGrocery')}
        />
        {list.length === 0 ? (
          <EmptyState
            icon="🥬"
            title={search ? t('reminders.noMatch') : t('reminders.grocery')}
            subtitle={t('reminders.emptyGrocery')}
          />
        ) : (
          <>
            {renderGroup(t('reminders.groupExpired'), groups.expired)}
            {renderGroup(t('reminders.groupSoon'), groups.soon)}
            {renderGroup(t('reminders.groupFresh'), groups.fresh)}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

/* ---------------- General ---------------- */
export function GeneralReminderScreen() {
  const { theme, config, generalReminders, setGeneralReminders } = useApp();
  const { t, lang } = useT();
  const { isGuest } = useFinance();
  const { syncAlarmIfType } = useAlarms();
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(todayStr());
  const [time, setTime] = useState('08:00');
  const [repeat, setRepeat] = useState<'once' | 'daily' | 'weekly'>('once');
  const [days, setDays] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [alarmDurationSec, setAlarmDurationSec] = useState(String(config.alarmDurationSec));
  const [pane, setPane] = useState<'new' | 'existing'>(isGuest ? 'existing' : 'new');

  const reset = () => {
    setEditingId(null);
    setTitle('');
    setDate(todayStr());
    setTime('08:00');
    setRepeat('once');
    setDays([]);
    setNote('');
    setAlarmDurationSec(String(config.alarmDurationSec));
  };

  const startEdit = (r: GeneralReminder) => {
    if (!requireAuthToSave('edit reminders')) return;
    setEditingId(r.id);
    setTitle(r.title);
    setDate(r.date);
    setTime(r.time);
    setRepeat(r.repeat);
    setDays(r.days || []);
    setNote(r.note || '');
    setAlarmDurationSec(String(r.alarmDurationSec ?? config.alarmDurationSec));
    setPane('new');
  };

  const save = async () => {
    if (!requireAuthToSave('save reminders')) return;
    if (!title.trim() || !date || !time) {
      Alert.alert(t('reminders.required'), t('reminders.enterTitleDateTime'));
      return;
    }
    if (repeat === 'weekly' && days.length === 0) {
      Alert.alert(t('reminders.required'), t('reminders.selectWeeklyDay'));
      return;
    }
    const payload: GeneralReminder = {
      id: editingId || uid(),
      title: title.trim(),
      date,
      time,
      repeat,
      days: repeat === 'weekly' ? days : [],
      note: note.trim() || undefined,
      done: editingId ? generalReminders.find((x) => x.id === editingId)?.done || false : false,
      doneDate: editingId ? generalReminders.find((x) => x.id === editingId)?.doneDate : undefined,
      alarmDurationSec: parseInt(alarmDurationSec, 10) || 0,
    };
    if (editingId) {
      await setGeneralReminders(generalReminders.map((x) => (x.id === editingId ? payload : x)));
    } else {
      await setGeneralReminders([payload, ...generalReminders]);
    }
    reset();
    setPane('existing');
  };

  const list = useMemo(() => {
    const term = search.trim().toLowerCase();
    return generalReminders
      .filter((r) => !term || r.title.toLowerCase().includes(term))
      .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  }, [generalReminders, search]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <ReminderPaneTabs
          pane={pane}
          onChange={(p) => {
            if (p === 'new' && !requireAuthToSave('add reminders')) return;
            if (p === 'new' && !editingId) reset();
            setPane(p);
          }}
          existingCount={generalReminders.length}
        />

        {pane === 'new' ? (
          <Card>
            <Field
              label={t('reminders.generalTitle')}
              value={title}
              onChangeText={setTitle}
              placeholder={t('reminders.titlePh')}
            />
            <DateField label={t('common.date')} value={date} onChange={setDate} />
            <TimeField label={t('reminders.time')} value={time} onChange={setTime} />

            <SectionLabel>{t('reminders.repeat')}</SectionLabel>
            <ChipRow
              options={['once', 'daily', 'weekly']}
              selected={[repeat]}
              multi={false}
              labelFor={(v) =>
                v === 'once'
                  ? t('reminders.once')
                  : v === 'daily'
                    ? t('reminders.daily')
                    : t('reminders.weekly')
              }
              onToggle={(v) => setRepeat(v as 'once' | 'daily' | 'weekly')}
            />
            {repeat === 'weekly' ? (
              <>
                <SectionLabel>{t('reminders.selectDays')}</SectionLabel>
                <ChipRow
                  options={[...WEEK_DAYS]}
                  selected={days}
                  onToggle={(d) =>
                    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]))
                  }
                  labelFor={(d) => weekDayLabel(lang, d)}
                />
              </>
            ) : null}

            <Field
              label={t('reminders.noteOptional')}
              value={note}
              onChangeText={setNote}
              placeholder={t('reminders.notePh')}
            />
            <Field
              label={t('reminders.alarmDuration')}
              value={alarmDurationSec}
              onChangeText={setAlarmDurationSec}
              keyboardType="number-pad"
            />

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <PrimaryButton
                title={editingId ? t('reminders.updateReminder') : t('reminders.saveReminder')}
                onPress={save}
                style={{ flex: 1 }}
              />
              {editingId ? (
                <PrimaryButton
                  title={t('common.cancel')}
                  danger
                  onPress={() => {
                    reset();
                    setPane('existing');
                  }}
                />
              ) : null}
            </View>
          </Card>
        ) : (
          <>
            <SearchField
              value={search}
              onChangeText={setSearch}
              placeholder={t('reminders.searchGeneral')}
            />

            {list.length === 0 ? (
              <EmptyState
                icon="🔔"
                title={search ? t('reminders.noMatch') : t('reminders.noGeneralYet')}
                subtitle={t('reminders.emptyGeneral')}
              />
            ) : (
              list.map((r) => {
                const repeatLabel =
                  r.repeat === 'once'
                    ? r.date
                    : r.repeat === 'daily'
                      ? t('reminders.everyDay')
                      : t('reminders.weeklyDays').replace(
                          '{days}',
                          r.days.map((d) => weekDayLabel(lang, d)).join(', '),
                        );
                return (
                  <Card key={r.id}>
                    <Text style={{ color: theme.ink, fontWeight: '800' }}>{r.title}</Text>
                    <Text style={{ color: theme.muted }}>
                      {repeatLabel} at {formatTime12h(r.time)}
                      {r.note ? ` · ${r.note}` : ''}
                    </Text>
                    {!r.done ? <DueBadge date={r.date} /> : (
                      <Text style={{ color: theme.green, fontWeight: '700', marginTop: 4 }}>
                        {t('reminders.done')}
                      </Text>
                    )}
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                      <PrimaryButton
                        title={r.done ? t('reminders.doneCheck') : t('reminders.markDone')}
                        onPress={async () => {
                          await setGeneralReminders(
                            generalReminders.map((x) =>
                              x.id === r.id
                                ? { ...x, done: !x.done, doneDate: todayStr() }
                                : x,
                            ),
                          );
                          syncAlarmIfType('general', r.id);
                        }}
                        style={{ flex: 1, minWidth: 110 }}
                      />
                      <PrimaryButton title={t('common.edit')} onPress={() => startEdit(r)} />
                      <PrimaryButton
                        title={t('common.delete')}
                        danger
                        onPress={() => {
                          showAppDialog({
                            title: t('reminders.deleteReminder'),
                            message: t('reminders.deleteMsg').replace('{name}', r.title),
                            icon: '🗑',
                            buttons: [
                              { text: t('common.cancel'), style: 'cancel' },
                              {
                                text: t('common.delete'),
                                style: 'destructive',
                                onPress: () => {
                                  void setGeneralReminders(
                                    generalReminders.filter((x) => x.id !== r.id),
                                  );
                                  if (editingId === r.id) reset();
                                  syncAlarmIfType('general', r.id);
                                },
                              },
                            ],
                          });
                        }}
                      />
                    </View>
                  </Card>
                );
              })
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
