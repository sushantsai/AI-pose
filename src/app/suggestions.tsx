import { SCENES } from '@contract';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { PoseCard } from '@/components/PoseCard';
import { Card, Chip, Notice, Screen } from '@/components/ui';
import { getPose } from '@/core/poses';
import { localSceneAnalysis } from '@/core/recommend';
import { SCENE_LABEL } from '@/lib/scenes';
import { useSession } from '@/lib/store';
import { colors, space, type } from '@/lib/theme';

export default function Suggestions() {
  const { width } = useWindowDimensions();
  const session = useSession();
  const analysis = session.analysis;
  const cardW = (width - space.xl * 2 - space.md) / 2;

  if (!analysis) {
    return (
      <Screen style={{ padding: space.xl }}>
        <Text style={type.title}>No scan yet</Text>
        <Chip label="Scan the location" onPress={() => router.replace('/scan')} />
      </Screen>
    );
  }

  const scene = SCENE_LABEL[analysis.scene.type];
  const recs = analysis.recommendations
    .map((r) => ({ rec: r, pose: getPose(r.poseId) }))
    .filter((x): x is { rec: typeof x.rec; pose: NonNullable<typeof x.pose> } => x.pose != null);

  const changeScene = (s: (typeof SCENES)[number]) =>
    session.set({ scene: s, analysis: localSceneAnalysis(s, session.people, session.vibe), analysisSource: 'offline' });

  const choose = (poseId: string) => router.push({ pathname: '/pose/[id]', params: { id: poseId } });

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable accessibilityLabel="Back" onPress={() => router.back()} hitSlop={12}>
          <Text style={[type.body, { color: colors.muted }]}>‹ Back</Text>
        </Pressable>

        <Text style={[type.label, { marginTop: space.lg }]}>{session.analysisSource === 'ai' ? 'AI scene read' : 'Your location'}</Text>
        <Text style={[type.hero, { marginTop: space.xs }]}>
          {scene.emoji} {scene.label}
        </Text>
        <Text style={[type.body, { color: colors.muted, marginTop: space.xs }]}>{analysis.scene.summary}</Text>

        {session.notice ? <View style={{ marginTop: space.md }}><Notice text={session.notice} /></View> : null}

        <Card style={{ marginTop: space.lg }}>
          <Text style={type.heading}>☀️ Light</Text>
          <Text style={[type.body, { color: colors.muted, marginTop: 4 }]}>{analysis.scene.lighting}</Text>
          {analysis.photographerTips.length > 0 ? (
            <>
              <Text style={[type.heading, { marginTop: space.md }]}>📸 For the photographer</Text>
              {analysis.photographerTips.map((t, i) => (
                <Text key={i} style={[type.body, { color: colors.muted, marginTop: 4 }]}>
                  • {t}
                </Text>
              ))}
              <Text style={[type.small, { marginTop: space.sm }]}>
                Hold the phone {analysis.framing.orientation} at {analysis.framing.cameraHeight === 'eye' ? 'eye level' : analysis.framing.cameraHeight === 'low' ? 'waist height, tilted up' : 'slightly above, tilted down'}.
              </Text>
            </>
          ) : null}
        </Card>

        <Text style={[type.title, { marginTop: space.xl, marginBottom: space.md }]}>Poses for this spot</Text>
        <View style={styles.grid}>
          {recs.map(({ rec, pose }) => (
            <View key={pose.id} style={{ width: cardW, marginBottom: space.md }}>
              <PoseCard pose={pose} width={cardW} subtitle={rec.why} onPress={() => choose(pose.id)} />
              {rec.placement ? <Text style={[type.small, { marginTop: 6 }]}>📍 {rec.placement}</Text> : null}
            </View>
          ))}
        </View>

        {session.analysisSource === 'offline' ? (
          <>
            <Text style={[type.label, { marginTop: space.lg, marginBottom: space.md }]}>Not quite right? Change location</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {SCENES.map((s) => (
                <Chip key={s} label={`${SCENE_LABEL[s].emoji} ${SCENE_LABEL[s].label}`} selected={s === session.scene} onPress={() => changeScene(s)} />
              ))}
            </View>
          </>
        ) : null}

        <Pressable onPress={() => router.push('/library')} style={{ marginTop: space.lg }}>
          <Text style={[type.body, { color: colors.accent, textAlign: 'center' }]}>See all poses →</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: space.xxl * 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
});
