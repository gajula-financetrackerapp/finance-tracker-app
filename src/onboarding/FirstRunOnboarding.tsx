import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Animated,
  ImageSourcePropType,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const COMPLETED_KEY = '@moneylit/onboarding/v1';
const SCREENSHOT_RATIO = 992 / 520;

type Step = {
  image: ImageSourcePropType;
  eyebrow: string;
  title: string;
  body: string;
  from: number;
  to: number;
};

const STEPS: Step[] = [
  {
    image: require('../../assets/onboarding/home.jpg'),
    eyebrow: 'HOME · FINANCE',
    title: 'Start on Home',
    body:
      'The top row opens Finance, Reminders, Buy list and Split. Explore takes you to transactions, accounts, bank SMS import and credit cards.',
    from: 0,
    to: 0.32,
  },
  {
    image: require('../../assets/onboarding/add-transaction.jpg'),
    eyebrow: 'TAP THE PLUS BUTTON',
    title: 'Add what you spent',
    body:
      'Choose Expenses, Income or Credit card, then pick a category. MoneyLit asks you to sign in before the form opens.',
    from: 0.2,
    to: 0.52,
  },
  {
    image: require('../../assets/onboarding/charts-income.jpg'),
    eyebrow: 'CHARTS · INCOME',
    title: 'Read what you earned',
    body:
      'Pick a year, month or single day. Income shows what you earned across that period, with Smart Insights above the chart.',
    from: 0,
    to: 0.28,
  },
  {
    image: require('../../assets/onboarding/charts-expenses.jpg'),
    eyebrow: 'CHARTS · EXPENSES',
    title: 'See where it went',
    body:
      'Switch the chart to Expenses and open Breakdown. Your categories appear here after you add spending.',
    from: 0,
    to: 0.3,
  },
  {
    image: require('../../assets/onboarding/budget.jpg'),
    eyebrow: 'BUDGET',
    title: 'Set a monthly limit',
    body:
      'Tap Set budget, choose a category and enter a limit. Copy from previous month can fill this month for you.',
    from: 0,
    to: 0.2,
  },
  {
    image: require('../../assets/onboarding/reminders.jpg'),
    eyebrow: 'REMINDERS',
    title: 'Let alerts find you',
    body:
      'Add a bill, medicine dose or grocery expiry. With alerts on, reminders can arrive while the app is closed.',
    from: 0,
    to: 0.34,
  },
  {
    image: require('../../assets/onboarding/buy-list.jpg'),
    eyebrow: 'BUY LIST',
    title: 'Write the shop list',
    body:
      'Type an item and quantity, then tap Add. Tick items as you pick them up. Saving the list requires a sign-in.',
    from: 0,
    to: 0.25,
  },
  {
    image: require('../../assets/onboarding/split.jpg'),
    eyebrow: 'SPLIT',
    title: 'Share a cost',
    body:
      'Enter what was paid and each person’s share updates from the total. A few daily splits are free; Premium removes the limit.',
    from: 0,
    to: 0.3,
  },
];

type OnboardingContextValue = {
  replayOnboarding: () => void;
};

const OnboardingContext = createContext<OnboardingContextValue>({
  replayOnboarding: () => undefined,
});

export function useOnboarding(): OnboardingContextValue {
  return useContext(OnboardingContext);
}

export function FirstRunOnboardingProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<'checking' | 'app' | 'tour'>('checking');
  const [tourSession, setTourSession] = useState(0);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [completed, keys] = await Promise.all([
          AsyncStorage.getItem(COMPLETED_KEY),
          AsyncStorage.getAllKeys(),
        ]);
        if (!alive) return;
        if (completed === '1') {
          setMode('app');
          return;
        }

        // The tour is for new Play installs. Before this provider existed,
        // MoneyLit had already written app data for everyone who had opened it.
        if (keys.some((key) => key !== COMPLETED_KEY)) {
          await AsyncStorage.setItem(COMPLETED_KEY, '1');
          if (alive) setMode('app');
          return;
        }
        setMode('tour');
      } catch {
        // Onboarding must never block someone from opening MoneyLit.
        if (alive) setMode('app');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const replayOnboarding = useCallback(() => {
    setTourSession((value) => value + 1);
    setMode('tour');
  }, []);

  const finishOnboarding = useCallback(async () => {
    try {
      await AsyncStorage.setItem(COMPLETED_KEY, '1');
    } finally {
      setMode('app');
    }
  }, []);

  const value = useMemo(() => ({ replayOnboarding }), [replayOnboarding]);

  return (
    <OnboardingContext.Provider value={value}>
      {mode === 'checking' ? (
        <OnboardingBoot />
      ) : mode === 'tour' ? (
        <OnboardingScreen key={tourSession} onFinish={finishOnboarding} />
      ) : (
        children
      )}
    </OnboardingContext.Provider>
  );
}

function OnboardingBoot() {
  return (
    <View style={styles.boot}>
      <StatusBar style="dark" backgroundColor={COLORS.cream} />
      <ActivityIndicator size="large" color={COLORS.navy} />
    </View>
  );
}

