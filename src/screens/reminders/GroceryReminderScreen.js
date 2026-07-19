import React, { useState, useCallback, useMemo } from 'react';
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
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAppContext } from '../../state/AppContext';
import { getTheme } from '../../constants/colors';
import { GROCERY_CATEGORIES } from '../../constants/grocery';

// ─── Constants ────────────────────────────────────────────────────────────────

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/** Display mapping — emoji tiles shown in the grid */
const DISPLAY_CATEGORIES = [
  { id: 'vegetables', emoji: '🥦', label: 'Vegetables' },
  { id: 'fruits', emoji: '🍎', label: 'Fruits' },
  { id: 'dairy', emoji: '🥛', label: 'Dairy' },
  { id: 'meat', emoji: '🍗', label: 'Meat' },
  { id: 'grains', emoji: '🌾', label: 'Grains' },
  { id: 'bakery', emoji: '🍞', label: 'Bakery' },
  { id: 'spices', emoji: '🧂', label: 'Spices' },
  { id: 'beverages', emoji: '🧃', label: 'Beverages' },
  { id: 'frozen', emoji: '🧊', label: 'Frozen' },
  { id: 'snacks', emoji: '🍿', label: 'Snacks' },
  { id: 'others', emoji: '➕', label: 'Others' },
];

const UNITS = ['g', 'kg', 'piece', 'pack', 'L', 'mL', 'dozen'];

const RING_DURATIONS = [
  { label: '15s', value: 15 },
  { label: '30s', value: 30 },
  { label: '1 min', value: 60 },
  { label: '2 min', value: 120 },
];

