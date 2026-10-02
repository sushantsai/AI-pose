import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Linking, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { Camera, CommonResolutions, useCameraDevice, useCameraPermission, usePhotoOutput } from 'react-native-vision-camera';
import { LimbNotes, PoseOutline } from '@/components/PoseOutline';
import { PoseTray, type TrayTab } from '@/components/PoseTray';
import { Button, Screen } from '@/components/ui';
import { annotationsFor, cueSentence } from '@/core/annotations';
import { captureReducer, countdownSeconds, DEFAULT_CAPTURE, holdProgress, type CaptureConfig, type CaptureState } from '@/core/capture';
import type { Person } from '@/core/keypoints';
import { evaluateShot, type ShotEvaluation } from '@/core/matching';
import { peopleInFrame, peopleInView } from '@/core/movenet';
import { buildFigure, mirrorFigure } from '@/core/poseDsl';
import { getPose, posesFor, type PoseDefinition } from '@/core/poses';
import { defaultPicks } from '@/core/recommend';
import { smoothPeople } from '@/core/smoothing';
import { usePoseDetector, type Detection } from '@/features/coach/usePoseDetector';
import { analyzeScene } from '@/lib/coachApi';
import { aiEnabled } from '@/lib/config';
import { imageSize, toAiJpegBase64 } from '@/lib/image';
import { SCENE_LABEL } from '@/lib/scenes';
import { SENSITIVITY_THRESHOLD, useSession, useSettings } from '@/lib/store';
import { colors, scoreColor, space, type } from '@/lib/theme';
import { createVoiceCoach } from '@/lib/voice';

const TIMERS = [0, 3, 5, 10] as const;
const fileUri = (path: string) => (path.startsWith('file://') ? path : `file://${path}`);

/**
 * The app opens straight into the camera. A tray at the bottom suggests poses
 * for the scene; picking one draws its outline over the live view, and
 * hand-written notes on the limbs show what to adjust.
 */
