import { Image } from 'expo-image';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { Alert, FlatList, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Screen } from '@/components/ui';
import { getPose } from '@/core/poses';
import { SCENE_LABEL } from '@/lib/scenes';
import { useHistory, type Shoot } from '@/lib/store';
import { colors, radius, space, type } from '@/lib/theme';

export default function History() {
  const { width } = useWindowDimensions();
  const shoots = useHistory((s) => s.shoots);
  const remove = useHistory((s) => s.remove);
  const [open, setOpen] = useState<Shoot | null>(null);
  const tile = (width - space.xl * 2 - space.sm * 2) / 3;

  const confirmDelete = (s: Shoot) =>
    Alert.alert('Delete photo?', 'This removes it from the app (not from your gallery).', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          remove(s.id);
          setOpen(null);
        },
      },
    ]);

  return (
    <Screen>
      <FlatList
        data={shoots}
        keyExtractor={(s) => s.id}
        numColumns={3}
        columnWrapperStyle={{ gap: space.sm }}
        contentContainerStyle={{ padding: space.xl, gap: space.sm }}
        ListHeaderComponent={
          <View style={{ marginBottom: space.lg }}>
            <Pressable accessibilityLabel="Back" onPress={() => router.back()} hitSlop={12}>
              <Text style={[type.body, { color: colors.muted }]}>‹ Back</Text>
            </Pressable>
            <Text style={[type.hero, { marginTop: space.lg }]}>Your shoots</Text>
          </View>
        }
        ListEmptyComponent={<Text style={[type.body, { color: colors.muted }]}>Photos you save or share will appear here.</Text>}
        renderItem={({ item }) => (
          <Pressable onPress={() => setOpen(item)}>
            <Image source={{ uri: item.uri }} style={{ width: tile, height: tile * 1.33, borderRadius: radius.sm }} contentFit="cover" />
          </Pressable>
        )}
      />

      <Modal visible={open != null} animationType="fade" transparent onRequestClose={() => setOpen(null)}>
        {open ? (
          <SafeAreaView style={styles.modal}>
            <Image source={{ uri: open.uri }} style={{ flex: 1 }} contentFit="contain" />
            <Text style={[type.body, { textAlign: 'center', marginVertical: space.md }]}>
              {SCENE_LABEL[open.scene]?.emoji} {getPose(open.poseId)?.name ?? 'Photo'} · match {open.score}
            </Text>
            <View style={styles.actions}>
              <Button title="Delete" variant="ghost" onPress={() => confirmDelete(open)} style={{ flex: 1 }} />
              <Button title="Share" onPress={() => Sharing.shareAsync(open.uri, { mimeType: 'image/jpeg' })} style={{ flex: 1 }} />
            </View>
            <Button title="Close" variant="secondary" onPress={() => setOpen(null)} style={{ margin: space.lg }} />
          </SafeAreaView>
        ) : null}
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  modal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.96)' },
  actions: { flexDirection: 'row', gap: space.md, paddingHorizontal: space.lg },
});
