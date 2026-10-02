import {
  isVisible,
  KP,
  midpoint,
  type Keypoint,
  type Person,
} from './keypoints';
import { mirrorFigure, type Figure } from './poseDsl';

/**
 * Pose matching works on bone directions, not raw positions, so it does not
 * care about body proportions or exact framing. People are compared by
 * screen side ("the arm on the left of the picture"), which makes matching
 * independent of camera mirroring and of which way the person faces.
 */

export type ScreenSide = 'L' | 'R';
export type SegmentId =
  | 'torso'
  | 'upperArmL'
  | 'forearmL'
  | 'upperArmR'
  | 'forearmR'
  | 'thighL'
  | 'shinL'
  | 'thighR'
  | 'shinR';

interface Chain {
  shoulder: Keypoint;
  elbow: Keypoint;
  wrist: Keypoint;
  hip: Keypoint;
  knee: Keypoint;
  ankle: Keypoint;
}

interface Canonical {
  L: Chain;
  R: Chain;
}

const SEGMENTS: readonly {
  id: SegmentId;
  side?: ScreenSide;
  leg: boolean;
  weight: number;
  from: (c: Canonical) => Keypoint;
  to: (c: Canonical) => Keypoint;
}[] = [
  { id: 'torso', leg: false, weight: 1.5, from: (c) => midpoint(c.L.hip, c.R.hip), to: (c) => midpoint(c.L.shoulder, c.R.shoulder) },
  { id: 'upperArmL', side: 'L', leg: false, weight: 1, from: (c) => c.L.shoulder, to: (c) => c.L.elbow },
  { id: 'forearmL', side: 'L', leg: false, weight: 1, from: (c) => c.L.elbow, to: (c) => c.L.wrist },
  { id: 'upperArmR', side: 'R', leg: false, weight: 1, from: (c) => c.R.shoulder, to: (c) => c.R.elbow },
  { id: 'forearmR', side: 'R', leg: false, weight: 1, from: (c) => c.R.elbow, to: (c) => c.R.wrist },
  { id: 'thighL', side: 'L', leg: true, weight: 1, from: (c) => c.L.hip, to: (c) => c.L.knee },
  { id: 'shinL', side: 'L', leg: true, weight: 0.8, from: (c) => c.L.knee, to: (c) => c.L.ankle },
  { id: 'thighR', side: 'R', leg: true, weight: 1, from: (c) => c.R.hip, to: (c) => c.R.knee },
  { id: 'shinR', side: 'R', leg: true, weight: 0.8, from: (c) => c.R.knee, to: (c) => c.R.ankle },
];

/** Angle differences at or below this count as perfect. */
const PERFECT_DEG = 12;
/** Angle differences at or above this score zero. */
const ZERO_DEG = 65;

function chain(k: Keypoint[], left: boolean): Chain {
  return left
    ? { shoulder: k[KP.leftShoulder], elbow: k[KP.leftElbow], wrist: k[KP.leftWrist], hip: k[KP.leftHip], knee: k[KP.leftKnee], ankle: k[KP.leftAnkle] }
    : { shoulder: k[KP.rightShoulder], elbow: k[KP.rightElbow], wrist: k[KP.rightWrist], hip: k[KP.rightHip], knee: k[KP.rightKnee], ankle: k[KP.rightAnkle] };
}

/** Re-label a person's limbs by which side of the screen they are on. */
export function canonicalize(person: Person): Canonical {
  const k = person.keypoints;
  const shoulderDx = k[KP.leftShoulder].x - k[KP.rightShoulder].x;
  const hipDx = k[KP.leftHip].x - k[KP.rightHip].x;
  let anatomicalLeftOnScreenRight: boolean;
  if (Math.abs(shoulderDx) > 0.01 && isVisible(k[KP.leftShoulder]) && isVisible(k[KP.rightShoulder])) {
    anatomicalLeftOnScreenRight = shoulderDx > 0;
  } else if (Math.abs(hipDx) > 0.01 && isVisible(k[KP.leftHip]) && isVisible(k[KP.rightHip])) {
    anatomicalLeftOnScreenRight = hipDx > 0;
  } else {
    // Side-on: assume facing the camera unless the face is hidden.
    anatomicalLeftOnScreenRight = isVisible(k[KP.nose]);
  }
  const left = chain(k, true);
  const right = chain(k, false);
  return anatomicalLeftOnScreenRight ? { L: right, R: left } : { L: left, R: right };
}

