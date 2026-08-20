import React, { useEffect, useMemo, useState } from 'react';
import { Keyboard, Platform, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import { useFinance } from '../FinanceContext';
import { requireAuthToSave } from '../authGate';
import { WorkspaceProvider, useWorkspace } from '../WorkspaceContext';
import type { ThemeTokens } from '../types';
import { AuthModal, SignInRequiredModal } from '../components/Shared';
import { AppDialogHost } from '../components/AppDialog';
import { WorkspaceSwitcher } from '../components/WorkspaceSwitcher';
import { BreathingAccent } from '../components/PremiumChrome';
import { ProfileAvatar } from '../components/ProfileAvatar';
import { userInitial } from '../data/avatars';
import { HomeScreen, AddModal } from '../screens/HomeScreen';
import { ChartsScreen } from '../screens/ChartsScreen';
import { ReportsScreen } from '../screens/ReportsScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { AppSettingsScreen } from '../screens/AppSettingsScreen';
import { LanguageSettingsScreen } from '../screens/LanguageSettingsScreen';
import { LegalDocumentScreen } from '../screens/LegalDocumentScreen';
import { HelpScreen } from '../screens/HelpScreen';
import { FaqScreen } from '../screens/FaqScreen';
import { AboutScreen } from '../screens/AboutScreen';
import { FeedbackScreen } from '../screens/FeedbackScreen';
import { PremiumCompareScreen } from '../screens/PremiumCompareScreen';
import { CalendarScreen } from '../screens/CalendarScreen';
import { TxnListScreen } from '../screens/TxnListScreen';
import { ReminderHubScreen } from '../screens/ReminderScreens';
import {
  ExpenseReminderScreen,
  MedicineReminderScreen,
  GroceryReminderScreen,
  GeneralReminderScreen,
} from '../screens/MoreScreens';
import { AdminScreen, ShoppingListScreen } from '../screens/ShoppingAdminScreens';
import { SplitWorkspaceScreen } from '../screens/SplitWorkspaceScreen';
import { AlarmSettingsScreen } from '../screens/AlarmSettingsScreen';
import { MyProfileScreen } from '../screens/MyProfileScreen';
import { CategorySettingsScreen } from '../screens/CategorySettingsScreen';
import { ThemesScreen } from '../screens/ThemesScreen';
import { AvatarSettingsScreen } from '../screens/AvatarSettingsScreen';
import { HomePageSettingsScreen } from '../screens/HomePageSettingsScreen';
import { DiamondsScreen } from '../screens/DiamondsScreen';
import { MyCashBooksScreen } from '../screens/MyCashBooksScreen';
import { AccountsScreen } from '../screens/AccountsScreen';
import { AllTransactionsScreen } from '../screens/AllTransactionsScreen';
import { ImportTransactionsScreen } from '../screens/ImportTransactionsScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { DeleteAccountScreen } from '../screens/DeleteAccountScreen';
import { useGoogleAdBannerOffset } from '../components/GoogleAdBanner';
import { initializeGoogleAds } from '../lib/googleAds';
import { SlidingBottomTabBar } from '../components/SlidingBottomTabBar';
import { FadeSlideIn } from '../components/SlidingPillTabs';
import { RootStackParamList } from './types';
import { useT } from '../i18n/useT';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();

function TabIcon({
  iconKey,
  focused,
  activeColor,
  inactiveColor,
}: {
  iconKey: 'Home' | 'Charts' | 'Budget' | 'Profile';
  focused: boolean;
  activeColor: string;
  inactiveColor: string;
}) {
  const { session, isGuest } = useFinance();
  const { theme } = useApp();

  if (iconKey === 'Profile') {
    return (
      <View
        style={{
          opacity: focused ? 1 : 0.72,
          transform: [{ scale: focused ? 1.08 : 1 }],
          borderRadius: 13,
          borderWidth: focused ? 2 : 0,
          borderColor: theme.header,
          padding: focused ? 1 : 0,
        }}
      >
        {isGuest ? (
          <Text style={{ fontSize: 20 }}>👤</Text>
        ) : (
          <ProfileAvatar
            initial={userInitial(null, session?.user?.email)}
            size={24}
            animate={false}
          />
        )}
      </View>
    );
  }

  const icons: Record<'Home' | 'Charts' | 'Budget', string> = {
    Home: '🏠',
    Charts: '📊',
    Budget: '🧾',
  };
  return (
    <Text
      style={{
        fontSize: 20,
        opacity: focused ? 1 : 0.55,
        transform: [{ scale: focused ? 1.06 : 1 }],
      }}
    >
      {icons[iconKey]}
    </Text>
  );
}

function EmptyAdd() {
  return <View style={{ flex: 1 }} />;
}

function MainTabs({
  onTabChange,
  showAds,
}: {
  onTabChange: (name: string) => void;
  showAds?: boolean;
}) {
  const { theme, config } = useApp();
  const { t } = useT();
  const { setShowAdd, setEditingTxn } = useFinance();
  const { workspace, setWorkspace } = useWorkspace();
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 10);
  const styles = useMemo(() => makeNavStyles(theme), [theme]);
  // Prefer deep header over pale premium accents so labels stay vivid on white.
  const tabActive = theme.header;
  const tabInactive = theme.ink;
  const financeOn = config.features.finance !== false;
  const chartsOn = financeOn && config.features.financeCharts !== false;
  const budgetOn = financeOn && config.features.financeReports !== false;
  const showFab = workspace === 'finance' && financeOn;

  const goFinance = () => {
    if (financeOn) setWorkspace('finance');
  };

  const hideTab = { display: 'none' as const };

  return (
    <Tab.Navigator
      tabBar={(props) => <SlidingBottomTabBar {...props} showAds={showAds} />}
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: tabActive,
        tabBarInactiveTintColor: `${tabInactive}99`,
        tabBarLabelStyle: styles.tabLabel,
      }}
      screenListeners={{
        state: (e) => {
          const state = e.data.state;
          if (!state) return;
          const route = state.routes[state.index];
          if (route?.name) onTabChange(route.name);
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: t('tabs.home'),
          tabBarLabel: t('tabs.home'),
          tabBarButton: financeOn ? undefined : () => null,
          tabBarItemStyle: financeOn ? undefined : hideTab,
          tabBarIcon: ({ focused }) => (
            <TabIcon
              iconKey="Home"
              focused={focused}
              activeColor={tabActive}
              inactiveColor={`${tabInactive}99`}
            />
          ),
        }}
        listeners={{
          tabPress: (e) => {
            if (!financeOn) {
              e.preventDefault();
              return;
            }
            goFinance();
          },
        }}
      />
      <Tab.Screen
        name="Charts"
        component={ChartsScreen}
        options={{
          title: t('tabs.charts'),
          tabBarLabel: t('tabs.charts'),
          tabBarButton: chartsOn ? undefined : () => null,
          tabBarItemStyle: chartsOn ? undefined : hideTab,
          tabBarIcon: ({ focused }) => (
            <TabIcon
              iconKey="Charts"
              focused={focused}
              activeColor={tabActive}
              inactiveColor={`${tabInactive}99`}
            />
          ),
        }}
        listeners={{
          tabPress: (e) => {
            if (!chartsOn) {
              e.preventDefault();
              return;
            }
            goFinance();
          },
        }}
      />
      <Tab.Screen
        name="Add"
        component={EmptyAdd}
        options={{
          tabBarLabel: () => null,
          tabBarButton: financeOn ? undefined : () => null,
          tabBarItemStyle: financeOn ? undefined : hideTab,
          tabBarIcon: () =>
            showFab ? (
              <View style={[styles.fabWrap, { top: -18 - Math.min(bottomPad, 12) }]}>
                <BreathingAccent style={styles.fab}>
                  <Text style={styles.fabText}>+</Text>
                </BreathingAccent>
              </View>
            ) : (
              <View style={{ width: 58, height: 28 }} />
            ),
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            if (!showFab) {
              goFinance();
              return;
            }
            if (!requireAuthToSave('add transactions')) return;
            setEditingTxn(null);
            setShowAdd(true);
          },
        }}
      />
      <Tab.Screen
        name="Budget"
        component={ReportsScreen}
        options={{
          title: t('tabs.budget'),
          tabBarLabel: t('tabs.budget'),
          tabBarButton: budgetOn ? undefined : () => null,
          tabBarItemStyle: budgetOn ? undefined : hideTab,
          tabBarIcon: ({ focused }) => (
            <TabIcon
              iconKey="Budget"
              focused={focused}
              activeColor={tabActive}
              inactiveColor={`${tabInactive}99`}
            />
          ),
        }}
        listeners={{
          tabPress: (e) => {
            if (!budgetOn) {
              e.preventDefault();
              return;
            }
            goFinance();
          },
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: t('tabs.profile'),
          tabBarLabel: t('tabs.profile'),
          tabBarIcon: ({ focused }) => (
            <TabIcon
              iconKey="Profile"
              focused={focused}
              activeColor={tabActive}
              inactiveColor={`${tabInactive}99`}
            />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

/** Top workspace switcher + Finance tabs; Reminders / Buy list overlay — hidden on Profile. */
function MainShell() {
  const { theme, config } = useApp();
  const { showAdd } = useFinance();
  const { workspace } = useWorkspace();
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 10);
  const tabBarHeight = 56 + bottomPad;
  const adOffset = useGoogleAdBannerOffset();
  const [activeTab, setActiveTab] = React.useState('Home');
  const [keyboardBottom, setKeyboardBottom] = React.useState(0);
  const onProfile = activeTab === 'Profile';
  const styles = useMemo(() => makeNavStyles(theme), [theme]);
  const remindersOn = config.features.reminders !== false;
  const shoppingOn = config.features.shoppingList !== false;
  const splitOn = config.features.splitExpense !== false;
  const showWorkspaceOverlay =
    !onProfile &&
    ((workspace === 'reminders' && remindersOn) ||
      (workspace === 'shopping' && shoppingOn) ||
      (workspace === 'split' && splitOn));
  // Home has its own banner below the summary; Charts/Budget use the tab-bar banner.
  const showAds = !onProfile && !showAdd && activeTab !== 'Home' && adOffset > 0;

  useEffect(() => {
    void initializeGoogleAds();
  }, []);

  useEffect(() => {
    if (!showWorkspaceOverlay) {
      setKeyboardBottom(0);
      return;
    }
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = Keyboard.addListener(showEvt, (e) => {
      setKeyboardBottom(e.endCoordinates?.height ?? 0);
    });
    const onHide = Keyboard.addListener(hideEvt, () => setKeyboardBottom(0));
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, [showWorkspaceOverlay]);

  return (
    <View style={styles.shell}>
      {/* Hide while Add is open — Android elevation can draw above Modals. */}
      {!onProfile && !showAdd ? <WorkspaceSwitcher /> : null}
      <View style={styles.shellBody}>
        <MainTabs onTabChange={setActiveTab} showAds={showAds} />
        {showWorkspaceOverlay ? (
          <View
            pointerEvents="auto"
            style={[
              styles.workspaceOverlay,
              {
                // Sit above the tab bar (+ ad banner) normally; when the keyboard is open, sit
                // above the keyboard so Split/Reminders/Shopping inputs stay visible.
                bottom: Math.max(tabBarHeight + (showAds ? adOffset : 0), keyboardBottom),
                backgroundColor: theme.bg,
              },
            ]}
          >
            <View style={[styles.workspacePanel, { backgroundColor: theme.bg }]}>
              <FadeSlideIn activeKey={workspace} style={{ flex: 1 }}>
                {workspace === 'reminders' && remindersOn ? <ReminderHubScreen /> : null}
                {workspace === 'shopping' && shoppingOn ? <ShoppingListScreen /> : null}
                {workspace === 'split' && splitOn ? <SplitWorkspaceScreen /> : null}
              </FadeSlideIn>
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

export function AppNavigator() {
  const { theme, config } = useApp();
  const { t } = useT();

  const navTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: theme.bg,
      card: theme.card,
      text: theme.ink,
      border: theme.line,
      primary: theme.primaryDark,
    },
  };

  return (
    <WorkspaceProvider>
      <NavigationContainer key={config.language || 'en'} theme={navTheme}>
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: theme.header },
            headerTintColor: '#fff',
            headerTitleStyle: { fontWeight: '800' },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: theme.bg },
            statusBarStyle: 'light',
          }}
        >
          <Stack.Screen
            name="Dashboard"
            component={MainShell}
            options={{ headerShown: false, title: config.appName }}
          />
          <Stack.Screen
            name="Calendar"
            component={CalendarScreen}
            options={{
              title: t('settings.calendar'),
              headerShadowVisible: false,
              contentStyle: { backgroundColor: theme.card },
            }}
          />
          <Stack.Screen
            name="TxnList"
            component={TxnListScreen}
            options={{ title: t('txns.title') }}
          />
          <Stack.Screen name="ReminderHub" component={ReminderHubScreen} options={{ title: t('reminders.title') }} />
          <Stack.Screen name="ExpenseReminder" component={ExpenseReminderScreen} options={{ title: t('reminders.expense') }} />
          <Stack.Screen name="MedicineReminder" component={MedicineReminderScreen} options={{ title: t('reminders.medicine') }} />
          <Stack.Screen name="GroceryReminder" component={GroceryReminderScreen} options={{ title: t('reminders.grocery') }} />
          <Stack.Screen name="GeneralReminder" component={GeneralReminderScreen} options={{ title: t('reminders.general') }} />
          <Stack.Screen name="ShoppingList" component={ShoppingListScreen} options={{ title: t('workspace.shopping') }} />
          <Stack.Screen name="Admin" component={AdminScreen} options={{ title: t('profile.admin') }} />
          <Stack.Screen
            name="AppSettings"
            component={AppSettingsScreen}
            options={{ title: t('settings.title') }}
          />
          <Stack.Screen
            name="AlarmSettings"
            component={AlarmSettingsScreen}
            options={{ title: t('settings.alarms') }}
          />
          <Stack.Screen
            name="MyProfile"
            component={MyProfileScreen}
            options={{ title: t('settings.myProfile') }}
          />
          <Stack.Screen
            name="CategorySettings"
            component={CategorySettingsScreen}
            options={{ title: t('settings.categories') }}
          />
          <Stack.Screen name="Themes" component={ThemesScreen} options={{ title: t('themes.title') }} />
          <Stack.Screen
            name="AvatarSettings"
            component={AvatarSettingsScreen}
            options={{ title: t('settings.avatar') }}
          />
          <Stack.Screen
            name="HomePageSettings"
            component={HomePageSettingsScreen}
            options={{ title: t('settings.homePage') }}
          />
          <Stack.Screen
            name="Diamonds"
            component={DiamondsScreen}
            options={{ title: t('diamonds.title') }}
          />
          <Stack.Screen
            name="MyCashBooks"
            component={MyCashBooksScreen}
            options={{ title: t('settings.cashBooks') }}
          />
          <Stack.Screen name="Accounts" component={AccountsScreen} options={{ title: t('accounts.title') }} />
          <Stack.Screen
            name="AllTransactions"
            component={AllTransactionsScreen}
            options={{ title: t('allTxns.title') }}
          />
          <Stack.Screen
            name="ImportTransactions"
            component={ImportTransactionsScreen}
            options={{ title: t('import.title') }}
          />
          <Stack.Screen
            name="LanguageSettings"
            component={LanguageSettingsScreen}
            options={{ title: t('language.title') }}
          />
          <Stack.Screen
            name="LegalDocument"
            component={LegalDocumentScreen}
            options={({ route }) => ({
              title:
                route.params.kind === 'terms' ? t('settings.terms') : t('settings.privacy'),
            })}
          />
          <Stack.Screen name="Help" component={HelpScreen} options={{ title: t('settings.help') }} />
          <Stack.Screen name="Faq" component={FaqScreen} options={{ title: t('settings.faq') }} />
          <Stack.Screen name="About" component={AboutScreen} options={{ title: t('settings.about') }} />
          <Stack.Screen
            name="Feedback"
            component={FeedbackScreen}
            options={{ title: t('settings.feedback') }}
          />
          <Stack.Screen
            name="PremiumCompare"
            component={PremiumCompareScreen}
            options={{ title: t('premium.title') }}
          />
          <Stack.Screen
            name="Notifications"
            component={NotificationsScreen}
            options={{ title: t('notifications.title') }}
          />
          <Stack.Screen
            name="DeleteAccount"
            component={DeleteAccountScreen}
            options={{ title: t('deleteAccount.title') }}
          />
        </Stack.Navigator>
        <AppDialogHost />
        <SignInRequiredModal />
        <AuthModal />
        <AddModal />
      </NavigationContainer>
    </WorkspaceProvider>
  );
}

function makeNavStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    shell: { flex: 1, backgroundColor: theme.bg },
    shellBody: { flex: 1 },
    workspaceOverlay: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 2,
      elevation: 2,
      overflow: 'hidden',
    },
    workspacePanel: {
      flex: 1,
      backgroundColor: theme.bg,
    },
    tabLabel: { fontSize: 11, fontWeight: '700' },
    fabWrap: {
      position: 'absolute',
      top: -22,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2,
      elevation: 4,
    },
    fab: {
      width: 58,
      height: 58,
      borderRadius: 29,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.18,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
      overflow: 'hidden',
    },
    fabText: { color: '#fff', fontSize: 30, fontWeight: '700', marginTop: -2 },
  });
}