export default function CameraHome() {
  useKeepAwake();
  const insets = useSafeAreaInsets();
  const permission = useCameraPermission();
  const settings = useSettings();
  const session = useSession();
  const pose = session.poseId ? getPose(session.poseId) : undefined;

  const [position, setPosition] = useState<'back' | 'front'>(settings.defaultCamera);
  const [timer, setTimer] = useState<(typeof TIMERS)[number]>(settings.timerSeconds);
  const [voiceOn, setVoiceOn] = useState(settings.voice);
  const [trayOpen, setTrayOpen] = useState(true);
  const [tab, setTab] = useState<TrayTab>('foryou');
  const [page, setPage] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [crowd, setCrowd] = useState<1 | 2>(1);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [evaluation, setEvaluation] = useState<ShotEvaluation | null>(null);
  const [mirrored, setMirrored] = useState(false);
  const [capture, setCapture] = useState<CaptureState>({ phase: 'searching' });
  const [now, setNow] = useState(0);
  const [flash] = useState(() => new Animated.Value(0));

  const device = useCameraDevice(position);
  const photoOutput = usePhotoOutput({
    targetResolution: CommonResolutions.UHD_16_9,
    containerFormat: 'jpeg',
    quality: 0.92,
    qualityPrioritization: 'balanced',
  });

  const config: CaptureConfig = useMemo(
    () => ({ ...DEFAULT_CAPTURE, threshold: SENSITIVITY_THRESHOLD[settings.sensitivity], countdownMs: timer * 1000 }),
    [settings.sensitivity, timer],
  );

  const figures = useMemo(
    () => (pose && size ? pose.figures.map((f) => buildFigure(f, size.width / size.height)) : []),
    [pose, size],
  );
  const shownFigures = useMemo(() => (mirrored ? figures.map(mirrorFigure) : figures), [figures, mirrored]);

  const voice = useMemo(() => createVoiceCoach(), []);
  useEffect(() => () => voice.stop(), [voice]);

  const stateRef = useRef({
    people: [] as Person[],
    capture: { phase: 'searching' } as CaptureState,
    lastDetection: null as Detection | null,
    busy: false,
    crowdSince: 0,
    crowdCandidate: 1 as 1 | 2,
  });

  /* ---------------------------- Pose picks ---------------------------- */

  const aiPicks = useMemo(() => {
    const a = session.analysis;
    if (!a || session.people !== crowd) return null;
    return a.recommendations.map((r) => getPose(r.poseId)).filter((p): p is PoseDefinition => p != null);
  }, [session.analysis, session.people, crowd]);

  const trayPoses = useMemo(() => {
    if (tab === 'solo') return posesFor(1);
    if (tab === 'couple') return posesFor(2);
    return aiPicks && aiPicks.length ? aiPicks : defaultPicks(crowd, page);
  }, [tab, aiPicks, crowd, page]);

  const select = useCallback(
    (id: string | null) => {
      session.set({ poseId: id });
      setEvaluation(null);
      setMirrored(false);
      stateRef.current.capture = { phase: 'searching' };
      setCapture(stateRef.current.capture);
      const next = id ? getPose(id) : undefined;
      if (next && voiceOn) voice.say(cueSentence(next.cues, 2), { force: true });
    },
    [session, voice, voiceOn],
  );

  /* --------------------------- Scene reading -------------------------- */

  const scan = useCallback(
    async (people: 1 | 2) => {
      if (stateRef.current.busy) return;
      stateRef.current.busy = true;
      setScanning(true);
      try {
        const photo = await photoOutput.capturePhoto({ flashMode: 'off', enableShutterSound: false }, {});
        const uri = fileUri(await photo.saveToTemporaryFileAsync());
        const base64 = await toAiJpegBase64(uri);
        const result = await analyzeScene({ imageBase64: base64, people });
        session.set({
          analysis: result.data,
          analysisSource: result.source,
          notice: result.notice ?? null,
          people,
          ...(result.data ? { scene: result.data.scene.type } : {}),
        });
        const first = result.data?.recommendations[0]?.poseId;
        if (first && !useSession.getState().poseId) select(first);
      } catch (e) {
        console.warn('scene scan failed', e);
      } finally {
        stateRef.current.busy = false;
        setScanning(false);
      }
    },
    [photoOutput, select, session],
  );

  const refresh = () => {
    if (aiEnabled) scan(crowd);
    else setPage((p) => p + 1);
  };

  // Read the scene once, shortly after the camera starts.
  const scannedOnce = useRef(false);
  const onCameraStarted = useCallback(() => {
    if (scannedOnce.current || !aiEnabled) return;
    scannedOnce.current = true;
    setTimeout(() => scan(stateRef.current.crowdCandidate), 1200);
  }, [scan]);

  /* ------------------------------ Capture ----------------------------- */

  const takePhoto = useCallback(
    async (score: number) => {
      if (stateRef.current.busy) return;
      stateRef.current.busy = true;
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        Animated.sequence([
          Animated.timing(flash, { toValue: 1, duration: 60, useNativeDriver: true }),
          Animated.timing(flash, { toValue: 0, duration: 260, useNativeDriver: true }),
        ]).start();
        const photo = await photoOutput.capturePhoto({ flashMode: 'off', enableShutterSound: true }, {});
        const uri = fileUri(await photo.saveToTemporaryFileAsync());
        const dims = await imageSize(uri);
        const detection = stateRef.current.lastDetection;
        // Best effort: map the last detection into photo space for smart cropping.
        let photoPeople: Person[] = [];
        if (detection) {
          photoPeople = peopleInFrame(detection.output, { ...detection.geometry, mirrored: false });
          if (photo.isMirrored) photoPeople = photoPeople.map((p) => ({ ...p, keypoints: p.keypoints.map((k) => ({ ...k, x: 1 - k.x })) }));
        }
        session.addCapture({ uri, width: dims.width, height: dims.height, score, people: photoPeople });
        if (voiceOn) voice.say('Got it!', { force: true });
      } catch (e) {
        console.warn('capture failed', e);
      } finally {
        stateRef.current.busy = false;
        const next = captureReducer(stateRef.current.capture, { type: 'captured', now: Date.now() }, config);
        stateRef.current.capture = next;
        setCapture(next);
      }
    },
    [config, flash, photoOutput, session, voice, voiceOn],
  );

  /* ----------------------------- Detection ---------------------------- */

  const onDetection = useCallback(
    (d: Detection) => {
      if (!size) return;
      stateRef.current.lastDetection = d;
      const detected = peopleInView(d.output, d.geometry, size);
      const smoothed = smoothPeople(stateRef.current.people, detected);
      stateRef.current.people = smoothed;

      // Switch "For you" between solo and couple picks once a group size is stable.
      const count: 1 | 2 = smoothed.length >= 2 ? 2 : 1;
      const ref = stateRef.current;
      if (count !== ref.crowdCandidate) {
        ref.crowdCandidate = count;
        ref.crowdSince = d.timestamp;
      } else if (d.timestamp - ref.crowdSince > 1500) {
        setCrowd((c) => (c === count ? c : count));
      }

      if (!pose || figures.length === 0) return;
      const result = evaluateShot(figures, smoothed, {
        aspect: size.width / size.height,
        camera: position,
        framing: pose.framing,
        threshold: config.threshold,
      });
      setEvaluation(result);
      setMirrored((m) => (m === result.mirrored ? m : result.mirrored));
      setNow(d.timestamp);

      if (voiceOn) {
        const say = result.status === 'ready' ? result.hints[0] : result.framingHints[0] ?? result.hints[0];
        if (say) voice.say(say, { force: result.status === 'ready' && ref.capture.phase === 'searching' });
      }

      if (!settings.autoCapture) return;
      const prev = ref.capture;
      const next = captureReducer(prev, { type: 'tick', now: d.timestamp, score: result.score, ready: result.status === 'ready' }, config);
      if (next !== prev) {
        ref.capture = next;
        setCapture(next);
        if (next.phase === 'countdown' && voiceOn) voice.say(`Hold it… ${timer}`, { force: true });
        if (next.phase === 'capturing') takePhoto(result.score);
      }
    },
    [config, figures, pose, position, settings.autoCapture, size, takePhoto, timer, voice, voiceOn],
  );

  const detector = usePoseDetector(onDetection);
  const outputs = useMemo(() => [detector.frameOutput, photoOutput], [detector.frameOutput, photoOutput]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (!size || size.width !== width || size.height !== height) setSize({ width, height });
  };

  /* ------------------------------ Render ------------------------------ */

  if (!permission.hasPermission) {
    return (
      <Screen style={{ padding: space.xl, justifyContent: 'center' }}>
        <Text style={[type.title, { textAlign: 'center' }]}>Camera access needed</Text>
        <Text style={[type.body, { color: colors.muted, textAlign: 'center', marginVertical: space.md }]}>
          The pose coach works through your camera.
        </Text>
        <Button
          title="Allow camera"
          onPress={async () => {
            const ok = await permission.requestPermission();
            if (!ok && !permission.canRequestPermission) Linking.openSettings();
          }}
        />
      </Screen>
    );
  }

  const ready = evaluation?.status === 'ready';
  const score = evaluation?.score ?? 0;
  const notes = evaluation && size ? annotationsFor(evaluation, size.width / size.height) : [];
  const instruction = scanning
    ? 'Reading the scene…'
    : !pose
      ? 'Pick a pose below — or just shoot'
      : ready
        ? 'Perfect — hold still!'
        : evaluation?.framingHints[0] ?? cueSentence(pose.cues);
  const countdown = countdownSeconds(capture, now);
  const progress = holdProgress(capture, now, config);
  const lastCapture = session.captures[session.captures.length - 1];
  const ring = 2 * Math.PI * 38;
  const ringValue = !pose ? 0 : capture.phase === 'holding' || capture.phase === 'countdown' ? progress : score / 100;
  const sceneCaption =
    tab === 'foryou' && aiPicks && session.analysis
      ? `${SCENE_LABEL[session.analysis.scene.type].emoji}  ${session.analysis.scene.summary}`
      : tab === 'foryou' && !aiEnabled
        ? 'Popular poses that work almost anywhere'
        : null;

  return (
    <View style={styles.root}>
      <View style={styles.viewfinder} onLayout={onLayout}>
        {device ? (
          <Camera
            style={StyleSheet.absoluteFill}
            device={device}
            isActive
            outputs={outputs}
            resizeMode="cover"
            enableNativeTapToFocusGesture
            enableNativeZoomGesture
            onStarted={onCameraStarted}
          />
        ) : null}

        {size && pose ? (
          <>
            <PoseOutline
              figures={shownFigures}
              width={size.width}
              height={size.height}
              color={ready ? colors.success : '#FFFFFF'}
              hideLegs={pose.framing === 'half'}
            />
            <LimbNotes notes={notes} width={size.width} height={size.height} />
          </>
        ) : null}

        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'white', opacity: flash }]} />

        {/* Top bar */}
        <View style={[styles.top, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
          <View style={styles.topRow}>
            <IconButton label="⚙︎" a11y="Settings" onPress={() => router.push('/settings')} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <IconButton label={voiceOn ? '🔊' : '🔇'} a11y="Voice coaching" onPress={() => setVoiceOn(!voiceOn)} />
              <IconButton label={timer ? `${timer}s` : '⏱'} a11y="Self timer" onPress={() => setTimer(TIMERS[(TIMERS.indexOf(timer) + 1) % TIMERS.length])} />
            </View>
          </View>
          <Pressable
            disabled={!pose}
            onPress={() => pose && router.push({ pathname: '/pose/[id]', params: { id: pose.id } })}
            style={styles.instructionRow}
          >
            <Text style={[styles.instruction, ready && { color: colors.success }]} numberOfLines={2}>
              {instruction}
            </Text>
            {pose ? <Text style={styles.info}>ⓘ</Text> : null}
          </Pressable>
          {!detector.ready && pose ? (
            <Text style={styles.subtle} numberOfLines={3}>
              {detector.error ? `Pose tracking unavailable on this phone\n${detector.error.message}` : 'Starting pose tracking…'}
            </Text>
          ) : null}
        </View>

        {countdown != null ? (
          <View style={styles.center} pointerEvents="none">
            <Text style={styles.countdown}>{countdown}</Text>
          </View>
        ) : null}

        {/* Shutter row, over the bottom of the preview */}
        <View style={styles.controls} pointerEvents="box-none">
          <Pressable
            accessibilityLabel="Your photos"
            onPress={() => (session.captures.length ? router.push('/review') : router.push('/history'))}
            style={styles.gallery}
          >
            {lastCapture ? <Image source={{ uri: lastCapture.uri }} style={styles.galleryImg} contentFit="cover" /> : null}
          </Pressable>

          <Pressable accessibilityLabel="Take photo" onPress={() => takePhoto(score)} style={styles.shutterWrap}>
            <Svg width={88} height={88} style={StyleSheet.absoluteFill}>
              <Circle cx={44} cy={44} r={38} stroke="rgba(255,255,255,0.85)" strokeWidth={4} fill="none" />
              {pose ? (
                <Circle
                  cx={44}
                  cy={44}
                  r={38}
                  stroke={scoreColor(score)}
                  strokeWidth={5}
                  fill="none"
                  strokeDasharray={`${ring} ${ring}`}
                  strokeDashoffset={ring * (1 - ringValue)}
                  strokeLinecap="round"
                  rotation={-90}
                  origin="44, 44"
                />
              ) : null}
            </Svg>
            <View style={styles.shutter} />
          </Pressable>

          {trayOpen ? (
            <IconButton label="⟲" a11y="Switch camera" onPress={() => setPosition(position === 'back' ? 'front' : 'back')} />
          ) : (
            <Pressable accessibilityLabel="Show poses" onPress={() => setTrayOpen(true)} style={styles.posesPill}>
              <Text style={styles.posesPillText}>✨ Poses</Text>
            </Pressable>
          )}
        </View>
      </View>

      {trayOpen ? (
        <View style={{ paddingBottom: insets.bottom }}>
          <PoseTray
            tab={tab}
            onTab={setTab}
            poses={trayPoses}
            selectedId={session.poseId}
            onSelect={select}
            onRefresh={refresh}
            onClose={() => setTrayOpen(false)}
            loading={scanning && tab === 'foryou'}
            caption={sceneCaption}
          />
        </View>
      ) : (
        <View style={{ height: insets.bottom, backgroundColor: 'black' }} />
      )}
    </View>
  );
}

