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
import { theme as pulse } from '../theme';
import { fmt, todayStr, uid } from '../utils';
import { requireAuthToSave } from '../authGate';
import { useFinance } from '../FinanceContext';
import {
  confirmMarkExpensePaid,
  expensePaidSuccessMessage,
} from '../utils/markExpensePaid';
import {
  DEFAULT_FAMILY_MEMBER_OPTIONS,
  EXPENSE_REPEAT_OPTIONS,
  RECURRING_EXPENSE_TEMPLATES,
  expenseRepeatShortLabel,
  formatExpenseReminderLabel,
  getExpenseRepeat,
  isRepeatingExpense,
  nextDueDateForDayOfMonth,
  ordinalDay,
  templateForName,
  templateShowsPeople,
} from '../utils/recurringExpense';
import type { ExpenseReminder, ExpenseRepeat, GeneralReminder, GroceryReminder, MedReminder } from '../types';

function DueBadge({ date }: { date: string }) {
  const d = daysUntil(date);
  let label = '';
  let color = pulse.muted;
  if (d < 0) {
    label = `Overdue ${Math.abs(d)}d`;
    color = pulse.red;
  } else if (d === 0) {
    label = 'Today';
    color = pulse.red;
  } else if (d === 1) {
    label = 'Tomorrow';
    color = '#E5A100';
  } else if (d <= 3) {
    label = `${d}d left`;
    color = '#E5A100';
  } else {
    label = `${d}d left`;
    color = pulse.green;
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
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={pulse.muted}
      style={{
        borderWidth: 1.5,
        borderColor: pulse.line,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 11,
        marginBottom: 12,
        color: pulse.ink,
        backgroundColor: pulse.card,
        fontWeight: '600',
      }}
    />
  );
}

function ModeTag({ mode }: { mode: 'default' | 'custom' }) {
  return (
    <Text
      style={{
        marginTop: 4,
        fontSize: 11,
        fontWeight: '800',
        color: mode === 'custom' ? pulse.accent : pulse.muted,
      }}
    >
      {mode === 'custom' ? 'Custom timing' : 'Default timing'}
    </Text>
  );
}

