import { useMemo, useState } from 'react';
import { Linking, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useCameraPermission } from 'react-native-vision-camera';
import { PoseSketch } from '@/components/PoseSketch';
import { Button, Screen } from '@/components/ui';
import { buildFigure } from '@/core/poseDsl';
import { getPose } from '@/core/poses';
import { useSettings } from '@/lib/store';
import { colors, radius, space, type } from '@/lib/theme';

const STEPS = [
  {
    emoji: '🏞️',
    title: 'Point at the place',
    body: 'Scan the background before you pose. The AI reads the light, the space and what is around you.',
    pose: 'solo-arms-wide',
  },
  {
    emoji: '✨',
    title: 'Follow the live sketch',
    body: 'A ghost outline shows the pose on your camera. Match it — the coach tells you what to adjust, out loud.',
    pose: 'solo-classic-hip',
  },
  {
    emoji: '📲',
    title: 'Post-ready in seconds',
    body: 'It snaps when you nail it, crops for Instagram or Facebook, and writes the caption and hashtags.',
    pose: 'duo-heart-hands',
  },
];

export default function Onboarding() {
  const { width } = useWindowDimensions();
  const [step, setStep] = useState(0);
  const permission = useCameraPermission();
  const finish = useSettings((s) => s.update);
  const current = STEPS[step];

  const sketchW = width - space.xl * 2;
  const sketchH = 260;
  const figures = useMemo(
    () => getPose(current.pose)!.figures.map((f) => buildFigure(f, sketchW / sketchH)),
    [current.pose, sketchW],
  );

  const next = async () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
      return;
    }
    if (!permission.hasPermission) {
      const granted = await permission.requestPermission();
      if (!granted && !permission.canRequestPermission) {
        Linking.openSettings();
        return;
      }
    }
    finish({ onboarded: true });
  };

  return (
    <Screen style={styles.screen}>
      <View style={[styles.art, { height: sketchH }]}>
        <PoseSketch figures={figures} width={sketchW} height={sketchH} color={colors.text} stroke={0.022} />
      </View>
      <Text style={styles.emoji}>{current.emoji}</Text>
      <Text style={[type.hero, { textAlign: 'center' }]}>{current.title}</Text>
      <Text style={[type.body, styles.body]}>{current.body}</Text>

      <View style={styles.dots}>
        {STEPS.map((_, i) => (
          <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
        ))}
      </View>

      <View style={{ flex: 1 }} />
      <Button title={step < STEPS.length - 1 ? 'Next' : 'Allow camera & start'} onPress={next} />
      {step === STEPS.length - 1 ? (
        <Text style={[type.small, { textAlign: 'center', marginTop: space.md }]}>
          Pose tracking runs on your phone. Only a small preview of the background is sent for AI suggestions.
        </Text>
      ) : (
        <Button title="Skip" variant="ghost" onPress={() => setStep(STEPS.length - 1)} style={{ marginTop: space.sm }} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { padding: space.xl },
  art: { borderRadius: radius.lg, backgroundColor: colors.surface, marginTop: space.lg, marginBottom: space.xl, overflow: 'hidden' },
  emoji: { fontSize: 36, textAlign: 'center', marginBottom: space.sm },
  body: { textAlign: 'center', color: colors.muted, marginTop: space.md, paddingHorizontal: space.md },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: space.xl },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.accent, width: 24 },
});
