import { VIBES, type Vibe } from '@contract';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { PoseSketch } from '@/components/PoseSketch';
import { Button, Chip, Screen, Segmented } from '@/components/ui';
import { buildFigure } from '@/core/poseDsl';
import { getPose, POSES } from '@/core/poses';
import { aiEnabled } from '@/lib/config';
import { useHistory, useSession } from '@/lib/store';
import { colors, radius, space, type } from '@/lib/theme';

export default function Home() {
  const { width } = useWindowDimensions();
  const people = useSession((s) => s.people);
  const vibe = useSession((s) => s.vibe);
  const setSession = useSession((s) => s.set);
  const resetSession = useSession((s) => s.reset);
  const shoots = useHistory((s) => s.shoots);

  const heroW = width - space.xl * 2;
  const heroH = 220;
  const heroFigures = useMemo(() => {
    const pose = getPose(people === 2 ? 'duo-twirl' : 'solo-victory-v')!;
    return pose.figures.map((f) => buildFigure({ ...f, height: f.height * 0.9, at: { x: f.at.x, y: f.at.y + 0.02 } }, heroW / heroH));
  }, [people, heroW]);

  const start = () => {
    resetSession();
    router.push('/scan');
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={type.label}>AI Pose Coach</Text>
          <Pressable accessibilityLabel="Settings" onPress={() => router.push('/settings')} hitSlop={12}>
            <Text style={{ fontSize: 22 }}>⚙️</Text>
          </Pressable>
        </View>

        <Text style={type.hero}>Never wonder how{'\n'}to pose again.</Text>
        <Text style={[type.body, { color: colors.muted, marginTop: space.sm }]}>
          Point at the background. Get poses that suit it. Follow the live sketch and get a post-ready photo.
        </Text>

        <View style={[styles.hero, { height: heroH }]}>
          <PoseSketch figures={heroFigures} width={heroW} height={heroH} color={colors.text} stroke={0.024} />
        </View>

        <Text style={[type.label, styles.section]}>Who is in the photo?</Text>
        <Segmented
          options={[
            { value: 1 as const, label: '🧍  Just me' },
            { value: 2 as const, label: '👫  Couple' },
          ]}
          value={people}
          onChange={(v) => setSession({ people: v })}
        />

        <Text style={[type.label, styles.section]}>Vibe (optional)</Text>
        <View style={styles.chips}>
          {VIBES.map((v) => (
            <Chip key={v} label={v} selected={vibe === v} onPress={() => setSession({ vibe: vibe === v ? null : (v as Vibe) })} />
          ))}
        </View>

        <Button title="Scan the location" icon="📷" onPress={start} style={{ marginTop: space.xl }} />
        <Button
          title={`Browse all ${POSES.length} poses`}
          variant="secondary"
          onPress={() => router.push('/library')}
          style={{ marginTop: space.md }}
        />
        {!aiEnabled ? (
          <Text style={[type.small, { textAlign: 'center', marginTop: space.md }]}>Offline mode: built-in suggestions, no AI scan.</Text>
        ) : null}

        {shoots.length > 0 ? (
          <>
            <View style={[styles.header, styles.section]}>
              <Text style={type.label}>Recent shoots</Text>
              <Pressable onPress={() => router.push('/history')} hitSlop={12}>
                <Text style={[type.small, { color: colors.accent }]}>See all</Text>
              </Pressable>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {shoots.slice(0, 10).map((s) => (
                <Pressable key={s.id} onPress={() => router.push('/history')}>
                  <Image source={{ uri: s.uri }} style={styles.thumb} contentFit="cover" />
                </Pressable>
              ))}
            </ScrollView>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: space.xxl * 2 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.lg },
  hero: { marginTop: space.xl, borderRadius: radius.lg, backgroundColor: colors.surface, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  section: { marginTop: space.xl, marginBottom: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  thumb: { width: 90, height: 120, borderRadius: radius.sm, marginRight: space.sm, backgroundColor: colors.surface },
});
