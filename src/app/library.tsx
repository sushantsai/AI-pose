import { SCENES, type Scene } from '@contract';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { PoseCard } from '@/components/PoseCard';
import { Chip, Screen, Segmented } from '@/components/ui';
import { POSES, type Posture } from '@/core/poses';
import { SCENE_LABEL } from '@/lib/scenes';
import { useSession } from '@/lib/store';
import { colors, space, type } from '@/lib/theme';

const POSTURES: Posture[] = ['standing', 'sitting', 'leaning', 'walking', 'crouching', 'jumping'];

export default function Library() {
  const { width } = useWindowDimensions();
  const people = useSession((s) => s.people);
  const setSession = useSession((s) => s.set);
  const [scene, setScene] = useState<Scene | null>(null);
  const [posture, setPosture] = useState<Posture | null>(null);
  const cardW = (width - space.xl * 2 - space.md) / 2;

  const poses = useMemo(
    () =>
      POSES.filter(
        (p) => p.people === people && (!scene || p.scenes.includes(scene)) && (!posture || p.posture === posture),
      ),
    [people, scene, posture],
  );

  return (
    <Screen>
      <FlatList
        data={poses}
        keyExtractor={(p) => p.id}
        numColumns={2}
        columnWrapperStyle={{ justifyContent: 'space-between' }}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={{ marginBottom: space.lg }}>
            <Pressable accessibilityLabel="Back" onPress={() => router.back()} hitSlop={12}>
              <Text style={[type.body, { color: colors.muted }]}>‹ Back</Text>
            </Pressable>
            <Text style={[type.hero, { marginVertical: space.lg }]}>Pose library</Text>
            <Segmented
              options={[
                { value: 1 as const, label: '🧍 Solo' },
                { value: 2 as const, label: '👫 Couple' },
              ]}
              value={people}
              onChange={(v) => setSession({ people: v })}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: space.lg }}>
              <Chip label="All places" selected={!scene} onPress={() => setScene(null)} />
              {SCENES.map((s) => (
                <Chip key={s} label={`${SCENE_LABEL[s].emoji} ${SCENE_LABEL[s].label}`} selected={scene === s} onPress={() => setScene(scene === s ? null : s)} />
              ))}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <Chip label="Any posture" selected={!posture} onPress={() => setPosture(null)} />
              {POSTURES.map((p) => (
                <Chip key={p} label={p} selected={posture === p} onPress={() => setPosture(posture === p ? null : p)} />
              ))}
            </ScrollView>
          </View>
        }
        ListEmptyComponent={<Text style={[type.body, { color: colors.muted }]}>No poses match these filters yet.</Text>}
        renderItem={({ item }) => (
          <View style={{ marginBottom: space.md }}>
            <PoseCard pose={item} width={cardW} onPress={() => router.push({ pathname: '/pose/[id]', params: { id: item.id } })} />
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: space.xxl * 2 },
});