/** Screen-space bone angle using the module-wide convention (0 = down, 90 = right). */
export function boneAngle(from: Keypoint, to: Keypoint, aspect: number): number {
  return (Math.atan2((to.x - from.x) * aspect, to.y - from.y) * 180) / Math.PI;
}

export function angleDiff(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360) + 360) % 360;
  return d > 180 ? 360 - d : d;
}

export function similarity(diffDeg: number): number {
  if (diffDeg <= PERFECT_DEG) return 1;
  if (diffDeg >= ZERO_DEG) return 0;
  return 1 - (diffDeg - PERFECT_DEG) / (ZERO_DEG - PERFECT_DEG);
}

export interface SegmentResult {
  id: SegmentId;
  side?: ScreenSide;
  weight: number;
  target: number;
  /** null when the body part is not visible to the camera. */
  actual: number | null;
  similarity: number;
}

export interface PoseScore {
  /** 0–100 */
  score: number;
  segments: SegmentResult[];
  /** True when the legs were required but could not be seen. */
  legsHidden: boolean;
}

export function scorePose(
  target: Figure,
  detected: Person,
  opts: { aspect: number; includeLegs: boolean },
): PoseScore {
  const t = canonicalize(target);
  const d = canonicalize(detected);
  const segments: SegmentResult[] = [];
  let total = 0;
  let weights = 0;
  let legsHidden = false;
  for (const seg of SEGMENTS) {
    if (seg.leg && !opts.includeLegs) continue;
    const targetAngle = boneAngle(seg.from(t), seg.to(t), opts.aspect);
    const a = seg.from(d);
    const b = seg.to(d);
    let actual: number | null = null;
    let sim = 0;
    if (isVisible(a) && isVisible(b)) {
      actual = boneAngle(a, b, opts.aspect);
      sim = similarity(angleDiff(targetAngle, actual));
    } else if (seg.leg) {
      legsHidden = true;
    }
    segments.push({ id: seg.id, side: seg.side, weight: seg.weight, target: targetAngle, actual, similarity: sim });
    total += sim * seg.weight;
    weights += seg.weight;
  }
  return { score: weights > 0 ? (total / weights) * 100 : 0, segments, legsHidden };
}

/* ------------------------------------------------------------------------ */
/* Coaching hints                                                            */
/* ------------------------------------------------------------------------ */

export type CameraFacing = 'front' | 'back';

/**
 * Convert a screen side into the person's own left/right. The front camera
 * preview is mirrored, so screen-left is the user's left; with the back
 * camera the subject faces the lens, so screen-left is their right.
 */
export function personSide(side: ScreenSide, camera: CameraFacing): 'left' | 'right' {
  if (camera === 'front') return side === 'L' ? 'left' : 'right';
  return side === 'L' ? 'right' : 'left';
}

const PART: Record<Exclude<SegmentId, 'torso'>, string> = {
  upperArmL: 'arm',
  upperArmR: 'arm',
  forearmL: 'hand',
  forearmR: 'hand',
  thighL: 'knee',
  thighR: 'knee',
  shinL: 'foot',
  shinR: 'foot',
};

/** How much a bone points up (1) vs down (-1). */
const upness = (deg: number) => -Math.cos((deg * Math.PI) / 180);
/** How much a bone points away from the body's midline on its side. */
const outness = (deg: number, side: ScreenSide) => Math.sin((deg * Math.PI) / 180) * (side === 'L' ? -1 : 1);

export function segmentHint(seg: SegmentResult, camera: CameraFacing): string | null {
  if (seg.actual == null) return null;
  if (seg.id === 'torso') {
    const delta = seg.target - seg.actual;
    const lean = ((delta + 540) % 360) - 180;
    if (Math.abs(lean) < 8) return null;
    // Positive delta rotates the torso top toward screen-left.
    const towardScreen: ScreenSide = lean > 0 ? 'L' : 'R';
    const target = upness(seg.target);
    if (target > 0.97) return 'Stand up straight';
    return `Lean a little to your ${personSide(towardScreen, camera)}`;
  }
  const side = seg.side as ScreenSide;
  const who = personSide(side, camera);
  const part = PART[seg.id];
  const dUp = upness(seg.target) - upness(seg.actual);
  const dOut = outness(seg.target, side) - outness(seg.actual, side);
  if (Math.abs(dUp) >= Math.abs(dOut) * 0.8 && Math.abs(dUp) > 0.15) {
    return `${dUp > 0 ? 'Raise' : 'Lower'} your ${who} ${part}`;
  }
  if (Math.abs(dOut) > 0.15) {
    if (part === 'foot' || part === 'knee') {
      return dOut > 0 ? `Move your ${who} ${part} out` : `Bring your ${who} ${part} in`;
    }
    return dOut > 0 ? `Move your ${who} ${part} out to the side` : `Bring your ${who} ${part} closer to your body`;
  }
  return null;
}