function IconButton({ label, a11y, onPress }: { label: string; a11y: string; onPress: () => void }) {
  return (
    <Pressable accessibilityLabel={a11y} onPress={onPress} hitSlop={8} style={styles.icon}>
      <Text style={styles.iconText}>{label}</Text>
    </Pressable>
  );
}

const shadow = { textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } };

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'black' },
  viewfinder: { flex: 1, overflow: 'hidden' },
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: space.lg },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  iconText: { color: colors.text, fontSize: 17, fontWeight: '700' },
  instructionRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: space.md, gap: 8 },
  instruction: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '700', lineHeight: 22, ...shadow },
  info: { color: colors.text, fontSize: 18, ...shadow },
  subtle: { color: colors.text, opacity: 0.75, fontSize: 12, marginTop: 4, ...shadow },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  countdown: { fontSize: 120, fontWeight: '900', color: colors.text, ...shadow },
  controls: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.xl,
  },
  gallery: { width: 46, height: 46, borderRadius: 23, borderWidth: 2, borderColor: colors.text, overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.35)' },
  galleryImg: { width: '100%', height: '100%' },
  shutterWrap: { width: 88, height: 88, alignItems: 'center', justifyContent: 'center' },
  shutter: { width: 66, height: 66, borderRadius: 33, backgroundColor: 'rgba(255,255,255,0.95)' },
  posesPill: { paddingHorizontal: 12, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center' },
  posesPillText: { color: colors.text, fontWeight: '700' },
});
