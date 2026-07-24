import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
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
import { HomeScreen, AddModal } from '../screens/HomeScreen';
import { ChartsScreen } from '../screens/ChartsScreen';
import { ReportsScreen } from '../screens/ReportsScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { AppSettingsScreen } from '../screens/AppSettingsScreen';
import { LanguageSettingsScreen } from '../screens/LanguageSettingsScreen';
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
import { AlarmSettingsScreen } from '../screens/AlarmSettingsScreen';
import { MyProfileScreen } from '../screens/MyProfileScreen';
import { CategorySettingsScreen } from '../screens/CategorySettingsScreen';
import { ThemesScreen } from '../screens/ThemesScreen';
import { AvatarSettingsScreen } from '../screens/AvatarSettingsScreen';
import { HomePageSettingsScreen } from '../screens/HomePageSettingsScreen';
import { MyCashBooksScreen } from '../screens/MyCashBooksScreen';
import { AccountsScreen } from '../screens/AccountsScreen';
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
  const icons: Record<string, string> = {
    Home: '⌂',
    Charts: '◉',
    Budget: '☰',
    Profile: '☺',
  };
  return (
    <Text
      style={{
        fontSize: 18,
        color: focused ? activeColor : inactiveColor,
        fontWeight: focused ? '800' : '500',
      }}
    >
      {icons[iconKey] || '•'}
    </Text>
  );
}

function EmptyAdd() {
  return <View style={{ flex: 1 }} />;
}

function MainTabs({ onTabChange }: { onTabChange: (name: string) => void }) {
  const { theme } = useApp();
  const { t } = useT();
  const { setShowAdd, setEditingTxn } = useFinance();
  const { workspace, setWorkspace } = useWorkspace();
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 10);
  const tabBarHeight = 56 + bottomPad;
  const styles = useMemo(() => makeNavStyles(theme), [theme]);
  // Prefer deep header over pale premium accents so labels stay vivid on white.
  const tabActive = theme.header;
  const tabInactive = theme.ink;
  const showFab = workspace === 'finance';

  const goFinance = () => setWorkspace('finance');

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: tabActive,
        tabBarInactiveTintColor: `${tabInactive}99`,
        tabBarStyle: {
          height: tabBarHeight,
          paddingBottom: bottomPad,
          paddingTop: 6,
          borderTopColor: theme.line,
          backgroundColor: theme.card,
          overflow: 'visible',
          zIndex: 4,
          elevation: 8,
        },
        tabBarItemStyle: {
          overflow: 'visible',
        },
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
          tabPress: () => goFinance(),
        }}
      />
      <Tab.Screen
        name="Charts"
        component={ChartsScreen}
        options={{
          title: t('tabs.charts'),
          tabBarLabel: t('tabs.charts'),
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
          tabPress: () => goFinance(),
        }}
      />
      <Tab.Screen
        name="Add"
        component={EmptyAdd}
        options={{
          tabBarLabel: () => null,
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
          tabPress: () => goFinance(),
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
  const { theme } = useApp();
  const { workspace } = useWorkspace();
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 10);
  const tabBarHeight = 56 + bottomPad;
  const [activeTab, setActiveTab] = React.useState('Home');
  const onProfile = activeTab === 'Profile';
  const styles = useMemo(() => makeNavStyles(theme), [theme]);
  const showWorkspaceOverlay = !onProfile && workspace !== 'finance';

  return (
    <View style={styles.shell}>
      {!onProfile ? <WorkspaceSwitcher /> : null}
      <View style={styles.shellBody}>
        <MainTabs onTabChange={setActiveTab} />
        {showWorkspaceOverlay ? (
          <View
            pointerEvents="auto"
            style={[
              styles.workspaceOverlay,
              {
                bottom: tabBarHeight,
                backgroundColor: theme.bg,
              },
            ]}
          >
            <View style={[styles.workspacePanel, { backgroundColor: theme.bg }]}>
              {workspace === 'reminders' ? <ReminderHubScreen /> : null}
              {workspace === 'shopping' ? <ShoppingListScreen /> : null}
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
      <NavigationContainer theme={navTheme}>
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
            options={({ route }) => ({
              title: route.params.kind === 'expense' ? t('home.expenses') : t('home.income'),
            })}
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
            name="MyCashBooks"
            component={MyCashBooksScreen}
            options={{ title: t('settings.cashBooks') }}
          />
          <Stack.Screen name="Accounts" component={AccountsScreen} options={{ title: t('accounts.title') }} />
          <Stack.Screen
            name="LanguageSettings"
            component={LanguageSettingsScreen}
            options={{ title: t('language.title') }}
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
      zIndex: 5,
      elevation: 10,
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
      elevation: 6,
      overflow: 'hidden',
    },
    fabText: { color: '#fff', fontSize: 30, fontWeight: '700', marginTop: -2 },
  });
}
