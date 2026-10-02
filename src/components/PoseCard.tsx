import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { buildFigure } from '@/core/poseDsl';
import type { PoseDefinition } from '@/core/poses';
import { colors, radius, space, type } from '@/lib/theme';
import { PoseSketch } from './PoseSketch';

/** Card with a sketch thumbnail of the pose. */
export function PoseCard({
  pose,
  width,
  subtitle,
  onPress,
  selected,
}: {
  pose: PoseDefinition;
  width: number;
  subtitle?: string;
  onPress: () => void;
  selected?: boolean;
}) {
  const thumbH = width * 1.25;
  const figures = useMemo(() => pose.figures.map((f) => buildFigure(f, width / thumbH)), [pose, width, thumbH]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${pose.name} pose`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, { width, opacity: pressed ? 0.85 : 1 }, selected && styles.selected]}
    >
      <View style={[styles.thumb, { height: thumbH }]}>
        <PoseSketch figures={figures} width={width} height={thumbH} color={colors.text} stroke={0.022} hideLegs={pose.framing === 'half'} />
        <View style={styles.badges}>
          <Text style={styles.badge}>{pose.people === 2 ? '👫' : '🧍'}</Text>
          {pose.needs ? <Text style={styles.badge}>📍</Text> : null}
        </View>
      </View>
      <View style={styles.meta}>
        <Text style={type.heading} numberOfLines={1}>
          {pose.name}
        </Text>
        <Text style={type.small} numberOfLines={2}>
          {subtitle ?? pose.vibes.join(' · ')}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  selected: { borderColor: colors.accent, borderWidth: 2 },
  thumb: { backgroundColor: '#1A1A26' },
  badges: { position: 'absolute', top: space.sm, right: space.sm, flexDirection: 'row', gap: 4 },
  badge: { fontSize: 14 },
  meta: { padding: space.md, gap: 2 },
});
