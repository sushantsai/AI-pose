import type { PostKit } from '@contract';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import * as MediaLibrary from 'expo-media-library';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Button, Card, Chip, Notice, Screen } from '@/components/ui';
import { FORMATS, smartCrop, subjectBounds, type PlatformFormat } from '@/core/crop';
import { createPostKit, type Sourced } from '@/lib/coachApi';
import { cropImage, toAiJpegBase64 } from '@/lib/image';
import { useHistory, useSession, type Capture } from '@/lib/store';
import { colors, radius, space, type } from '@/lib/theme';

const FORMAT_ORDER: PlatformFormat[] = ['instagram-post', 'instagram-story', 'facebook-post', 'original'];

export default function Review() {
  const { width } = useWindowDimensions();
  const session = useSession();
  const addShoot = useHistory((s) => s.add);
  const ranked = useMemo(() => [...session.captures].sort((a, b) => b.score - a.score), [session.captures]);
  const [selected, setSelected] = useState<Capture | null>(ranked[0] ?? null);
  const [format, setFormat] = useState<PlatformFormat>('instagram-post');
  const [cropResult, setCropResult] = useState<{ key: string; uri: string } | null>(null);
  const [kitResult, setKitResult] = useState<{ key: string; kit: Sourced<PostKit> } | null>(null);
  const [captionIndex, setCaptionIndex] = useState(0);
  const savedFor = useRef<string | null>(null);

  const platform = format === 'facebook-post' ? 'facebook' : 'instagram';
  const cropKey = selected ? `${selected.uri}|${format}` : '';
  const kitKey = selected ? `${selected.uri}|${platform}` : '';
  // Results are keyed by their inputs, so stale results are simply ignored.
  const cropped =
    selected && !FORMATS[format].aspect ? selected.uri : cropResult?.key === cropKey ? cropResult.uri : null;
  const kit = kitResult?.key === kitKey ? kitResult.kit : null;

  // Crop whenever the photo or format changes.
  useEffect(() => {
    const f = FORMATS[format];
    if (!selected || !f.aspect) return;
    let cancelled = false;
    const key = `${selected.uri}|${format}`;
    const rect = smartCrop({ width: selected.width, height: selected.height }, f.aspect, subjectBounds(selected.people));
    cropImage(selected.uri, rect, f.size)
      .catch(() => selected.uri)
      .then((uri) => {
        if (!cancelled) setCropResult({ key, uri });
      });
    return () => {
      cancelled = true;
    };
  }, [selected, format]);

  // Captions for the chosen photo (one AI call per photo/platform).
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    const key = `${selected.uri}|${platform}`;
    (async () => {
      const base64 = await toAiJpegBase64(selected.uri).catch(() => '');
      const result = await createPostKit({
        imageBase64: base64,
        platform,
        people: session.people,
        scene: session.scene,
        sceneSummary: session.analysis?.scene.summary ?? null,
        vibe: session.vibe,
      });
      if (!cancelled) {
        setKitResult({ key, kit: result });
        setCaptionIndex(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selected, platform, session.people, session.scene, session.vibe, session.analysis]);

  if (!selected) {
    return (
      <Screen style={{ padding: space.xl, justifyContent: 'center' }}>
        <Text style={type.title}>No photos yet</Text>
        <Button title="Back to camera" onPress={() => router.back()} style={{ marginTop: space.lg }} />
      </Screen>
    );
  }

  const previewW = width - space.xl * 2;
  const aspect = FORMATS[format].aspect ?? selected.width / selected.height;
  const caption = kit?.data.captions[captionIndex]?.text ?? '';
  const fullCaption = kit ? `${caption}\n\n${kit.data.hashtags.join(' ')}`.trim() : '';

  const remember = (uri: string) => {
    if (savedFor.current === uri) return;
    savedFor.current = uri;
    addShoot({ poseId: session.poseId ?? '', scene: session.scene, score: Math.round(selected.score), people: session.people }, uri);
  };

  const save = async () => {
    if (!cropped) return;
    const permission = await MediaLibrary.requestPermissionsAsync(true);
    if (!permission.granted) {
      Alert.alert('Photos access needed', 'Allow access to save photos to your gallery.');
      return;
    }
    await MediaLibrary.Asset.create(cropped);
    remember(cropped);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    Alert.alert('Saved', 'The photo is in your gallery.');
  };

  const share = async () => {
    if (!cropped) return;
    if (fullCaption) await Clipboard.setStringAsync(fullCaption);
    remember(cropped);
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(cropped, {
        mimeType: 'image/jpeg',
        dialogTitle: fullCaption ? 'Caption copied — paste it when you post' : 'Share photo',
        UTI: 'public.jpeg',
      });
    }
  };

  const copy = async (text: string, what: string) => {
    await Clipboard.setStringAsync(text);
    Haptics.selectionAsync().catch(() => {});
    Alert.alert('Copied', `${what} copied to the clipboard.`);
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable accessibilityLabel="Back to camera" onPress={() => router.back()} hitSlop={12}>
            <Text style={[type.body, { color: colors.muted }]}>‹ Camera</Text>
          </Pressable>
          <Pressable accessibilityLabel="Finish" onPress={() => router.dismissAll()} hitSlop={12}>
            <Text style={[type.body, { color: colors.accent, fontWeight: '700' }]}>Finish</Text>
          </Pressable>
        </View>
        <Text style={[type.hero, { marginVertical: space.md }]}>Post-ready ✨</Text>

        <View style={[styles.preview, { width: previewW, height: previewW / aspect > 560 ? 560 : previewW / aspect }]}>
          {cropped ? (
            <Image source={{ uri: cropped }} style={StyleSheet.absoluteFill} contentFit="contain" transition={150} />
          ) : (
            <ActivityIndicator color={colors.text} style={{ flex: 1 }} />
          )}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: space.md }}>
          {FORMAT_ORDER.map((f) => (
            <Chip key={f} label={FORMATS[f].label} selected={format === f} onPress={() => setFormat(f)} />
          ))}
        </ScrollView>

        {ranked.length > 1 ? (
          <>
            <Text style={[type.label, { marginTop: space.lg, marginBottom: space.sm }]}>Your shots — best match first</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {ranked.map((c, i) => (
                <Pressable key={c.uri} onPress={() => setSelected(c)} style={[styles.shot, selected.uri === c.uri && styles.shotSelected]}>
                  <Image source={{ uri: c.uri }} style={styles.shotImage} contentFit="cover" />
                  <Text style={styles.shotScore}>{i === 0 ? '★ ' : ''}{Math.round(c.score)}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </>
        ) : null}

        <Card style={{ marginTop: space.lg }}>
          <View style={styles.header}>
            <Text style={type.heading}>Caption</Text>
            {kit?.source === 'ai' ? <Text style={type.small}>✨ AI</Text> : null}
          </View>
          {!kit ? (
            <ActivityIndicator color={colors.text} style={{ marginVertical: space.lg }} />
          ) : (
            <>
              {kit.notice ? <Notice text={kit.notice} /> : null}
              {kit.data.captions.map((c, i) => (
                <Pressable key={c.style} onPress={() => setCaptionIndex(i)} style={[styles.caption, i === captionIndex && styles.captionSelected]}>
                  <Text style={type.label}>{c.style}</Text>
                  <Text style={[type.body, { marginTop: 4 }]}>{c.text}</Text>
                </Pressable>
              ))}
              <Pressable onPress={() => copy(kit.data.hashtags.join(' '), 'Hashtags')}>
                <Text style={[type.body, { color: colors.accent2, marginTop: space.md }]}>{kit.data.hashtags.join(' ')}</Text>
              </Pressable>
              {kit.data.tip ? <Text style={[type.small, { marginTop: space.md }]}>💡 {kit.data.tip}</Text> : null}
              <Button title="Copy caption + hashtags" variant="secondary" onPress={() => copy(fullCaption, 'Caption')} style={{ marginTop: space.md }} />
            </>
          )}
        </Card>
      </ScrollView>

      <View style={styles.footer}>
        <Button title="Save" variant="secondary" onPress={save} disabled={!cropped} style={{ flex: 1 }} />
        <Button title={platform === 'facebook' ? 'Share to Facebook' : 'Share to Instagram'} onPress={share} disabled={!cropped} style={{ flex: 2 }} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: 140 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  preview: { alignSelf: 'center', borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surface },
  shot: { marginRight: space.sm, borderRadius: radius.sm, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent' },
  shotSelected: { borderColor: colors.accent },
  shotImage: { width: 70, height: 96 },
  shotScore: { position: 'absolute', bottom: 4, left: 4, color: colors.text, fontWeight: '800', fontSize: 12, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 5, borderRadius: 6, overflow: 'hidden' },
  caption: { marginTop: space.sm, padding: space.md, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  captionSelected: { borderColor: colors.accent, backgroundColor: 'rgba(255,94,126,0.08)' },
  footer: { position: 'absolute', left: space.xl, right: space.xl, bottom: space.xl, flexDirection: 'row', gap: space.md },
});
