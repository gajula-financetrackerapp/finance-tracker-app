import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Modal,
  TextInput,
  ScrollView,
  Alert,
  StyleSheet,
  Platform,
  ActivityIndicator,
  StatusBar,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAppContext } from '../../state/AppContext';
import { getTheme } from '../../constants/colors';

// ─── Constants ────────────────────────────────────────────────────────────────

const RING_DURATIONS = [
  { label: '15s', value: 15 },
  { label: '30s', value: 30 },
  { label: '1 min', value: 60 },
  { label: '2 min', value: 120 },
];

const DAYS_BEFORE_OPTIONS = [
  { label: '3 days', value: 3 },
  { label: '2 days', value: 2 },
  { label: '1 day', value: 1 },
  { label: 'Due day', value: 0 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(date) {
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

function parseTimeToDate(timeStr) {
  const [h, m] = (timeStr || '09:00').split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

function getDaysUntil(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr);
  due.setHours(0, 0, 0, 0);
  return Math.ceil((due - today) / (1000 * 60 * 60 * 24));
}

function getDueColor(days, paid, theme) {
  if (paid) return theme.muted;
  if (days < 0) return theme.red;
  if (days === 0) return theme.orange;
  return theme.green;
}

function getDueLabel(days, paid) {
  if (paid) return 'Paid';
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Due today';
  return `In ${days} day${days !== 1 ? 's' : ''}`;
}

// ─── Picker Modal ─────────────────────────────────────────────────────────────

function PickerModal({ visible, mode, value, onDone, onClose, theme }) {
  const [localVal, setLocalVal] = useState(value);

  React.useEffect(() => {
    if (visible) setLocalVal(value);
  }, [visible, value]);

  const styles = pickerStyles(theme);

  if (Platform.OS === 'android') {
    if (!visible) return null;
    return (
      <DateTimePicker
        value={localVal}
        mode={mode}
        display="default"
        onChange={(e, date) => {
          if (e.type === 'dismissed') { onClose(); return; }
          if (date) onDone(date);
        }}
      />
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <TouchableOpacity onPress={onClose}>
              <Text style={[styles.sheetAction, { color: theme.muted }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.sheetTitle}>{mode === 'date' ? 'Pick Date' : 'Pick Time'}</Text>
            <TouchableOpacity onPress={() => onDone(localVal)}>
              <Text style={[styles.sheetAction, { color: theme.primary }]}>Done</Text>
            </TouchableOpacity>
          </View>
          <DateTimePicker
            value={localVal}
            mode={mode}
            display="spinner"
            onChange={(e, date) => { if (date) setLocalVal(date); }}
            style={{ width: '100%' }}
          />
        </View>
      </View>
    </Modal>
  );
}

function pickerStyles(theme) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: theme.overlay,
    },
    sheet: {
      backgroundColor: theme.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingBottom: 30,
    },
    sheetHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: theme.line,
    },
    sheetTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.ink,
    },
    sheetAction: {
      fontSize: 15,
      fontWeight: '500',
    },
  });
}

// ─── Add / Edit Form Modal ────────────────────────────────────────────────────