const DAYS_BEFORE_OPTIONS = [
  { label: '5 days', value: 5 },
  { label: '3 days', value: 3 },
  { label: '2 days', value: 2 },
  { label: '1 day', value: 1 },
  { label: 'Expiry day', value: 0 },
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

function getDaysUntilExpiry(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(dateStr);
  exp.setHours(0, 0, 0, 0);
  return Math.ceil((exp - today) / (1000 * 60 * 60 * 24));
}

function getExpiryStatus(days) {
  if (days === null) return 'unknown';
  if (days < 0) return 'expired';
  if (days <= 3) return 'soon';
  return 'fresh';
}

function getPresetItems(categoryId) {
  const cat = GROCERY_CATEGORIES.find((c) => c.id === categoryId);
  return cat?.items || [];
}

function getCategoryEmoji(categoryId) {
  return DISPLAY_CATEGORIES.find((c) => c.id === categoryId)?.emoji || '🛒';
}

function getDefaultExpiryDays(categoryId) {
  const cat = GROCERY_CATEGORIES.find((c) => c.id === categoryId);
  return cat?.defaultExpiryDays || 7;
}

// ─── Picker Modal ─────────────────────────────────────────────────────────────

function PickerModal({ visible, mode, value, onDone, onClose, theme }) {
  const [localVal, setLocalVal] = useState(value);

  React.useEffect(() => {
    if (visible) setLocalVal(value);
  }, [visible, value]);

  const styles = pickerModalStyles(theme);

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

function pickerModalStyles(theme) {
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

// ─── 3-Step Add / Edit Modal ──────────────────────────────────────────────────

function GroceryFormModal({ visible, editItem, onClose, theme, config }) {
  const { addGroceryReminder, editGroceryReminder } = useAppContext();

  // 3-step flow: step 1 = pick category, step 2 = pick item, step 3 = details
  // For editing, jump straight to step 3.
  const [step, setStep] = useState(1);
  const [selectedCategoryId, setSelectedCategoryId] = useState('vegetables');
  const [customItemName, setCustomItemName] = useState('');
  const [searchText, setSearchText] = useState('');

  // Step 3 form
  const [formName, setFormName] = useState('');
  const [formCategoryId, setFormCategoryId] = useState('vegetables');
  const [formIcon, setFormIcon] = useState('🥦');
  const [formQuantity, setFormQuantity] = useState('');
  const [formUnit, setFormUnit] = useState('piece');
  const [formExpiryDate, setFormExpiryDate] = useState(new Date());
  const [formMode, setFormMode] = useState('default');
  const [formCustomTime, setFormCustomTime] = useState(new Date());
  const [formCustomDaysBefore, setFormCustomDaysBefore] = useState([2, 1, 0]);
  const [formRingDuration, setFormRingDuration] = useState(30);
  const [saving, setSaving] = useState(false);

  const [picker, setPicker] = useState({ visible: false, mode: 'date' });

  React.useEffect(() => {
    if (visible) {
      if (editItem) {
        // Jump to step 3 pre-filled
        setStep(3);
        setFormName(editItem.name || '');
        setFormCategoryId(editItem.category || 'others');
        setFormIcon(editItem.icon || getCategoryEmoji(editItem.category || 'others'));
        setFormQuantity(editItem.quantity != null ? String(editItem.quantity) : '');
        setFormUnit(editItem.unit || 'piece');
        setFormExpiryDate(editItem.expiryDate ? new Date(editItem.expiryDate) : new Date());
        setFormMode(editItem.mode || 'default');
        setFormCustomTime(editItem.customTime ? parseTimeToDate(editItem.customTime) : parseTimeToDate(config.alertTime));
        setFormCustomDaysBefore(editItem.customDaysBefore || [2, 1, 0]);
        setFormRingDuration(editItem.ringDuration || 30);
      } else {
        setStep(1);
        setSelectedCategoryId('vegetables');
        setCustomItemName('');
        setSearchText('');
        setFormName('');
        setFormCategoryId('vegetables');
        setFormIcon('🥦');
        setFormQuantity('');
        setFormUnit('piece');
        const defaultExpiry = new Date();
        defaultExpiry.setDate(defaultExpiry.getDate() + 7);
        setFormExpiryDate(defaultExpiry);
        setFormMode('default');
        setFormCustomTime(parseTimeToDate(config.alertTime));
        setFormCustomDaysBefore([2, 1, 0]);
        setFormRingDuration(30);
      }
    }
  }, [visible, editItem]);

  function handleCategorySelect(categoryId) {
    setSelectedCategoryId(categoryId);
    setCustomItemName('');
    setSearchText('');
    setStep(2);
  }

  function handleItemSelect(itemName) {
    const emoji = getCategoryEmoji(selectedCategoryId);
    const defDays = getDefaultExpiryDays(selectedCategoryId);
    const expDate = new Date();
    expDate.setDate(expDate.getDate() + defDays);

    setFormName(itemName);
    setFormCategoryId(selectedCategoryId);
    setFormIcon(emoji);
    setFormExpiryDate(expDate);
    setStep(3);
  }

  function handleCustomItemNext() {
    if (!customItemName.trim()) {
      Alert.alert('Required', 'Please enter an item name.');
      return;
    }
    handleItemSelect(customItemName.trim());
  }

  function toggleDayBefore(val) {
    setFormCustomDaysBefore((prev) =>
      prev.includes(val) ? prev.filter((d) => d !== val) : [...prev, val]
    );
  }

  function onPickerDone(date) {
    setPicker((p) => ({ ...p, visible: false }));
    if (picker.field === 'expiryDate') setFormExpiryDate(date);
    if (picker.field === 'customTime') setFormCustomTime(date);
  }

  async function handleSave() {
    if (!formName.trim()) {
      Alert.alert('Required', 'Please enter an item name.');
      return;
    }
    if (!formExpiryDate) {
      Alert.alert('Required', 'Please set an expiry date.');
      return;
    }
    setSaving(true);
    const payload = {
      name: formName.trim(),
      icon: formIcon,
      category: formCategoryId,
      quantity: parseFloat(formQuantity) || 0,
      unit: formUnit,
      expiryDate: formExpiryDate.toISOString().split('T')[0],
      mode: formMode,
      customTime: formMode === 'custom' ? formatTime(formCustomTime) : null,
      customDaysBefore: formMode === 'custom' ? formCustomDaysBefore : [],
      ringDuration: formMode === 'custom' ? formRingDuration : 30,
    };
    if (editItem) {
      await editGroceryReminder(editItem.id, payload);
    } else {
      await addGroceryReminder(payload);
    }
    setSaving(false);
    onClose();
  }

  const fStyles = formStyles(theme);
  const alertTime = config.alertTime || '09:00';
  const presetItems = getPresetItems(selectedCategoryId);
  const filteredPresets = searchText.trim()
    ? presetItems.filter((i) => i.toLowerCase().includes(searchText.toLowerCase()))
    : presetItems;

  function renderStepIndicator() {
    if (editItem) return null;
    return (
      <View style={fStyles.stepRow}>
        {[1, 2, 3].map((s) => (
          <View key={s} style={fStyles.stepWrap}>
            <View style={[fStyles.stepDot, s <= step && { backgroundColor: theme.primary }]}>
              <Text style={[fStyles.stepDotText, s <= step && { color: theme.buttonText }]}>{s}</Text>
            </View>
            {s < 3 && <View style={[fStyles.stepLine, s < step && { backgroundColor: theme.primary }]} />}
          </View>
        ))}
      </View>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <KeyboardAvoidingView
        style={fStyles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={fStyles.modalHeader}>
          <TouchableOpacity
            onPress={() => {
              if (!editItem && step > 1) setStep(step - 1);
              else onClose();
            }}
            style={fStyles.backBtn}
          >
            <Ionicons
              name={(!editItem && step > 1) ? 'arrow-back' : 'close'}
              size={22}
              color={theme.ink}
            />
          </TouchableOpacity>
          <Text style={fStyles.modalTitle}>
            {editItem
              ? 'Edit Item'
              : step === 1 ? 'Pick Category'
              : step === 2 ? 'Pick Item'
              : 'Item Details'}
          </Text>
          <View style={{ width: 36 }} />
        </View>

        {renderStepIndicator()}

        {/* Step 1: Category Grid */}
        {step === 1 && (
          <ScrollView contentContainerStyle={fStyles.stepContent} showsVerticalScrollIndicator={false}>
            <Text style={fStyles.stepHint}>Which category does your item belong to?</Text>
            <View style={fStyles.categoryGrid}>
              {DISPLAY_CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={fStyles.catTile}
                  onPress={() => handleCategorySelect(cat.id)}
                  activeOpacity={0.7}
                >
                  <Text style={fStyles.catEmoji}>{cat.emoji}</Text>
                  <Text style={fStyles.catLabel} numberOfLines={2}>{cat.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        )}

        {/* Step 2: Item Picker */}
        {step === 2 && (
          <View style={fStyles.flex}>
            <View style={fStyles.searchWrapper}>
              <Ionicons name="search" size={16} color={theme.muted} style={{ marginRight: 8 }} />
              <TextInput
                style={fStyles.searchInput}
                value={searchText}
                onChangeText={setSearchText}
                placeholder="Search items..."
                placeholderTextColor={theme.placeholderText}
              />
            </View>

            <FlatList
              data={filteredPresets}
              keyExtractor={(item) => item}
              contentContainerStyle={fStyles.stepContent}
              ListHeaderComponent={
                <View style={fStyles.customNameSection}>
                  <Text style={fStyles.fieldLabel}>Custom Item Name</Text>
                  <View style={fStyles.customNameRow}>
                    <TextInput
                      style={[fStyles.input, { flex: 1 }]}
                      value={customItemName}
                      onChangeText={setCustomItemName}
                      placeholder="Type custom name..."
                      placeholderTextColor={theme.placeholderText}
                    />
                    <TouchableOpacity
                      style={fStyles.nextBtn}
                      onPress={handleCustomItemNext}
                    >
                      <Text style={fStyles.nextBtnText}>Next</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={fStyles.orDividerText}>— or pick from list —</Text>
                </View>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={fStyles.presetItem}
                  onPress={() => handleItemSelect(item)}
                >
                  <Text style={fStyles.presetItemText}>{item}</Text>
                  <Ionicons name="add-circle-outline" size={20} color={theme.primary} />
                </TouchableOpacity>
              )}
            />
          </View>
        )}

        {/* Step 3: Details */}
        {step === 3 && (
          <ScrollView contentContainerStyle={fStyles.stepContent} keyboardShouldPersistTaps="handled">
            {/* Reminder Mode Toggle */}
            <View style={fStyles.modeToggleRow}>
              <TouchableOpacity
                style={[fStyles.modeTab, formMode === 'default' && { backgroundColor: theme.primary }]}
                onPress={() => setFormMode('default')}
              >
                <Text style={[fStyles.modeTabText, formMode === 'default' && { color: theme.buttonText, fontWeight: '700' }]}>
                  Default
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[fStyles.modeTab, formMode === 'custom' && { backgroundColor: theme.primary }]}
                onPress={() => setFormMode('custom')}
              >
                <Text style={[fStyles.modeTabText, formMode === 'custom' && { color: theme.buttonText, fontWeight: '700' }]}>
                  Customize
                </Text>
              </TouchableOpacity>
            </View>

            {formMode === 'default' && (
              <View style={fStyles.infoBox}>
                <Ionicons name="information-circle" size={16} color={theme.blue} />
                <Text style={fStyles.infoText}>
                  Will remind 2 days before, 1 day before, and on expiry day at{' '}
                  <Text style={fStyles.infoBold}>{alertTime}</Text>.
                </Text>
              </View>
            )}

            {/* Item name */}
            <Text style={fStyles.fieldLabel}>Item Name</Text>
            <TextInput
              style={fStyles.input}
              value={formName}
              onChangeText={setFormName}
              placeholder="Item name"
              placeholderTextColor={theme.placeholderText}
            />

            {/* Category (read-only display when coming from flow, editable for edit) */}
            <Text style={fStyles.fieldLabel}>Category</Text>
            <View style={fStyles.catBadgeRow}>
              <Text style={fStyles.catBadgeEmoji}>{getCategoryEmoji(formCategoryId)}</Text>
              <Text style={fStyles.catBadgeName}>
                {DISPLAY_CATEGORIES.find((c) => c.id === formCategoryId)?.label || formCategoryId}
              </Text>
            </View>

            {/* Quantity */}
            <Text style={fStyles.fieldLabel}>Quantity</Text>
            <View style={fStyles.qtyRow}>
              <TextInput
                style={[fStyles.input, { flex: 1 }]}
                value={formQuantity}
                onChangeText={setFormQuantity}
                placeholder="0"
                placeholderTextColor={theme.placeholderText}
                keyboardType="decimal-pad"
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={fStyles.unitScroll}>
                {UNITS.map((u) => (
                  <TouchableOpacity
                    key={u}
                    style={[fStyles.unitChip, formUnit === u && { backgroundColor: theme.primary }]}
                    onPress={() => setFormUnit(u)}
                  >
                    <Text style={[fStyles.unitText, formUnit === u && { color: theme.buttonText }]}>{u}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Expiry Date */}
            <Text style={fStyles.fieldLabel}>Expiry Date</Text>
            <TouchableOpacity
              style={fStyles.dateBtn}
              onPress={() => setPicker({ visible: true, mode: 'date', field: 'expiryDate' })}
            >
              <Ionicons name="calendar-outline" size={18} color={theme.primary} />
              <Text style={fStyles.dateBtnText}>{formatDate(formExpiryDate.toISOString())}</Text>
            </TouchableOpacity>

            {/* Custom fields */}
            {formMode === 'custom' && (
              <>
                <Text style={fStyles.fieldLabel}>Alert Time</Text>
                <TouchableOpacity
                  style={fStyles.dateBtn}
                  onPress={() => setPicker({ visible: true, mode: 'time', field: 'customTime' })}
                >
                  <Ionicons name="time-outline" size={18} color={theme.primary} />
                  <Text style={fStyles.dateBtnText}>{formatTime(formCustomTime)}</Text>
                </TouchableOpacity>

                <Text style={fStyles.fieldLabel}>Remind Me</Text>
                <View style={fStyles.checkRow}>
                  {DAYS_BEFORE_OPTIONS.map((opt) => {
                    const checked = formCustomDaysBefore.includes(opt.value);
                    return (
                      <TouchableOpacity
                        key={opt.value}
                        style={[fStyles.checkChip, checked && { backgroundColor: theme.primary }]}
                        onPress={() => toggleDayBefore(opt.value)}
                      >
                        <Text style={[fStyles.checkChipText, checked && { color: theme.buttonText }]}>
                          {checked ? '✓ ' : ''}{opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={fStyles.fieldLabel}>Ring Duration</Text>
                <View style={fStyles.durationRow}>
                  {RING_DURATIONS.map((rd) => (
                    <TouchableOpacity
                      key={rd.value}
                      style={[fStyles.durationChip, formRingDuration === rd.value && { backgroundColor: theme.primary }]}
                      onPress={() => setFormRingDuration(rd.value)}
                    >
                      <Text style={[fStyles.durationText, formRingDuration === rd.value && { color: theme.buttonText }]}>
                        {rd.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            <TouchableOpacity
              style={[fStyles.saveBtn, saving && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color={theme.buttonText} />
                : <Text style={fStyles.saveBtnText}>{editItem ? 'Save Changes' : 'Add Item'}</Text>
              }
            </TouchableOpacity>
          </ScrollView>
        )}
      </KeyboardAvoidingView>

      <PickerModal
        visible={picker.visible}
        mode={picker.mode}
        value={picker.field === 'customTime' ? formCustomTime : formExpiryDate}
        onDone={onPickerDone}
        onClose={() => setPicker((p) => ({ ...p, visible: false }))}
        theme={theme}
      />
    </Modal>
  );
}

// ─── Grocery Item Card ────────────────────────────────────────────────────────

function GroceryItemCard({ item, theme, onEdit, onDelete, styles }) {
  const days = getDaysUntilExpiry(item.expiryDate);
  const status = getExpiryStatus(days);

  const statusColor =
    status === 'expired' ? theme.red
    : status === 'soon' ? theme.orange
    : theme.green;

  const statusBgColor =
    status === 'expired' ? theme.redLight
    : status === 'soon' ? theme.orangeLight
    : theme.greenLight;

  const statusLabel =
    status === 'expired' ? `${Math.abs(days)}d expired`
    : status === 'soon' ? (days === 0 ? 'Expires today' : `${days}d left`)
    : `${days}d left`;

  return (
    <View style={styles.itemCard}>
      <View style={[styles.itemIcon, { backgroundColor: statusBgColor }]}>
        <Text style={styles.itemEmoji}>{item.icon || getCategoryEmoji(item.category)}</Text>
      </View>
      <View style={styles.itemInfo}>
        <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.itemMeta}>
          {item.quantity ? `${item.quantity} ${item.unit}  ·  ` : ''}
          Expires {formatDate(item.expiryDate)}
        </Text>
      </View>
      <View style={styles.itemRight}>
        <View style={[styles.statusBadge, { backgroundColor: statusBgColor }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
        <View style={styles.actionRow}>
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

export default function GroceryReminderScreen() {
  const { config, groceryReminders, removeGroceryReminder } = useAppContext();
  const theme = getTheme(config.theme);
  const styles = makeStyles(theme);

  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'items'
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [editItem, setEditItem] = useState(null);

  // Categorized counts for the grid badges
  const countsByCategory = useMemo(() => {
    const map = {};
    groceryReminders.forEach((r) => {
      const key = r.category || 'others';
      map[key] = (map[key] || 0) + 1;
    });
    return map;
  }, [groceryReminders]);

  // Items for the current selected category
  const categoryItems = useMemo(() => {
    if (!selectedCategoryId) return groceryReminders;
    return groceryReminders.filter((r) => (r.category || 'others') === selectedCategoryId);
  }, [groceryReminders, selectedCategoryId]);

  // Expiry stats
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiredCount = groceryReminders.filter((r) => getDaysUntilExpiry(r.expiryDate) < 0).length;
  const soonCount = groceryReminders.filter((r) => {
    const d = getDaysUntilExpiry(r.expiryDate);
    return d !== null && d >= 0 && d <= 3;
  }).length;

  function handleCategoryPress(catId) {
    setSelectedCategoryId(catId);
    setViewMode('items');
  }

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
      'Delete Item',
      `Remove "${item.name}"? This will cancel its expiry reminders.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => removeGroceryReminder(item.id),
        },
      ]
    );
  }

  const selectedCat = DISPLAY_CATEGORIES.find((c) => c.id === selectedCategoryId);

  const renderGroceryItem = useCallback(
    ({ item }) => (
      <GroceryItemCard
        item={item}
        theme={theme}
        styles={styles}
        onEdit={() => openEdit(item)}
        onDelete={() => confirmDelete(item)}
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

      {/* Stats Banner */}
      <View style={styles.statsBanner}>
        <View style={styles.statBox}>
          <Text style={styles.statNum}>{groceryReminders.length}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBox}>
          <Text style={[styles.statNum, { color: theme.orange }]}>{soonCount}</Text>
          <Text style={styles.statLabel}>Expiring soon</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBox}>
          <Text style={[styles.statNum, { color: theme.red }]}>{expiredCount}</Text>
          <Text style={styles.statLabel}>Expired</Text>
        </View>
      </View>

      {/* Category Grid View */}
      {viewMode === 'grid' && (
        <ScrollView contentContainerStyle={styles.gridContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.sectionLabel}>Categories</Text>
          <View style={styles.categoryGrid}>
            {DISPLAY_CATEGORIES.map((cat) => {
              const count = countsByCategory[cat.id] || 0;
              return (
                <TouchableOpacity
                  key={cat.id}
                  style={styles.catTile}
                  onPress={() => handleCategoryPress(cat.id)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.catEmoji}>{cat.emoji}</Text>
                  <Text style={styles.catLabel} numberOfLines={1}>{cat.label}</Text>
                  {count > 0 && (
                    <View style={[styles.catBadge, { backgroundColor: theme.primary }]}>
                      <Text style={styles.catBadgeText}>{count}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {groceryReminders.length === 0 && (
            <View style={styles.emptyHint}>
              <Text style={styles.emptyEmoji}>🥦</Text>
              <Text style={styles.emptyTitle}>No items tracked</Text>
              <Text style={styles.emptySubtitle}>Tap a category then + to add items</Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* Items View for selected category */}
      {viewMode === 'items' && (
        <View style={styles.flex}>
          {/* Back bar */}
          <View style={styles.subHeader}>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => { setViewMode('grid'); setSelectedCategoryId(null); }}
            >
              <Ionicons name="arrow-back" size={20} color={theme.ink} />
            </TouchableOpacity>
            <Text style={styles.subHeaderEmoji}>{selectedCat?.emoji || '🛒'}</Text>
            <Text style={styles.subHeaderTitle}>{selectedCat?.label || 'Items'}</Text>
            <Text style={styles.subHeaderCount}>({categoryItems.length})</Text>
          </View>

          {categoryItems.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>{selectedCat?.emoji || '🛒'}</Text>
              <Text style={styles.emptyTitle}>No items in {selectedCat?.label}</Text>
              <Text style={styles.emptySubtitle}>Tap + to add an item</Text>
            </View>
          ) : (
            <FlatList
              data={categoryItems}
              keyExtractor={(item) => String(item.id)}
              renderItem={renderGroceryItem}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      )}

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={openAdd} activeOpacity={0.85}>
        <Ionicons name="add" size={28} color={theme.buttonText} />
      </TouchableOpacity>

      <GroceryFormModal
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
  const tileSize = (SCREEN_WIDTH - 20 * 2 - 10 * 2) / 3; // 3-column grid with padding

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.bg,
    },
    flex: {
      flex: 1,
    },
    statsBanner: {
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
      color: theme.ink,
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
    gridContent: {
      padding: 20,
      paddingBottom: 100,
    },
    sectionLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: 14,
    },
    categoryGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    catTile: {
      width: tileSize,
      aspectRatio: 1,
      backgroundColor: theme.card,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 10,
      shadowColor: theme.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 1,
      shadowRadius: 4,
      elevation: 2,
    },
    catEmoji: {
      fontSize: 28,
      marginBottom: 6,
    },
    catLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: theme.ink,
      textAlign: 'center',
    },
    catBadge: {
      position: 'absolute',
      top: 6,
      right: 6,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 4,
    },
    catBadgeText: {
      fontSize: 10,
      fontWeight: '700',
      color: theme.buttonText,
    },
    emptyHint: {
      alignItems: 'center',
      paddingTop: 40,
    },
    emptyEmoji: {
      fontSize: 48,
      marginBottom: 12,
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
    subHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 14,
      backgroundColor: theme.card,
      borderBottomWidth: 1,
      borderBottomColor: theme.line,
      gap: 8,
    },
    backBtn: {
      padding: 4,
    },
    subHeaderEmoji: {
      fontSize: 20,
    },
    subHeaderTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: theme.ink,
    },
    subHeaderCount: {
      fontSize: 14,
      color: theme.muted,
    },
    listContent: {
      padding: 16,
      paddingBottom: 100,
    },
    itemCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.card,
      borderRadius: 14,
      padding: 12,
      marginBottom: 10,
      shadowColor: theme.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 1,
      shadowRadius: 4,
      elevation: 2,
    },
    itemIcon: {
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    itemEmoji: {
      fontSize: 22,
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
      gap: 6,
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
    backBtn: {
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
    stepRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 14,
      backgroundColor: theme.card,
      borderBottomWidth: 1,
      borderBottomColor: theme.line,
    },
    stepWrap: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    stepDot: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: theme.inputBg,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: theme.line,
    },
    stepDotText: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.muted,
    },
    stepLine: {
      width: 40,
      height: 2,
      backgroundColor: theme.line,
      marginHorizontal: 4,
    },
    stepContent: {
      padding: 20,
      paddingBottom: 40,
    },
    stepHint: {
      fontSize: 14,
      color: theme.muted,
      marginBottom: 20,
      textAlign: 'center',
    },
    categoryGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      justifyContent: 'center',
    },
    catTile: {
      width: 90,
      height: 90,
      backgroundColor: theme.card,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 8,
      shadowColor: theme.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 1,
      shadowRadius: 4,
      elevation: 2,
    },
    catEmoji: {
      fontSize: 28,
      marginBottom: 4,
    },
    catLabel: {
      fontSize: 10,
      fontWeight: '600',
      color: theme.ink,
      textAlign: 'center',
    },
    searchWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.inputBg,
      borderWidth: 1,
      borderColor: theme.inputBorder,
      borderRadius: 10,
      paddingHorizontal: 12,
      marginHorizontal: 20,
      marginTop: 12,
      marginBottom: 4,
    },
    searchInput: {
      flex: 1,
      paddingVertical: 10,
      fontSize: 15,
      color: theme.inputText,
    },
    customNameSection: {
      marginBottom: 8,
    },
    customNameRow: {
      flexDirection: 'row',
      gap: 10,
    },
    orDividerText: {
      textAlign: 'center',
      color: theme.muted,
      fontSize: 13,
      marginTop: 16,
      marginBottom: 4,
    },
    presetItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      paddingHorizontal: 14,
      backgroundColor: theme.card,
      borderRadius: 10,
      marginBottom: 6,
    },
    presetItemText: {
      fontSize: 15,
      color: theme.ink,
    },
    nextBtn: {
      backgroundColor: theme.primary,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    nextBtnText: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.buttonText,
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
    catBadgeRow: {
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
    catBadgeEmoji: {
      fontSize: 20,
    },
    catBadgeName: {
      fontSize: 15,
      color: theme.inputText,
      fontWeight: '500',
    },
    qtyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    unitScroll: {
      flexGrow: 0,
    },
    unitChip: {
      paddingHorizontal: 12,
      paddingVertical: 12,
      borderRadius: 10,
      backgroundColor: theme.inputBg,
      borderWidth: 1,
      borderColor: theme.inputBorder,
      marginRight: 6,
    },
    unitText: {
      fontSize: 13,
      fontWeight: '500',
      color: theme.ink,
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
