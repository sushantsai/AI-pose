export const colors = {
  bg: '#0B0B10',
  surface: '#15151D',
  surfaceRaised: '#1E1E29',
  border: '#2A2A38',
  text: '#F5F5F7',
  muted: '#9A9AAB',
  faint: '#5E5E70',
  accent: '#FF5E7E',
  accent2: '#7C5CFF',
  success: '#3DDC97',
  warning: '#FFC857',
  danger: '#FF6B6B',
  overlayGhost: 'rgba(255,255,255,0.85)',
  overlayShadow: 'rgba(0,0,0,0.35)',
} as const;

export const gradient = [colors.accent, colors.accent2] as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 10, md: 16, lg: 24, pill: 999 } as const;

export const type = {
  hero: { fontSize: 32, fontWeight: '800' as const, letterSpacing: -0.5, color: colors.text },
  title: { fontSize: 22, fontWeight: '700' as const, color: colors.text },
  heading: { fontSize: 17, fontWeight: '700' as const, color: colors.text },
  body: { fontSize: 15, fontWeight: '400' as const, color: colors.text, lineHeight: 21 },
  small: { fontSize: 13, fontWeight: '500' as const, color: colors.muted },
  label: { fontSize: 12, fontWeight: '700' as const, color: colors.muted, letterSpacing: 0.8, textTransform: 'uppercase' as const },
};

/** Score → color for the match meter. */
export function scoreColor(score: number): string {
  if (score >= 80) return colors.success;
  if (score >= 55) return colors.warning;
  return colors.accent;
}

/** Loaded in the root layout with expo-font. */
export const fonts = {
  hand: 'Caveat_700Bold',
} as const;