function OnboardingScreen({ onFinish }: { onFinish: () => Promise<void> }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const opacity = useRef(new Animated.Value(0)).current;
  const travel = useRef(new Animated.Value(0)).current;
  const step = STEPS[index];
  const last = index === STEPS.length - 1;
  const horizontalPadding = Math.max(18, Math.min(28, width * 0.055));
  const stageWidth = Math.max(260, width - horizontalPadding * 2);
  const stageHeight = Math.max(270, Math.min(410, height * 0.45));
  const imageHeight = stageWidth * SCREENSHOT_RATIO;
  const maxTravel = Math.max(0, imageHeight - stageHeight);

  useEffect(() => {
    opacity.setValue(0);
    travel.setValue(0);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 360,
        useNativeDriver: true,
      }),
      Animated.timing(travel, {
        toValue: 1,
        duration: 6000,
        useNativeDriver: true,
      }),
    ]).start();
  }, [index, opacity, travel]);

  const translateY = travel.interpolate({
    inputRange: [0, 1],
    outputRange: [-maxTravel * step.from, -maxTravel * step.to],
  });

  return (
    <View
      style={[
        styles.screen,
        {
          paddingTop: Math.max(insets.top, 12),
          paddingBottom: Math.max(insets.bottom, 14),
          paddingHorizontal: horizontalPadding,
        },
      ]}
    >
      <StatusBar style="dark" backgroundColor={COLORS.cream} />
      <View style={styles.skipRow}>
        <Pressable
          onPress={() => void onFinish()}
          accessibilityRole="button"
          accessibilityLabel="Skip introduction"
          hitSlop={10}
        >
          <Text style={styles.skip}>Skip</Text>
        </Pressable>
      </View>

      <Animated.View
        style={[
          styles.stage,
          {
            height: stageHeight,
            opacity,
            transform: [{ translateY: opacity.interpolate({
              inputRange: [0, 1],
              outputRange: [10, 0],
            }) }],
          },
        ]}
      >
        <Animated.Image
          source={step.image}
          resizeMode="stretch"
          style={[
            styles.shot,
            {
              width: stageWidth,
              height: imageHeight,
              transform: [{ translateY }],
            },
          ]}
          accessibilityIgnoresInvertColors
        />
      </Animated.View>

      <Animated.View style={[styles.copy, { opacity }]}>
        <Text style={styles.eyebrow}>{step.eyebrow}</Text>
        <Text style={styles.title}>{step.title}</Text>
        <Text style={styles.body}>{step.body}</Text>
      </Animated.View>

      <View style={styles.footer}>
        <View style={styles.dots} accessibilityLabel={`Step ${index + 1} of ${STEPS.length}`}>
          {STEPS.map((item, dotIndex) => (
            <View
              key={item.title}
              style={[styles.dot, dotIndex === index && styles.dotActive]}
            />
          ))}
        </View>
        <View style={styles.actions}>
          <Pressable
            onPress={() => setIndex((value) => Math.max(0, value - 1))}
            disabled={index === 0}
            accessibilityRole="button"
            accessibilityLabel="Previous introduction step"
            style={({ pressed }) => [
              styles.back,
              index === 0 && styles.backDisabled,
              pressed && index > 0 && styles.pressed,
            ]}
          >
            <Text style={styles.backText}>←</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              if (last) {
                void onFinish();
              } else {
                setIndex((value) => Math.min(STEPS.length - 1, value + 1));
              }
            }}
            accessibilityRole="button"
            accessibilityLabel={last ? 'Get started with MoneyLit' : 'Continue introduction'}
            style={({ pressed }) => [styles.continue, pressed && styles.pressed]}
          >
            <Text style={styles.continueText}>{last ? 'Get started' : 'Continue'}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const COLORS = {
  navy: '#082A47',
  cream: '#F8F6F1',
  ink: '#142033',
  muted: '#727783',
  line: '#D6DAE1',
  dot: '#C9CED8',
  gold: '#D7A85A',
};

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.cream,
  },
  screen: {
    flex: 1,
    backgroundColor: COLORS.cream,
  },
  skipRow: {
    minHeight: 40,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  skip: {
    color: COLORS.muted,
    fontSize: 17,
    fontWeight: '800',
  },
  stage: {
    overflow: 'hidden',
    borderRadius: 28,
    backgroundColor: '#E8ECF2',
  },
  shot: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  copy: {
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingTop: 22,
  },
  eyebrow: {
    color: COLORS.gold,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
    letterSpacing: 1,
    textAlign: 'center',
  },
  title: {
    color: COLORS.ink,
    fontSize: 27,
    lineHeight: 33,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 6,
  },
  body: {
    color: COLORS.muted,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 8,
  },
  footer: {
    marginTop: 'auto',
    paddingTop: 12,
  },
  dots: {
    minHeight: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS.dot,
  },
  dotActive: {
    width: 24,
    backgroundColor: COLORS.navy,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
  },
  back: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: '#FFFFFF',
  },
  backDisabled: {
    opacity: 0.35,
  },
  backText: {
    color: COLORS.navy,
    fontSize: 24,
    fontWeight: '700',
    marginTop: -2,
  },
  continue: {
    flex: 1,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.navy,
  },
  continueText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
  },
  pressed: {
    opacity: 0.78,
  },
});
