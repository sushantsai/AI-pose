import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { Camera, CommonResolutions, useCameraDevice, useCameraPermission, usePhotoOutput } from 'react-native-vision-camera';
import { DetectedSkeleton, PoseSketch } from '@/components/PoseSketch';
import { Button, Screen } from '@/components/ui';
import { captureReducer, countdownSeconds, DEFAULT_CAPTURE, holdProgress, type CaptureConfig, type CaptureState } from '@/core/capture';
import type { Person } from '@/core/keypoints';
import { evaluateShot, type SegmentId, type ShotEvaluation } from '@/core/matching';
import { peopleInFrame, peopleInView } from '@/core/movenet';
import { buildFigure } from '@/core/poseDsl';
import { getPose } from '@/core/poses';
import { smoothPeople } from '@/core/smoothing';
import { usePoseDetector, type Detection } from '@/features/coach/usePoseDetector';
import { imageSize } from '@/lib/image';
import { SENSITIVITY_THRESHOLD, useSession, useSettings } from '@/lib/store';
import { colors, radius, scoreColor, space, type } from '@/lib/theme';
import { createVoiceCoach } from '@/lib/voice';

const TIMERS = [0, 3, 5, 10] as const;
const fileUri = (path: string) => (path.startsWith('file://') ? path : `file://${path}`);

function segmentColors(evaluation: ShotEvaluation | null) {
  if (!evaluation) return undefined;
  return evaluation.people.map((p) => {
    if (!p) return null;
    const out: Partial<Record<SegmentId, string>> = {};
    for (const s of p.pose.segments) {
      if (s.actual == null) continue;
      out[s.id] = s.similarity >= 0.8 ? colors.success : s.similarity >= 0.5 ? colors.warning : colors.accent;
    }
    return out;
  });
}

