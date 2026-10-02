import * as Haptics from 'expo-haptics';
import { memo, useMemo } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { buildFigure } from '@/core/poseDsl';
import type { PoseDefinition } from '@/core/poses';
import { colors, radius, space } from '@/lib/theme';
import { PoseOutline } from './PoseOutline';

export type TrayTab = 'foryou' | 'solo' | 'couple';

const TABS: { id: TrayTab; label: string }[] = [
  { id: 'foryou', label: 'For you' },
  { id: 'solo', label: 'Solo' },
  { id: 'couple', label: 'Couple' },
];

const THUMB_W = 66;
const THUMB_H = 92;

const PoseThumb = memo(function PoseThumb({
  pose,
  selected,
  onPress,
}: {
  pose: PoseDefinition;
  selected: boolean;
  onPress: () => void;
}) {
  const figures = useMemo(() => pose.figures.map((f) => buildFigure(f, THUMB_W / THUMB_H)), [pose]);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={pose.name} accessibilityState={{ selected }} onPress={onPress} style={styles.item}>
      <View style={[styles.thumb, selected && styles.thumbSelected]}>
        <PoseOutline figures={figures} width={THUMB_W} height={THUMB_H} hideLegs={pose.framing === 'half'} halo={false} thickness={1.5} />
      </View>
      <Text style={[styles.thumbLabel, selected && { color: colors.text }]} numberOfLines={1}>
        {pose.name}
      </Text>
    </Pressable>
  );
});

/**
 * Bottom pose picker inside the camera: tabs, a row of pose thumbnails with a
 * "none" option, and a button for a fresh batch of AI picks.
 */
export function PoseTray({
  tab,
  onTab,
  poses,
  selectedId,
  onSelect,
  onRefresh,
  onClose,
  loading,
  caption,
}: {
  tab: TrayTab;
  onTab: (t: TrayTab) => void;
  poses: PoseDefinition[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onRefresh: () => void;
  onClose: () => void;
  loading: boolean;
  caption: string | null;
}) {
  const tap = (fn: () => void) => () => {
    Haptics.selectionAsync().catch(() => {});
    fn();
  };
  return (
    <View style={styles.tray}>
      <View style={styles.header}>
        <View style={{ width: 32 }} />
        <View style={styles.tabs}>
          {TABS.map((t) => (
            <Pressable key={t.id} onPress={tap(() => onTab(t.id))} style={[styles.tab, tab === t.id && styles.tabActive]}>
              <Text style={[styles.tabText, tab === t.id && { color: colors.text }]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable accessibilityLabel="Hide poses" onPress={tap(onClose)} hitSlop={10} style={styles.close}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      </View>

      {caption ? (
        <Text style={styles.caption} numberOfLines={1}>
          {caption}
        </Text>
      ) : null}

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.text} />
          <Text style={styles.loadingText}>Reading the scene…</Text>
        </View>
      ) : (
        <FlatList
          horizontal
          data={poses}
          keyExtractor={(p) => p.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <Pressable accessibilityLabel="No pose guide" onPress={tap(() => onSelect(null))} style={styles.item}>
              <View style={[styles.thumb, styles.none, selectedId == null && styles.thumbSelected]}>
                <Text style={styles.noneIcon}>⊘</Text>
              </View>
              <Text style={styles.thumbLabel}>None</Text>
            </Pressable>
          }
          renderItem={({ item }) => (
            <PoseThumb pose={item} selected={item.id === selectedId} onPress={tap(() => onSelect(item.id))} />
          )}
        />
      )}

      {tab === 'foryou' ? (
        <Pressable accessibilityRole="button" onPress={tap(onRefresh)} disabled={loading} style={[styles.refresh, loading && { opacity: 0.5 }]}>
          <Text style={styles.refreshText}>↻  New picks</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tray: {
    backgroundColor: '#121218',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: space.sm,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.md },
  tabs: { flexDirection: 'row', backgroundColor: '#1E1E28', borderRadius: radius.pill, padding: 3 },
  tab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.pill },
  tabActive: { backgroundColor: '#34343F' },
  tabText: { color: colors.muted, fontWeight: '700', fontSize: 13 },
  close: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1E1E28' },
  closeText: { color: colors.muted, fontWeight: '800' },
  caption: { color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: 6, paddingHorizontal: space.lg },
  list: { paddingHorizontal: space.md, paddingVertical: space.sm, gap: space.sm },
  loading: { height: THUMB_H + 34, alignItems: 'center', justifyContent: 'center', gap: 8 },
  loadingText: { color: colors.muted, fontSize: 13 },
  item: { width: THUMB_W, alignItems: 'center' },
  thumb: {
    width: THUMB_W,
    height: THUMB_H,
    borderRadius: 12,
    backgroundColor: '#2A3140',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  thumbSelected: { borderColor: colors.text },
  none: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#1E1E28' },
  noneIcon: { color: colors.muted, fontSize: 26 },
  thumbLabel: { color: colors.muted, fontSize: 11, marginTop: 4, fontWeight: '600' },
  refresh: {
    marginHorizontal: space.lg,
    marginBottom: space.sm,
    marginTop: 2,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: '#1E1E28',
    alignItems: 'center',
  },
  refreshText: { color: colors.text, fontWeight: '700', fontSize: 14 },
});