/** The most useful pose corrections, worst first. */
export function poseHints(result: PoseScore, camera: CameraFacing, max = 2): string[] {
  const hints: string[] = [];
  const ranked = [...result.segments]
    .filter((s) => s.actual != null && s.similarity < 0.8)
    .sort((a, b) => (1 - b.similarity) * b.weight - (1 - a.similarity) * a.weight);
  for (const seg of ranked) {
    const hint = segmentHint(seg, camera);
    if (hint && !hints.includes(hint)) hints.push(hint);
    if (hints.length >= max) break;
  }
  return hints;
}

/* ------------------------------------------------------------------------ */
/* Framing                                                                   */
/* ------------------------------------------------------------------------ */

function torsoOf(p: Person): { center: Keypoint; length: number } | null {
  const k = p.keypoints;
  const hipsOk = isVisible(k[KP.leftHip]) && isVisible(k[KP.rightHip]);
  const shouldersOk = isVisible(k[KP.leftShoulder]) && isVisible(k[KP.rightShoulder]);
  if (!shouldersOk) return null;
  const shoulders = midpoint(k[KP.leftShoulder], k[KP.rightShoulder]);
  if (!hipsOk) return { center: shoulders, length: 0 };
  const hips = midpoint(k[KP.leftHip], k[KP.rightHip]);
  return { center: hips, length: Math.hypot(shoulders.x - hips.x, shoulders.y - hips.y) };
}

export interface FramingResult {
  ok: boolean;
  hints: string[];
}

export function framingHints(
  target: Figure,
  detected: Person,
  camera: CameraFacing,
  opts: { positionTolerance?: number } = {},
): FramingResult {
  const hints: string[] = [];
  const t = torsoOf(target);
  const d = torsoOf(detected);
  if (!t || !d) return { ok: false, hints: ['Face the camera so I can see your shoulders'] };
  if (d.length > 0 && t.length > 0) {
    const ratio = d.length / t.length;
    if (ratio < 0.78) hints.push(camera === 'front' ? 'Move the phone closer' : 'Come a little closer');
    else if (ratio > 1.28) hints.push(camera === 'front' ? 'Move the phone further away' : 'Take a step back');
  }
  const tolerance = opts.positionTolerance ?? 0.1;
  const dx = t.center.x - d.center.x;
  if (Math.abs(dx) > tolerance) {
    const towardScreen: ScreenSide = dx > 0 ? 'R' : 'L';
    hints.push(`Move a little to your ${personSide(towardScreen, camera)}`);
  }
  return { ok: hints.length === 0, hints };
}

/* ------------------------------------------------------------------------ */
/* Whole-shot evaluation (solo or couple)                                    */
/* ------------------------------------------------------------------------ */

export type ShotStatus = 'no-person' | 'missing-person' | 'adjusting' | 'ready';

export interface ShotEvaluation {
  status: ShotStatus;
  /** 0–100, combining pose similarity with framing. */
  score: number;
  /** Ordered, most important first. */
  hints: string[];
  /** Which variant of the sketch the people are closest to. */
  mirrored: boolean;
  /** Framing problems only (distance, position, spacing), most important first. */
  framingHints: string[];
  /** Per-target results, aligned with `targets`. */
  people: ({ pose: PoseScore; framingOk: boolean } | null)[];
  /** The sketch variant people were compared against (mirrored or not), sorted left to right. */
  targets: Figure[];
}

export interface EvaluateOptions {
  aspect: number;
  camera: CameraFacing;
  framing: 'full' | 'half';
  /** Score needed to count as "ready". */
  threshold?: number;
}

const centerX = (p: Person): number => {
  const t = torsoOf(p);
  if (t) return t.center.x;
  const xs = p.keypoints.filter((k) => isVisible(k)).map((k) => k.x);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0.5;
};

