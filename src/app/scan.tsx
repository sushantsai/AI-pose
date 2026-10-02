import { SCENES, type Scene } from '@contract';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Camera, CommonResolutions, useCameraDevice, useCameraPermission, usePhotoOutput } from 'react-native-vision-camera';
import { Button, Chip, Screen } from '@/components/ui';
import { localSceneAnalysis } from '@/core/recommend';
import { analyzeScene } from '@/lib/coachApi';
import { aiEnabled } from '@/lib/config';
import { toAiJpegBase64 } from '@/lib/image';
import { SCENE_LABEL } from '@/lib/scenes';
import { useSession } from '@/lib/store';
import { colors, radius, space, type } from '@/lib/theme';

const fileUri = (path: string) => (path.startsWith('file://') ? path : `file://${path}`);

export default function Scan() {
  const [manual, setManual] = useState(!aiEnabled);
  return manual ? <ScenePicker /> : <SceneCamera onManual={() => setManual(true)} />;
}

function SceneCamera({ onManual }: { onManual: () => void }) {
  const device = useCameraDevice('back');
  const permission = useCameraPermission();
  const photoOutput = usePhotoOutput({ targetResolution: CommonResolutions.HD_16_9, quality: 0.8, qualityPrioritization: 'speed' });
  const session = useSession();
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const capture = async () => {
    setError(null);
    try {
      const photo = await photoOutput.capturePhoto({ flashMode: 'off', enableShutterSound: false }, {});
      const uri = fileUri(await photo.saveToTemporaryFileAsync());
      setPreview(uri);
      const base64 = await toAiJpegBase64(uri);
      const result = await analyzeScene({ imageBase64: base64, people: session.people, vibe: session.vibe, fallbackScene: session.scene });
      session.set({
        analysis: result.data,
        analysisSource: result.source,
        notice: result.notice ?? null,
        scene: result.data.scene.type,
      });
      router.replace('/suggestions');
    } catch (e) {
      setPreview(null);
      setError('Could not take the photo. Try again or pick the location manually.');
      console.warn(e);
    }
  };

  if (!permission.hasPermission) {
    return (
      <Screen style={styles.center}>
        <Text style={[type.title, { textAlign: 'center' }]}>Camera access needed</Text>
        <Text style={[type.body, { color: colors.muted, textAlign: 'center', marginVertical: space.md }]}>
          The coach needs the camera to see the location and your pose.
        </Text>
        <Button title="Allow camera" onPress={() => permission.requestPermission()} />
        <Button title="Pick the location instead" variant="ghost" onPress={onManual} style={{ marginTop: space.sm }} />
      </Screen>
    );
  }

  return (
    <View style={styles.fill}>
      {device ? <Camera style={StyleSheet.absoluteFill} device={device} isActive={!preview} outputs={[photoOutput]} resizeMode="cover" /> : null}
      {preview ? <Image source={{ uri: preview }} style={StyleSheet.absoluteFill} blurRadius={8} /> : null}
      <SafeAreaView style={styles.overlay} edges={['top', 'bottom']}>
        <View style={styles.topBar}>
          <Pressable accessibilityLabel="Close" onPress={() => router.back()} hitSlop={12} style={styles.round}>
            <Text style={styles.roundText}>✕</Text>
          </Pressable>
          <View style={styles.pill}>
            <Text style={styles.pillText}>{session.people === 2 ? '👫 Couple' : '🧍 Solo'}{session.vibe ? ` · ${session.vibe}` : ''}</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        {preview ? (
          <View style={styles.analyzing}>
            <ActivityIndicator size="large" color={colors.text} />
            <Text style={[type.title, { marginTop: space.lg }]}>Reading the scene…</Text>
            <Text style={[type.small, { marginTop: space.sm }]}>Light, background and space around you</Text>
          </View>
        ) : (
          <View style={styles.guide}>
            <View style={styles.frame} />
            <Text style={[type.heading, styles.shadowText]}>Point at the background</Text>
            <Text style={[type.small, styles.shadowText, { color: colors.text }]}>The place you want to pose in — no need to be in the shot</Text>
          </View>
        )}

        <View style={styles.bottom}>
          {error ? <Text style={[type.small, { color: colors.danger, textAlign: 'center', marginBottom: space.md }]}>{error}</Text> : null}
          <Pressable accessibilityLabel="Scan location" disabled={!!preview} onPress={capture} style={styles.shutterOuter}>
            <View style={styles.shutterInner} />
          </Pressable>
          <Pressable onPress={onManual} hitSlop={10} disabled={!!preview}>
            <Text style={[type.small, styles.shadowText, { color: colors.text, marginTop: space.lg }]}>Pick location manually</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

function ScenePicker() {
  const session = useSession();
  const pick = (scene: Scene) => {
    session.set({
      scene,
      analysis: localSceneAnalysis(scene, session.people, session.vibe),
      analysisSource: 'offline',
      notice: aiEnabled ? null : 'Offline mode — suggestions are based on the location you picked.',
    });
    router.replace('/suggestions');
  };
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: space.xl }}>
        <Pressable accessibilityLabel="Back" onPress={() => router.back()} hitSlop={12}>
          <Text style={[type.body, { color: colors.muted }]}>‹ Back</Text>
        </Pressable>
        <Text style={[type.hero, { marginTop: space.lg }]}>Where are you?</Text>
        <Text style={[type.body, { color: colors.muted, marginTop: space.sm, marginBottom: space.xl }]}>
          Pick the closest match and we will suggest poses that work there.
        </Text>
        <View style={styles.grid}>
          {SCENES.map((s) => (
            <Pressable key={s} onPress={() => pick(s)} style={({ pressed }) => [styles.sceneTile, pressed && { opacity: 0.8 }]}>
              <Text style={{ fontSize: 30 }}>{SCENE_LABEL[s].emoji}</Text>
              <Text style={[type.heading, { marginTop: space.sm }]}>{SCENE_LABEL[s].label}</Text>
            </Pressable>
          ))}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: space.lg }}>
          <Chip label={session.people === 2 ? 'Couple' : 'Solo'} selected />
          {session.vibe ? <Chip label={session.vibe} selected /> : null}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: 'black' },
  center: { justifyContent: 'center', padding: space.xl },
  overlay: { flex: 1, justifyContent: 'space-between' },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: space.lg },
  round: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  roundText: { color: colors.text, fontSize: 18, fontWeight: '700' },
  pill: { backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  pillText: { color: colors.text, fontWeight: '700', textTransform: 'capitalize' },
  guide: { alignItems: 'center', paddingHorizontal: space.xl },
  frame: { width: '80%', aspectRatio: 0.75, borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)', borderRadius: radius.lg, borderStyle: 'dashed', marginBottom: space.lg },
  analyzing: { alignItems: 'center' },
  shadowText: { textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 6 },
  bottom: { alignItems: 'center', paddingBottom: space.xl },
  shutterOuter: { width: 78, height: 78, borderRadius: 39, borderWidth: 4, borderColor: colors.text, alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 62, height: 62, borderRadius: 31, backgroundColor: colors.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  sceneTile: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: space.lg,
    marginBottom: space.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