function ExpenseFormModal({ visible, editItem, onClose, theme, config }) {
  const { addExpenseReminder, editExpenseReminder } = useAppContext();

  const [formName, setFormName] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formDueDate, setFormDueDate] = useState(new Date());
  const [formMode, setFormMode] = useState('default');
  const [formCustomTime, setFormCustomTime] = useState(new Date());
  const [formCustomDaysBefore, setFormCustomDaysBefore] = useState([1, 0]);
  const [formRingDuration, setFormRingDuration] = useState(30);
  const [saving, setSaving] = useState(false);

  const [picker, setPicker] = useState({ visible: false, mode: 'date', field: '' });

  React.useEffect(() => {
    if (visible) {
      if (editItem) {
        setFormName(editItem.name || '');
        setFormAmount(editItem.amount != null ? String(editItem.amount) : '');
        setFormDueDate(editItem.dueDate ? new Date(editItem.dueDate) : new Date());
        setFormMode(editItem.mode || 'default');
        setFormCustomTime(editItem.customTime ? parseTimeToDate(editItem.customTime) : parseTimeToDate(config.alertTime));
        setFormCustomDaysBefore(editItem.customDaysBefore || [1, 0]);
        setFormRingDuration(editItem.ringDuration || 30);
      } else {
        setFormName('');
        setFormAmount('');
        setFormDueDate(new Date());
        setFormMode('default');
        setFormCustomTime(parseTimeToDate(config.alertTime));
        setFormCustomDaysBefore([1, 0]);
        setFormRingDuration(30);
      }
    }
  }, [visible, editItem]);

  function openPicker(mode, field) {
    setPicker({ visible: true, mode, field });
  }

  function onPickerDone(date) {
    setPicker((p) => ({ ...p, visible: false }));
    if (picker.field === 'dueDate') setFormDueDate(date);
    if (picker.field === 'customTime') setFormCustomTime(date);
  }

  function toggleDayBefore(val) {
    setFormCustomDaysBefore((prev) =>
      prev.includes(val) ? prev.filter((d) => d !== val) : [...prev, val]
    );
  }

  async function handleSave() {
    if (!formName.trim()) {
      Alert.alert('Required', 'Please enter an expense name.');
      return;
    }
    setSaving(true);
    const payload = {
      name: formName.trim(),
      amount: parseFloat(formAmount) || 0,
      dueDate: formDueDate.toISOString().split('T')[0],
      paid: editItem?.paid || false,
      mode: formMode,
      customTime: formMode === 'custom' ? formatTime(formCustomTime) : null,
      customDaysBefore: formMode === 'custom' ? formCustomDaysBefore : [],
      ringDuration: formMode === 'custom' ? formRingDuration : 30,
    };
    if (editItem) {
      await editExpenseReminder(editItem.id, payload);
    } else {
      await addExpenseReminder(payload);
    }
    setSaving(false);
    onClose();
  }

  const styles = formStyles(theme);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={22} color={theme.ink} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>{editItem ? 'Edit Bill' : 'Add Bill Reminder'}</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
          {/* Reminder Mode Toggle */}
          <View style={styles.modeToggleRow}>
            <TouchableOpacity
              style={[styles.modeTab, formMode === 'default' && { backgroundColor: theme.primary }]}
              onPress={() => setFormMode('default')}
            >
              <Text style={[styles.modeTabText, formMode === 'default' && { color: theme.buttonText, fontWeight: '700' }]}>
                Default
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeTab, formMode === 'custom' && { backgroundColor: theme.primary }]}
              onPress={() => setFormMode('custom')}
            >
              <Text style={[styles.modeTabText, formMode === 'custom' && { color: theme.buttonText, fontWeight: '700' }]}>
                Customize
              </Text>
            </TouchableOpacity>
          </View>

          {formMode === 'default' && (
            <View style={styles.infoBox}>
              <Ionicons name="information-circle" size={16} color={theme.blue} />
              <Text style={styles.infoText}>
                Will remind at <Text style={styles.infoBold}>{config.alertTime}</Text>, 1 day before and on the due day.
              </Text>
            </View>
          )}

          {/* Expense Name */}
          <Text style={styles.fieldLabel}>Expense Name</Text>
          <TextInput
            style={styles.input}
            value={formName}
            onChangeText={setFormName}
            placeholder="e.g. Electricity Bill"
            placeholderTextColor={theme.placeholderText}
          />

          {/* Amount */}
          <Text style={styles.fieldLabel}>Amount</Text>
          <TextInput
            style={styles.input}
            value={formAmount}
            onChangeText={setFormAmount}
            placeholder="0.00"
            placeholderTextColor={theme.placeholderText}
            keyboardType="decimal-pad"
          />

          {/* Due Date */}
          <Text style={styles.fieldLabel}>Due Date</Text>
          <TouchableOpacity
            style={styles.dateBtn}
            onPress={() => openPicker('date', 'dueDate')}
          >
            <Ionicons name="calendar-outline" size={18} color={theme.primary} />
            <Text style={styles.dateBtnText}>{formatDate(formDueDate.toISOString())}</Text>
          </TouchableOpacity>

          {/* Customize mode extras */}
          {formMode === 'custom' && (
            <>
              <Text style={styles.fieldLabel}>Alert Time</Text>
              <TouchableOpacity
                style={styles.dateBtn}
                onPress={() => openPicker('time', 'customTime')}
              >
                <Ionicons name="time-outline" size={18} color={theme.primary} />
                <Text style={styles.dateBtnText}>{formatTime(formCustomTime)}</Text>
              </TouchableOpacity>

              <Text style={styles.fieldLabel}>Remind Me</Text>
              <View style={styles.checkRow}>
                {DAYS_BEFORE_OPTIONS.map((opt) => {
                  const checked = formCustomDaysBefore.includes(opt.value);
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.checkChip, checked && { backgroundColor: theme.primary }]}
                      onPress={() => toggleDayBefore(opt.value)}
                    >
                      <Text style={[styles.checkChipText, checked && { color: theme.buttonText }]}>
                        {checked ? '✓ ' : ''}{opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>Ring Duration</Text>
              <View style={styles.durationRow}>
                {RING_DURATIONS.map((rd) => (
                  <TouchableOpacity
                    key={rd.value}
                    style={[styles.durationChip, formRingDuration === rd.value && { backgroundColor: theme.primary }]}
                    onPress={() => setFormRingDuration(rd.value)}
                  >
                    <Text style={[styles.durationText, formRingDuration === rd.value && { color: theme.buttonText }]}>
                      {rd.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color={theme.buttonText} />
              : <Text style={styles.saveBtnText}>{editItem ? 'Save Changes' : 'Add Reminder'}</Text>
            }
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      <PickerModal
        visible={picker.visible}
        mode={picker.mode}
        value={picker.field === 'customTime' ? formCustomTime : formDueDate}
        onDone={onPickerDone}
        onClose={() => setPicker((p) => ({ ...p, visible: false }))}
        theme={theme}
      />
    </Modal>
  );
}

// ─── Reminder List Item ───────────────────────────────────────────────────────

function ReminderItem({ item, theme, onEdit, onDelete, onMarkPaid, styles }) {
  const days = getDaysUntil(item.dueDate);
  const dueColor = getDueColor(days, item.paid, theme);
  const dueLabel = getDueLabel(days, item.paid);

  return (
    <View style={styles.itemCard}>
      <View style={styles.itemLeft}>
        <View style={[styles.dueIndicator, { backgroundColor: dueColor }]} />
        <View style={styles.itemInfo}>
          <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.itemMeta}>
            {item.amount != null ? `$${Number(item.amount).toFixed(2)}  ·  ` : ''}
            Due {formatDate(item.dueDate)}
          </Text>
        </View>
      </View>

      <View style={styles.itemRight}>
        <View style={[styles.statusBadge, { backgroundColor: dueColor + '22' }]}>
          <Text style={[styles.statusText, { color: dueColor }]}>{dueLabel}</Text>
        </View>

        <View style={styles.actionRow}>
          {!item.paid && (
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: theme.greenLight }]} onPress={onMarkPaid}>
              <Ionicons name="checkmark" size={14} color={theme.green} />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: theme.blueLight }]} onPress={onEdit}>
            <Ionicons name="pencil" size={14} color={theme.blue} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: theme.redLight }]} onPress={onDelete}>
            <Ionicons name="trash" size={14} color={theme.red} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ExpenseReminderScreen() {
  const {
    config,
    expenseReminders,
    editExpenseReminder,
    removeExpenseReminder,
  } = useAppContext();
  const theme = getTheme(config.theme);
  const styles = makeStyles(theme);

  const [modalVisible, setModalVisible] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [filter, setFilter] = useState('all'); // 'all' | 'unpaid' | 'paid'

  const sorted = [...expenseReminders].sort((a, b) => {
    return new Date(a.dueDate) - new Date(b.dueDate);
  });

  const filtered = sorted.filter((r) => {
    if (filter === 'unpaid') return !r.paid;
    if (filter === 'paid') return r.paid;
    return true;
  });

  function openAdd() {
    setEditItem(null);
    setModalVisible(true);
  }

  function openEdit(item) {
    setEditItem(item);
    setModalVisible(true);
  }

  function confirmDelete(item) {
    Alert.alert(
      'Delete Reminder',
      `Remove "${item.name}"? This will also cancel scheduled notifications.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => removeExpenseReminder(item.id),
        },
      ]
    );
  }

  async function markPaid(item) {
    await editExpenseReminder(item.id, { paid: true });
  }

  const pendingCount = expenseReminders.filter((r) => !r.paid).length;
  const overdueCount = expenseReminders.filter((r) => {
    if (r.paid) return false;
    return getDaysUntil(r.dueDate) < 0;
  }).length;

  const renderItem = useCallback(
    ({ item }) => (
      <ReminderItem
        item={item}
        theme={theme}
        styles={styles}
        onEdit={() => openEdit(item)}
        onDelete={() => confirmDelete(item)}
        onMarkPaid={() => markPaid(item)}
      />
    ),
    [theme]
  );

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle={theme.statusBar === 'dark' ? 'dark-content' : 'light-content'}
        backgroundColor={theme.headerBg}
      />

      {/* Stats Row */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={[styles.statNum, { color: theme.red }]}>{overdueCount}</Text>
          <Text style={styles.statLabel}>Overdue</Text>
        </View>
        <View style={[styles.statDivider]} />
        <View style={styles.statBox}>
          <Text style={[styles.statNum, { color: theme.orange }]}>{pendingCount}</Text>
          <Text style={styles.statLabel}>Pending</Text>
        </View>
        <View style={[styles.statDivider]} />
        <View style={styles.statBox}>
          <Text style={[styles.statNum, { color: theme.green }]}>
            {expenseReminders.length - pendingCount}
          </Text>
          <Text style={styles.statLabel}>Paid</Text>
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        {['all', 'unpaid', 'paid'].map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterTab, filter === f && { backgroundColor: theme.primary }]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterTabText, filter === f && { color: theme.buttonText, fontWeight: '700' }]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {filtered.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>💳</Text>
          <Text style={styles.emptyTitle}>No reminders yet</Text>
          <Text style={styles.emptySubtitle}>Tap + to add a bill reminder</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={openAdd} activeOpacity={0.85}>
        <Ionicons name="add" size={28} color={theme.buttonText} />
      </TouchableOpacity>

      <ExpenseFormModal
        visible={modalVisible}
        editItem={editItem}
        onClose={() => setModalVisible(false)}
        theme={theme}
        config={config}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.bg,
    },
    statsRow: {
      flexDirection: 'row',
      backgroundColor: theme.card,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: theme.line,
    },
    statBox: {
      flex: 1,
      alignItems: 'center',
    },
    statNum: {
      fontSize: 22,
      fontWeight: '700',
    },
    statLabel: {
      fontSize: 11,
      color: theme.muted,
      marginTop: 2,
    },
    statDivider: {
      width: 1,
      backgroundColor: theme.line,
      marginVertical: 4,
    },
    filterRow: {
      flexDirection: 'row',
      padding: 12,
      gap: 8,
      backgroundColor: theme.card,
      borderBottomWidth: 1,
      borderBottomColor: theme.line,
    },
    filterTab: {
      flex: 1,
      paddingVertical: 7,
      borderRadius: 8,
      alignItems: 'center',
      backgroundColor: theme.inputBg,
    },
    filterTabText: {
      fontSize: 13,
      color: theme.muted,
      fontWeight: '500',
    },
    listContent: {
      padding: 16,
      paddingBottom: 100,
    },
    itemCard: {
      backgroundColor: theme.card,
      borderRadius: 14,
      padding: 14,
      marginBottom: 10,
      flexDirection: 'row',
      alignItems: 'flex-start',
      shadowColor: theme.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 1,
      shadowRadius: 4,
      elevation: 2,
    },
    itemLeft: {
      flexDirection: 'row',
      flex: 1,
      alignItems: 'flex-start',
    },
    dueIndicator: {
      width: 4,
      height: '100%',
      minHeight: 40,
      borderRadius: 2,
      marginRight: 12,
    },
    itemInfo: {
      flex: 1,
    },
    itemName: {
      fontSize: 15,
      fontWeight: '600',
      color: theme.ink,
      marginBottom: 3,
    },
    itemMeta: {
      fontSize: 12,
      color: theme.muted,
    },
    itemRight: {
      alignItems: 'flex-end',
      gap: 8,
      marginLeft: 8,
    },
    statusBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
    },
    statusText: {
      fontSize: 11,
      fontWeight: '600',
    },
    actionRow: {
      flexDirection: 'row',
      gap: 6,
    },
    actionBtn: {
      width: 28,
      height: 28,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 40,
    },
    emptyEmoji: {
      fontSize: 52,
      marginBottom: 14,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.ink,
      marginBottom: 6,
    },
    emptySubtitle: {
      fontSize: 14,
      color: theme.muted,
      textAlign: 'center',
    },
    fab: {
      position: 'absolute',
      bottom: 24,
      right: 24,
      width: 58,
      height: 58,
      borderRadius: 29,
      backgroundColor: theme.primary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: theme.shadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 1,
      shadowRadius: 8,
      elevation: 6,
    },
  });
}

function formStyles(theme) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: theme.bg },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 16,
      backgroundColor: theme.card,
      borderBottomWidth: 1,
      borderBottomColor: theme.line,
    },
    closeBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: theme.inputBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: theme.ink,
    },
    formContent: {
      padding: 20,
      paddingBottom: 40,
    },
    modeToggleRow: {
      flexDirection: 'row',
      backgroundColor: theme.inputBg,
      borderRadius: 10,
      padding: 3,
      marginBottom: 16,
    },
    modeTab: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: 8,
      alignItems: 'center',
    },
    modeTabText: {
      fontSize: 14,
      color: theme.muted,
    },
    infoBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      backgroundColor: theme.blueLight,
      borderRadius: 10,
      padding: 12,
      marginBottom: 16,
    },
    infoText: {
      flex: 1,
      fontSize: 13,
      color: theme.ink,
      lineHeight: 18,
    },
    infoBold: {
      fontWeight: '700',
    },
    fieldLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.muted,
      marginBottom: 6,
      marginTop: 14,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    input: {
      backgroundColor: theme.inputBg,
      borderWidth: 1,
      borderColor: theme.inputBorder,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: theme.inputText,
    },
    dateBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: theme.inputBg,
      borderWidth: 1,
      borderColor: theme.inputBorder,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    dateBtnText: {
      fontSize: 15,
      color: theme.inputText,
    },
    checkRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    checkChip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: theme.inputBg,
      borderWidth: 1,
      borderColor: theme.inputBorder,
    },
    checkChipText: {
      fontSize: 13,
      color: theme.ink,
    },
    durationRow: {
      flexDirection: 'row',
      gap: 8,
    },
    durationChip: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: theme.inputBg,
      borderWidth: 1,
      borderColor: theme.inputBorder,
      alignItems: 'center',
    },
    durationText: {
      fontSize: 13,
      fontWeight: '500',
      color: theme.ink,
    },
    saveBtn: {
      marginTop: 28,
      backgroundColor: theme.primary,
      borderRadius: 14,
      paddingVertical: 15,
      alignItems: 'center',
    },
    saveBtnText: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.buttonText,
    },
  });
}