/* ---------------- Expense ---------------- */
export function ExpenseReminderScreen() {
  const { theme, config, finance, expenseReminders, setExpenseReminders, addTransaction, deleteTransaction } =
    useApp();
  const { isGuest } = useFinance();
  const { syncAlarmIfType } = useAlarms();
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
    () =>
      RECURRING_EXPENSE_TEMPLATES.map((t) => ({
        value: t.name,
        label: `${t.icon}  ${t.name}`,
      })),
    [],
  );

  const activeTemplate = templateForName(templateKey) || templateForName(name);
  const showPeoplePicker = !!(activeTemplate?.showPeople || templateShowsPeople(name));
  const detailLabel = activeTemplate?.detailLabel || 'Details (optional)';
  const detailHint = activeTemplate?.detailHint || 'e.g. Netflix, plan name, account note';

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
    const t = RECURRING_EXPENSE_TEMPLATES.find((x) => x.name === templateName);
    if (!t) return;
    setTemplateKey(t.name);
    setName(t.name);
    setAmount(String(t.amount));
    setRepeat(t.defaultRepeat || 'monthly');
    setDayOfMonth(String(t.dayOfMonth));
    setDueDate(nextDueDateForDayOfMonth(t.dayOfMonth));
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
      Alert.alert('Required', 'Enter a name');
      return;
    }
    if (showPeoplePicker && forPeople.length === 0) {
      Alert.alert('Family members', 'Select at least one person for this phone bill reminder.');
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
      Alert.alert('Required', 'Pick a due date');
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
      },
      (result) => {
        if (result.nextDue) {
          Alert.alert('Paid · next period set', expensePaidSuccessMessage(r, result));
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
              label="Quick templates (monthly)"
              value={templateKey}
              placeholder="— Choose a template —"
              options={templateOptions}
              onChange={applyTemplate}
            />
            <HintBox>
              Pick a template to prefill name, amount, and monthly day — then adjust anything before saving.
            </HintBox>

            <Field label="Expense name" value={name} onChangeText={setName} placeholder="e.g. Internet bill" />
            <Field
              label="Amount (editable anytime)"
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
              placeholder="e.g. 799"
            />

            <Field
              label={detailLabel}
              value={detail}
              onChangeText={setDetail}
              placeholder={detailHint}
            />

            {showPeoplePicker ? (
              <>
                <SectionLabel>Remind for family members</SectionLabel>
                <HintBox>
                  Choose who this phone bill covers. Add a custom name if someone isn’t listed.
                </HintBox>
                <ChipRow
                  options={peopleOptions}
                  selected={forPeople}
                  onToggle={togglePerson}
                />
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Field
                      label="Add person"
                      value={customPerson}
                      onChangeText={setCustomPerson}
                      placeholder="e.g. Grandma"
                    />
                  </View>
                  <PrimaryButton
                    title="Add"
                    onPress={addCustomPerson}
                    style={{ alignSelf: 'flex-end', marginBottom: 12, minWidth: 72 }}
                  />
                </View>
              </>
            ) : null}

            <SectionLabel>Schedule</SectionLabel>
            <ChipRow
              options={EXPENSE_REPEAT_OPTIONS.map((o) => o.label)}
              selected={[EXPENSE_REPEAT_OPTIONS.find((o) => o.id === repeat)?.label || 'Monthly']}
              multi={false}
              onToggle={(label) => {
                const next = EXPENSE_REPEAT_OPTIONS.find((o) => o.label === label)?.id || 'monthly';
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
                <SectionLabel>Remind on this day every month</SectionLabel>
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
                  {`Next due ${dueDate || nextDueDateForDayOfMonth(parseInt(dayOfMonth, 10) || 1)} · every month on the ${ordinalDay(parseInt(dayOfMonth, 10) || 1)}.`}
                </HintBox>
              </>
            ) : (
              <>
                <DateField
                  label={
                    repeat === 'once'
                      ? 'Due date'
                      : `Next due date (${expenseRepeatShortLabel(repeat).toLowerCase()})`
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
                    {`Pick day, month & year for the next payment. After Mark Paid, it advances ${
                      repeat === 'quarterly'
                        ? '3 months'
                        : repeat === 'half_yearly'
                          ? '6 months'
                          : '1 year'
                    } from that date.`}
                  </HintBox>
                ) : null}
              </>
            )}

            <SectionLabel>Reminder timing</SectionLabel>
            <ModeToggle mode={mode} onChange={setMode} />
            {mode === 'default' ? (
              <HintBox>
                {`Uses admin schedule — alerts at ${formatTime12h(config.alertTime)} on: ${offsetsLabel(config.expenseOffsets)}.`}
              </HintBox>
            ) : (
              <>
                <TimeField label="Alert time" value={customTime} onChange={setCustomTime} />
                <SectionLabel>Remind me</SectionLabel>
                <OffsetPicker selected={offsets} onChange={setOffsets} />
                <Field
                  label="Alarm duration (seconds, 0 = until dismissed)"
                  value={alarmDurationSec}
                  onChangeText={setAlarmDurationSec}
                  keyboardType="number-pad"
                />
              </>
            )}

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <PrimaryButton
                title={editingId ? 'Update Reminder' : '+ Save Reminder'}
                onPress={save}
                style={{ flex: 1 }}
              />
              {editingId ? (
                <PrimaryButton
                  title="Cancel"
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
            <SearchField value={search} onChangeText={setSearch} placeholder="Search expense reminders…" />
            <Text style={{ color: theme.muted, fontWeight: '700', marginBottom: 8 }}>
              Active monthly / pending: {fmt(pending, config.currency)}
            </Text>

            {list.length === 0 ? (
              <EmptyState
                icon="💸"
                title={search ? 'No matching reminders' : 'No expense reminders yet'}
                subtitle="Switch to New to add a bill or subscription."
              />
            ) : (
              list.map((r) => (
                <Card key={r.id}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={{ color: theme.ink, fontWeight: '800' }}>
                        {formatExpenseReminderLabel(r)}
                      </Text>
                      <Text style={{ color: theme.muted }}>
                        {isRepeatingExpense(r)
                          ? `${expenseRepeatShortLabel(getExpenseRepeat(r))} · ${ordinalDay(r.dayOfMonth || parseInt(r.dueDate.split('-')[2], 10) || 1)} · next ${r.dueDate}`
                          : `Due ${r.dueDate}`}
                      </Text>
                      {r.detail || r.forPeople?.length ? (
                        <Text style={{ color: theme.muted, marginTop: 2, fontSize: 12 }}>
                          {[r.detail, r.forPeople?.length ? `People: ${r.forPeople.join(', ')}` : '']
                            .filter(Boolean)
                            .join(' · ')}
                        </Text>
                      ) : null}
                      <ModeTag mode={r.mode || 'default'} />
                      {isRepeatingExpense(r) ? (
                        <Text style={{ color: pulse.accent, fontWeight: '700', marginTop: 4 }}>
                          🔁 {expenseRepeatShortLabel(getExpenseRepeat(r))}
                        </Text>
                      ) : !r.paid ? (
                        <DueBadge date={r.dueDate} />
                      ) : (
                        <Text style={{ color: pulse.green, fontWeight: '700', marginTop: 4 }}>Paid</Text>
                      )}
                    </View>
                    <Text style={{ color: theme.ink, fontWeight: '800' }}>
                      {fmt(r.amount, config.currency)}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    {(!r.paid || isRepeatingExpense(r)) && (
                      <PrimaryButton
                        title={isRepeatingExpense(r) ? 'Mark Paid → next period' : 'Mark as Paid'}
                        onPress={() => markPaid(r)}
                        style={{ flex: 1, minWidth: 140 }}
                      />
                    )}
                    {!isRepeatingExpense(r) && r.paid ? (
                      <PrimaryButton
                        title="✓ Paid"
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
                    <PrimaryButton title="Edit" onPress={() => startEdit(r)} />
                    <PrimaryButton
                      title="Delete"
                      danger
                      onPress={() => {
                        setExpenseReminders(expenseReminders.filter((x) => x.id !== r.id));
                        if (editingId === r.id) reset();
                        syncAlarmIfType('expense', r.id);
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

const expenseStyles = {
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
    borderColor: pulse.line,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: '#fff',
  },
  dayCellOn: { backgroundColor: pulse.header, borderColor: pulse.header },
  dayCellText: { fontWeight: '800' as const, color: pulse.ink, fontSize: 13 },
  dayCellTextOn: { color: '#fff' },
};

/* ---------------- Medicine ---------------- */
export function MedicineReminderScreen() {
  const { theme, config, medReminders, setMedReminders } = useApp();
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
      Alert.alert('Required', 'Enter a name and select at least one time');
      return;
    }
    if (frequency === 'weekly' && days.length === 0) {
      Alert.alert('Required', 'Select at least one day for weekly');
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
            <Field label="Medicine name" value={name} onChangeText={setName} placeholder="e.g. Vitamin D" />

            <SectionLabel>Frequency</SectionLabel>
            <ChipRow
              options={['daily', 'weekly']}
              selected={[frequency]}
              multi={false}
              onToggle={(v) => setFrequency(v as 'daily' | 'weekly')}
            />
            {frequency === 'weekly' ? (
              <>
                <SectionLabel>Select days</SectionLabel>
                <ChipRow options={[...WEEK_DAYS]} selected={days} onToggle={toggleDay} />
              </>
            ) : null}

            <SectionLabel>Times</SectionLabel>
            <ChipRow options={[...MED_SLOTS]} selected={times} onToggle={toggleTime} />

            <SectionLabel>Reminder timing</SectionLabel>
            <ModeToggle mode={mode} onChange={setMode} />
            {mode === 'default' ? (
              <HintBox>
                {`Uses admin times — Morning ${formatTime12h(config.medicineTimes.Morning)}, Afternoon ${formatTime12h(config.medicineTimes.Afternoon)}, Evening ${formatTime12h(config.medicineTimes.Evening)}.`}
              </HintBox>
            ) : (
              <>
                {times.length === 0 ? (
                  <HintBox>Select at least one time above to set a custom clock time.</HintBox>
                ) : (
                  times.map((slot) => (
                    <TimeField
                      key={slot}
                      label={`${slot} time`}
                      value={
                        customTimes[slot] ||
                        config.medicineTimes[slot as keyof typeof config.medicineTimes] ||
                        '08:00'
                      }
                      onChange={(t) => setCustomTimes((prev) => ({ ...prev, [slot]: t }))}
                    />
                  ))
                )}
                <Field
                  label="Alarm duration (seconds, 0 = until dismissed)"
                  value={alarmDurationSec}
                  onChangeText={setAlarmDurationSec}
                  keyboardType="number-pad"
                />
              </>
            )}

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <PrimaryButton
                title={editingId ? 'Update Medicine' : '+ Add Medicine'}
                onPress={save}
                style={{ flex: 1 }}
              />
              {editingId ? (
                <PrimaryButton
                  title="Cancel"
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
            <SearchField value={search} onChangeText={setSearch} placeholder="Search medicines…" />

            {list.length === 0 ? (
              <EmptyState
                icon="💊"
                title={search ? 'No matching medicines' : 'No medicines yet'}
                subtitle="Switch to New to add a medicine reminder."
              />
            ) : (
              list.map((m) => {
                const doneToday = m.done?.[todayStr()] || {};
                return (
                  <Card key={m.id}>
                    <Text style={{ color: theme.ink, fontWeight: '800', fontSize: 16 }}>{m.name}</Text>
                    <Text style={{ color: theme.muted, marginTop: 2 }}>
                      {m.frequency === 'weekly' ? `Weekly · ${m.days.join(', ')}` : 'Daily'}
                    </Text>
                    <ModeTag mode={m.mode || 'default'} />
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                      {m.times.map((t) => {
                        const label =
                          m.mode === 'custom' && m.customTimes?.[t]
                            ? `${t} (${formatTime12h(m.customTimes[t])})`
                            : t;
                        return (
                          <Pressable
                            key={t}
                            onPress={() => markDone(m.id, t)}
                            style={{
                              backgroundColor: doneToday[t] ? '#D6F0DF' : '#FBD8D8',
                              paddingHorizontal: 12,
                              paddingVertical: 8,
                              borderRadius: 8,
                            }}
                          >
                            <Text style={{ fontWeight: '700' }}>{doneToday[t] ? `✓ ${label}` : label}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                      <PrimaryButton title="Edit" onPress={() => startEdit(m)} style={{ flex: 1 }} />
                      <PrimaryButton
                        title="Delete"
                        danger
                        onPress={() => {
                          setMedReminders(medReminders.filter((x) => x.id !== m.id));
                          if (editingId === m.id) reset();
                          syncAlarmIfType('medicine', m.id);
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
  const { syncAlarmIfType } = useAlarms();
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
      Alert.alert('Required', 'Pick category, item and expiry date');
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
            <Text style={{ color: pulse.header, fontWeight: '800', marginBottom: 12 }}>‹ Back</Text>
          </Pressable>

          {step === 'category' ? (
            <Card>
              <Text style={{ fontWeight: '800', fontSize: 18, marginBottom: 12, color: theme.ink }}>
                Select category
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
                      backgroundColor: pulse.bg,
                      borderRadius: 14,
                      padding: 14,
                      borderWidth: 1,
                      borderColor: pulse.line,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 28 }}>{c.icon}</Text>
                    <Text style={{ fontWeight: '800', marginTop: 6, color: theme.ink }}>{c.name}</Text>
                    <Text style={{ color: theme.muted, fontSize: 11 }}>{c.items.length} items</Text>
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
                    backgroundColor: pulse.bg,
                    borderRadius: 14,
                    padding: 14,
                    borderWidth: 1,
                    borderColor: pulse.line,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontSize: 28 }}>🥡</Text>
                  <Text style={{ fontWeight: '800', marginTop: 6, color: theme.ink }}>Others</Text>
                  <Text style={{ color: theme.muted, fontSize: 11 }}>custom item</Text>
                </Pressable>
              </View>
            </Card>
          ) : null}

          {step === 'item' && cat ? (
            <Card>
              <Text style={{ fontWeight: '800', fontSize: 18, marginBottom: 12, color: theme.ink }}>
                {cat.name}
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
                      backgroundColor: pulse.bg,
                      borderWidth: 1,
                      borderColor: pulse.line,
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
                    backgroundColor: pulse.bg,
                    borderWidth: 1,
                    borderColor: pulse.line,
                  }}
                >
                  <Text style={{ fontSize: 24 }}>➕</Text>
                  <Text style={{ fontSize: 11, fontWeight: '700', marginTop: 4 }}>Others</Text>
                </Pressable>
              </View>
            </Card>
          ) : null}

          {step === 'details' ? (
            <Card>
              <Text style={{ fontWeight: '800', fontSize: 16, color: theme.ink, marginBottom: 4 }}>
                {icon} {item || 'Custom item'} · {category}
              </Text>
              {!item ? (
                <Field
                  label="Item name"
                  value={customName}
                  onChangeText={setCustomName}
                  placeholder="Enter item name"
                />
              ) : null}
              <DateField label="Expiry date" value={expiryDate} onChange={setExpiryDate} />
              <Field label="Quantity (optional)" value={quantity} onChangeText={setQuantity} placeholder="e.g. 2 kg" />
              <Field label="Note (optional)" value={note} onChangeText={setNote} placeholder="Add a note" />

              <SectionLabel>Reminder timing</SectionLabel>
              <ModeToggle mode={mode} onChange={setMode} />
              {mode === 'default' ? (
                <HintBox>
                  {`Uses admin schedule — alerts at ${formatTime12h(config.alertTime)} on: ${offsetsLabel(config.groceryOffsets, 'Expiry day')}.`}
                </HintBox>
              ) : (
                <>
                  <TimeField label="Alert time" value={customTime} onChange={setCustomTime} />
                  <SectionLabel>Remind me</SectionLabel>
                  <OffsetPicker selected={offsets} onChange={setOffsets} forExpiry />
                  <Field
                    label="Alarm duration (seconds, 0 = until dismissed)"
                    value={alarmDurationSec}
                    onChangeText={setAlarmDurationSec}
                    keyboardType="number-pad"
                  />
                </>
              )}
              <PrimaryButton title={editingId ? 'Update Item' : 'Save Item'} onPress={save} />
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
                      {g.category}
                      {g.quantity ? ` · ${g.quantity}` : ''}
                    </Text>
                    <ModeTag mode={g.mode || 'default'} />
                    <DueBadge date={g.expiryDate} />
                  </View>
                </View>
              </View>
            </Pressable>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <PrimaryButton title="Edit" onPress={() => startEdit(g)} style={{ flex: 1 }} />
              <PrimaryButton
                title="Delete"
                danger
                onPress={() => {
                  setGroceryReminders(groceryReminders.filter((x) => x.id !== g.id));
                  syncAlarmIfType('grocery', g.id);
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
        <SearchField value={search} onChangeText={setSearch} placeholder="Search grocery items…" />
        {list.length === 0 ? (
          <EmptyState
            icon="🥬"
            title={search ? 'No matching items' : 'No grocery expiry items yet'}
            subtitle="Switch to New to track an item’s expiry."
          />
        ) : (
          <>
            {renderGroup('Expired', groups.expired)}
            {renderGroup('Expiring Soon', groups.soon)}
            {renderGroup('Fresh', groups.fresh)}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

/* ---------------- General ---------------- */
export function GeneralReminderScreen() {
  const { theme, config, generalReminders, setGeneralReminders } = useApp();
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
      Alert.alert('Required', 'Enter title, date and time');
      return;
    }
    if (repeat === 'weekly' && days.length === 0) {
      Alert.alert('Required', 'Select at least one day for weekly');
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
            <Field label="Title" value={title} onChangeText={setTitle} placeholder="e.g. Wake up, Team meeting" />
            <DateField label="Date" value={date} onChange={setDate} />
            <TimeField label="Time" value={time} onChange={setTime} />

            <SectionLabel>Repeat</SectionLabel>
            <ChipRow
              options={['once', 'daily', 'weekly']}
              selected={[repeat]}
              multi={false}
              onToggle={(v) => setRepeat(v as 'once' | 'daily' | 'weekly')}
            />
            {repeat === 'weekly' ? (
              <>
                <SectionLabel>Select days</SectionLabel>
                <ChipRow
                  options={[...WEEK_DAYS]}
                  selected={days}
                  onToggle={(d) =>
                    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]))
                  }
                />
              </>
            ) : null}

            <Field label="Note (optional)" value={note} onChangeText={setNote} placeholder="Any extra detail" />
            <Field
              label="Alarm duration (seconds, 0 = until dismissed)"
              value={alarmDurationSec}
              onChangeText={setAlarmDurationSec}
              keyboardType="number-pad"
            />

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <PrimaryButton
                title={editingId ? 'Update Reminder' : '+ Save Reminder'}
                onPress={save}
                style={{ flex: 1 }}
              />
              {editingId ? (
                <PrimaryButton
                  title="Cancel"
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
            <SearchField value={search} onChangeText={setSearch} placeholder="Search reminders…" />

            {list.length === 0 ? (
              <EmptyState
                icon="🔔"
                title={search ? 'No matching reminders' : 'No general reminders yet'}
                subtitle="Switch to New to create one."
              />
            ) : (
              list.map((r) => {
                const repeatLabel =
                  r.repeat === 'once'
                    ? r.date
                    : r.repeat === 'daily'
                      ? 'Every day'
                      : `Weekly · ${r.days.join(', ')}`;
                return (
                  <Card key={r.id}>
                    <Text style={{ color: theme.ink, fontWeight: '800' }}>{r.title}</Text>
                    <Text style={{ color: theme.muted }}>
                      {repeatLabel} at {formatTime12h(r.time)}
                      {r.note ? ` · ${r.note}` : ''}
                    </Text>
                    {!r.done ? <DueBadge date={r.date} /> : (
                      <Text style={{ color: pulse.green, fontWeight: '700', marginTop: 4 }}>Done</Text>
                    )}
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                      <PrimaryButton
                        title={r.done ? '✓ Done' : 'Mark Done'}
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
                      <PrimaryButton title="Edit" onPress={() => startEdit(r)} />
                      <PrimaryButton
                        title="Delete"
                        danger
                        onPress={() => {
                          setGeneralReminders(generalReminders.filter((x) => x.id !== r.id));
                          if (editingId === r.id) reset();
                          syncAlarmIfType('general', r.id);
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