export default function Coach() {
  useKeepAwake();
  const pose = getPose(useSession((s) => s.poseId) ?? '');
  const captures = useSession((s) => s.captures);
  const addCapture = useSession((s) => s.addCapture);
  const settings = useSettings();
  const permission = useCameraPermission();

  const [position, setPosition] = useState<'back' | 'front'>(settings.defaultCamera);
  const [timer, setTimer] = useState<(typeof TIMERS)[number]>(settings.timerSeconds);
  const [voiceOn, setVoiceOn] = useState(settings.voice);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [evaluation, setEvaluation] = useState<ShotEvaluation | null>(null);
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

  const voice = useMemo(() => createVoiceCoach(), []);
  useEffect(() => () => voice.stop(), [voice]);

  // Mutable mirrors of state for the detection callback, which runs often.
  const stateRef = useRef({ people: [] as Person[], capture: { phase: 'searching' } as CaptureState, lastDetection: null as Detection | null, busy: false });

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
        addCapture({ uri, width: dims.width, height: dims.height, score, people: photoPeople });
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
    [addCapture, config, flash, photoOutput, voice, voiceOn],
  );

  const onDetection = useCallback(
    (d: Detection) => {
      if (!size || figures.length === 0 || !pose) return;
      stateRef.current.lastDetection = d;
      const detected = peopleInView(d.output, d.geometry, size);
      const smoothed = smoothPeople(stateRef.current.people, detected);
      stateRef.current.people = smoothed;
      const result = evaluateShot(figures, smoothed, {
        aspect: size.width / size.height,
        camera: position,
        framing: pose.framing,
        threshold: config.threshold,
      });
      setPeople(smoothed);
      setEvaluation(result);
      setNow(d.timestamp);

      if (voiceOn && result.hints[0]) voice.say(result.hints[0], { force: result.status === 'ready' && stateRef.current.capture.phase === 'searching' });

      if (!settings.autoCapture) return;
      const prev = stateRef.current.capture;
      const next = captureReducer(prev, { type: 'tick', now: d.timestamp, score: result.score, ready: result.status === 'ready' }, config);
      if (next !== prev) {
        stateRef.current.capture = next;
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

  if (!pose) {
    return (
      <Screen style={{ padding: space.xl, justifyContent: 'center' }}>
        <Text style={type.title}>Pick a pose first</Text>
        <Button title="Browse poses" onPress={() => router.replace('/library')} style={{ marginTop: space.lg }} />
      </Screen>
    );
  }

  if (!permission.hasPermission) {
    return (
      <Screen style={{ padding: space.xl, justifyContent: 'center' }}>
        <Text style={[type.title, { textAlign: 'center' }]}>Camera access needed</Text>
        <Button title="Allow camera" onPress={() => permission.requestPermission()} style={{ marginTop: space.lg }} />
      </Screen>
    );
  }

  const score = evaluation?.score ?? 0;
  const hint = !detector.ready
    ? detector.error
      ? 'Pose tracking unavailable — you can still shoot manually'
      : 'Loading pose tracking…'
    : evaluation?.hints[0] ?? (pose.people === 2 ? 'Both of you step into the frame' : 'Step into the frame');
  const secondHint = detector.ready ? evaluation?.hints[1] : undefined;
  const countdown = countdownSeconds(capture, now);
  const progress = holdProgress(capture, now, config);
  const lastCapture = captures[captures.length - 1];
  const ring = 2 * Math.PI * 44;
  const ringValue = capture.phase === 'holding' || capture.phase === 'countdown' ? progress : score / 100;

  return (
    <View style={styles.fill} onLayout={onLayout}>
      {device ? (
        <Camera style={StyleSheet.absoluteFill} device={device} isActive outputs={outputs} resizeMode="cover" enableNativeTapToFocusGesture />
      ) : null}

      {size ? (
        <>
          <PoseSketch
            figures={evaluation?.targets ?? figures}
            width={size.width}
            height={size.height}
            segmentColors={segmentColors(evaluation)}
            hideLegs={pose.framing === 'half'}
            opacity={0.95}
          />
          {showSkeleton ? <DetectedSkeleton people={people} width={size.width} height={size.height} /> : null}
        </>
      ) : null}

      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'white', opacity: flash }]} />

      <SafeAreaView style={styles.overlay} edges={['top', 'bottom']} pointerEvents="box-none">
        <View style={styles.topBar}>
          <RoundButton label="✕" a11y="Close" onPress={() => router.back()} />
          <View style={styles.posePill}>
            <Text style={styles.posePillText} numberOfLines={1}>
              {pose.name}
            </Text>
          </View>
          <View style={styles.topRight}>
            <RoundButton label={voiceOn ? '🔊' : '🔇'} a11y="Toggle voice" onPress={() => setVoiceOn(!voiceOn)} />
            <RoundButton
              label={timer ? `${timer}s` : '⏱'}
              a11y="Self timer"
              onPress={() => setTimer(TIMERS[(TIMERS.indexOf(timer) + 1) % TIMERS.length])}
            />
            <RoundButton label="🔄" a11y="Switch camera" onPress={() => setPosition(position === 'back' ? 'front' : 'back')} />
          </View>
        </View>

        <View style={[styles.hint, evaluation?.status === 'ready' && { backgroundColor: 'rgba(61,220,151,0.85)' }]}>
          <Text style={styles.hintText}>{hint}</Text>
          {secondHint ? <Text style={styles.hintSub}>{secondHint}</Text> : null}
        </View>

        <View style={styles.center} pointerEvents="none">
          {countdown != null ? <Text style={styles.countdown}>{countdown}</Text> : null}
        </View>

        <View style={styles.bottomBar}>
          <Pressable
            accessibilityLabel="Review photos"
            onPress={() => captures.length && router.push('/review')}
            style={styles.thumbWrap}
          >
            {lastCapture ? <Image source={{ uri: lastCapture.uri }} style={styles.thumb} contentFit="cover" /> : <View style={styles.thumb} />}
            {captures.length > 0 ? <Text style={styles.count}>{captures.length}</Text> : null}
          </Pressable>

          <Pressable accessibilityLabel="Take photo" onPress={() => takePhoto(score)} style={styles.shutterWrap}>
            <Svg width={100} height={100} style={StyleSheet.absoluteFill}>
              <Circle cx={50} cy={50} r={44} stroke="rgba(255,255,255,0.25)" strokeWidth={6} fill="none" />
              <Circle
                cx={50}
                cy={50}
                r={44}
                stroke={scoreColor(score)}
                strokeWidth={6}
                fill="none"
                strokeDasharray={`${ring} ${ring}`}
                strokeDashoffset={ring * (1 - ringValue)}
                strokeLinecap="round"
                rotation={-90}
                origin="50, 50"
              />
            </Svg>
            <View style={styles.shutter}>
              <Text style={styles.score}>{detector.ready ? Math.round(score) : '…'}</Text>
            </View>
          </Pressable>

          {captures.length > 0 ? (
            <Pressable accessibilityLabel="Done" onPress={() => router.push('/review')} style={styles.done}>
              <Text style={styles.doneText}>Done</Text>
            </Pressable>
          ) : (
            <RoundButton label={showSkeleton ? '🙈' : '👁'} a11y="Show tracking" onPress={() => setShowSkeleton(!showSkeleton)} />
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

function RoundButton({ label, a11y, onPress }: { label: string; a11y: string; onPress: () => void }) {
  return (
    <Pressable accessibilityLabel={a11y} onPress={onPress} hitSlop={8} style={styles.round}>
      <Text style={styles.roundText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: 'black' },
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, justifyContent: 'space-between' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingTop: space.sm },
  topRight: { flexDirection: 'row', gap: space.sm },
  round: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  roundText: { color: colors.text, fontSize: 16, fontWeight: '700' },
  posePill: { flex: 1, marginHorizontal: space.sm, alignItems: 'center' },
  posePillText: { color: colors.text, fontWeight: '700', backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, overflow: 'hidden' },
  hint: {
    alignSelf: 'center',
    marginTop: space.md,
    marginHorizontal: space.xl,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    maxWidth: 420,
  },
  hintText: { color: colors.text, fontSize: 19, fontWeight: '800', textAlign: 'center' },
  hintSub: { color: colors.text, opacity: 0.8, fontSize: 14, fontWeight: '600', textAlign: 'center', marginTop: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  countdown: { fontSize: 120, fontWeight: '900', color: colors.text, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 12 },
  bottomBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.xl, paddingBottom: space.lg },
  thumbWrap: { width: 54, height: 54 },
  thumb: { width: 54, height: 54, borderRadius: 12, borderWidth: 2, borderColor: colors.text, backgroundColor: 'rgba(0,0,0,0.3)' },
  count: { position: 'absolute', top: -6, right: -6, backgroundColor: colors.accent, color: colors.text, fontSize: 12, fontWeight: '800', borderRadius: 10, paddingHorizontal: 6, overflow: 'hidden' },
  shutterWrap: { width: 100, height: 100, alignItems: 'center', justifyContent: 'center' },
  shutter: { width: 76, height: 76, borderRadius: 38, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' },
  score: { fontSize: 22, fontWeight: '900', color: colors.bg },
  done: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: 16, height: 42, justifyContent: 'center' },
  doneText: { color: colors.text, fontWeight: '800' },
});
