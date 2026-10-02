import { DarkTheme, SplashScreen, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Caveat_700Bold, useFonts } from '@expo-google-fonts/caveat';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useHistory, useSettings } from '@/lib/store';
import { colors } from '@/lib/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg, card: colors.bg, text: colors.text, primary: colors.accent, border: colors.border },
};

/** Wait for persisted settings so first launch does not flash the wrong screen. */
function useHydrated() {
  const [ready, setReady] = useState(() => useSettings.persist.hasHydrated() && useHistory.persist.hasHydrated());
  useEffect(() => {
    const check = () => setReady(useSettings.persist.hasHydrated() && useHistory.persist.hasHydrated());
    const unsubs = [useSettings.persist.onFinishHydration(check), useHistory.persist.onFinishHydration(check)];
    check();
    return () => unsubs.forEach((u) => u());
  }, []);
  return ready;
}

export default function RootLayout() {
  const hydrated = useHydrated();
  const [fontsLoaded, fontError] = useFonts({ Caveat_700Bold });
  const onboarded = useSettings((s) => s.onboarded);
  // A missing font only changes how notes look; never block the app on it.
  const ready = hydrated && (fontsLoaded || fontError != null);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider value={theme}>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'slide_from_right' }}>
          <Stack.Protected guard={!onboarded}>
            <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
          </Stack.Protected>
          <Stack.Protected guard={onboarded}>
            <Stack.Screen name="index" options={{ animation: 'fade' }} />
            <Stack.Screen name="pose/[id]" options={{ presentation: 'modal' }} />
            <Stack.Screen name="review" />
            <Stack.Screen name="history" />
            <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
          </Stack.Protected>
        </Stack>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
