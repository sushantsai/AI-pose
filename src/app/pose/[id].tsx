import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { PoseOutline } from '@/components/PoseOutline';
import { Button, Card, Screen } from '@/components/ui';
import { buildFigure } from '@/core/poseDsl';
import { getPose } from '@/core/poses';
import { useSession } from '@/lib/store';
import { colors, radius, space, type } from '@/lib/theme';

const CAMERA_TEXT = { eye: 'Phone at eye level', low: 'Phone low (waist height), tilted up', high: 'Phone slightly above, tilted down' };

export default function PoseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const pose = getPose(id ?? '');
  const { width } = useWindowDimensions();
  const setSession = useSession((s) => s.set);
  const recommendation = useSession((s) => s.analysis?.recommendations.find((r) => r.poseId === id));

  const artW = width - space.xl * 2;
  const artH = artW * 1.3;
  const figures = useMemo(() => (pose ? pose.figures.map((f) => buildFigure(f, artW / artH)) : []), [pose, artW, artH]);

  if (!pose) {
    return (
      <Screen style={{ padding: space.xl }}>
        <Text style={type.title}>Pose not found</Text>
        <Button title="Back" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  const start = () => {
    setSession({ poseId: pose.id });
    router.back();
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={type.label}>{pose.people === 2 ? 'Couple pose' : 'Solo pose'} · {pose.posture}</Text>
          <Pressable accessibilityLabel="Close" onPress={() => router.back()} hitSlop={12}>
            <Text style={{ color: colors.muted, fontSize: 20 }}>✕</Text>
          </Pressable>
        </View>
        <Text style={type.hero}>{pose.name}</Text>

        <View style={[styles.art, { height: artH }]}>
          <PoseOutline figures={figures} width={artW} height={artH} halo={false} thickness={3} hideLegs={pose.framing === 'half'} />
        </View>

        {recommendation ? (
          <Card style={{ marginBottom: space.md }}>
            <Text style={type.heading}>Why here</Text>
            <Text style={[type.body, { color: colors.muted, marginTop: 4 }]}>{recommendation.why}</Text>
            {recommendation.placement ? <Text style={[type.body, { marginTop: space.sm }]}>📍 {recommendation.placement}</Text> : null}
          </Card>
        ) : null}

        <Card>
          <Text style={type.heading}>How to do it</Text>
          {pose.cues.map((c, i) => (
            <Text key={i} style={[type.body, { marginTop: space.sm }]}>
              {i + 1}. {c}
            </Text>
          ))}
          {pose.needs ? <Text style={[type.small, { marginTop: space.md }]}>Needs {pose.needs}.</Text> : null}
        </Card>

        <Card style={{ marginTop: space.md }}>
          <Text style={type.heading}>📸 Camera</Text>
          <Text style={[type.body, { color: colors.muted, marginTop: 4 }]}>{CAMERA_TEXT[pose.camera]}.</Text>
          <Text style={[type.body, { color: colors.muted, marginTop: 4 }]}>{pose.photoTip}</Text>
        </Card>
      </ScrollView>
      <View style={styles.footer}>
        <Button title="Use this pose" icon="✨" onPress={start} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: 120 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.sm },
  art: { borderRadius: radius.lg, backgroundColor: colors.surface, marginVertical: space.lg, overflow: 'hidden' },
  footer: { position: 'absolute', left: space.xl, right: space.xl, bottom: space.xl },
});