function evaluateVariant(targets: Figure[], people: Person[], opts: EvaluateOptions) {
  const sortedTargets = [...targets].sort((a, b) => centerX(a) - centerX(b));
  const sortedPeople = [...people].sort((a, b) => centerX(a) - centerX(b));
  const includeLegs = opts.framing === 'full';
  const results = sortedTargets.map((target, i) => {
    const person = sortedPeople[i];
    const pose = scorePose(target, person, { aspect: opts.aspect, includeLegs });
    const framing = framingHints(target, person, opts.camera, {
      positionTolerance: targets.length > 1 ? 0.12 : 0.1,
    });
    return { target, person, pose, framing };
  });
  const poseScore = results.reduce((s, r) => s + r.pose.score, 0) / results.length;
  return { results, poseScore, sortedTargets };
}

export function evaluateShot(targets: Figure[], detected: Person[], opts: EvaluateOptions): ShotEvaluation {
  const threshold = opts.threshold ?? 80;
  const needed = targets.length;
  if (detected.length === 0) {
    return {
      status: 'no-person',
      score: 0,
      hints: [needed > 1 ? 'Both of you step into the frame' : 'Step into the frame'],
      framingHints: [needed > 1 ? 'Both of you step into the frame' : 'Step into the frame'],
      mirrored: false,
      people: targets.map(() => null),
      targets,
    };
  }
  if (detected.length < needed) {
    return {
      status: 'missing-person',
      score: 0,
      hints: ['I can only see one of you — both step into the frame'],
      framingHints: ['I can only see one of you — both step into the frame'],
      mirrored: false,
      people: targets.map(() => null),
      targets,
    };
  }

  const people = [...detected].sort((a, b) => b.score - a.score).slice(0, needed);
  const normal = evaluateVariant(targets, people, opts);
  const mirrored = evaluateVariant(targets.map(mirrorFigure), people, opts);
  const best = mirrored.poseScore > normal.poseScore + 2 ? mirrored : normal;
  const isMirrored = best === mirrored;

  const hints: string[] = [];
  const multi = needed > 1;
  const label = (i: number) => (multi ? (i === 0 ? 'Left person: ' : 'Right person: ') : '');
  // Framing first: there is no point fine-tuning an arm while half out of shot.
  best.results.forEach((r, i) => r.framing.hints.forEach((h) => hints.push(label(i) + h)));
  if (multi && best.results.length === 2) {
    const spacing = coupleSpacingHint(best.results[0], best.results[1]);
    if (spacing) hints.push(spacing);
  }
  if (opts.framing === 'full' && best.results.some((r) => r.pose.legsHidden)) {
    hints.push(opts.camera === 'front' ? 'Move the phone back so your feet are in the shot' : 'Step back so your feet are in the shot');
  }
  const framingHints = [...hints];
  best.results.forEach((r, i) => poseHints(r.pose, opts.camera, multi ? 1 : 2).forEach((h) => hints.push(label(i) + h)));

  const framingOk = best.results.every((r) => r.framing.ok);
  const score = Math.round(best.poseScore * (framingOk ? 1 : 0.85));
  const ready = score >= threshold && framingOk && best.results.every((r) => r.pose.score >= threshold - 12);
  if (ready) hints.unshift('Perfect — hold still!');

  return {
    status: ready ? 'ready' : 'adjusting',
    score,
    hints: ready ? hints.slice(0, 1) : hints,
    framingHints,
    mirrored: isMirrored,
    people: best.results.map((r) => ({ pose: r.pose, framingOk: r.framing.ok })),
    targets: best.sortedTargets,
  };
}

function coupleSpacingHint(
  a: { target: Figure; person: Person },
  b: { target: Figure; person: Person },
): string | null {
  const ta = torsoOf(a.target);
  const tb = torsoOf(b.target);
  const da = torsoOf(a.person);
  const db = torsoOf(b.person);
  if (!ta || !tb || !da || !db) return null;
  const targetScale = (ta.length + tb.length) / 2 || 1;
  const detectedScale = (da.length + db.length) / 2 || 1;
  const targetGap = Math.abs(tb.center.x - ta.center.x) / targetScale;
  const detectedGap = Math.abs(db.center.x - da.center.x) / detectedScale;
  const ratio = detectedGap / targetGap;
  if (ratio > 1.4) return 'Move closer together';
  if (ratio < 0.65) return 'Give each other a little more space';
  return null;
}
