import { KEYPOINT_COUNT, KP, type Keypoint, type Person } from './keypoints';

/**
 * Poses are authored as joint angles instead of raw coordinates, then turned
 * into keypoints with simple forward kinematics. That keeps the library easy
 * to extend and guarantees anatomically plausible sketches.
 *
 * Angle convention (degrees, screen space): 0 = pointing straight down,
 * 90 = pointing to screen-right, -90 = screen-left, 180 = straight up.
 * Limb angles are absolute, not relative to the parent bone.
 *
 * "L"/"R" in a spec always mean screen-left/screen-right as the sketch is
 * drawn, never the person's anatomical side. Matching is mirror-tolerant, so
 * a user can copy a pose either way round.
 */
export interface LimbSpec {
  /** Angle of the upper bone (upper arm / thigh). */
  upper: number;
  /** Angle of the lower bone (forearm / shin). */
  lower: number;
  /** Length multiplier for foreshortening, e.g. thighs pointing at the camera when seated. */
  upperLen?: number;
  lowerLen?: number;
}

export interface FigureSpec {
  /** Hip midpoint in normalized view coordinates. */
  at: { x: number; y: number };
  /** Full standing height as a fraction of view height. */
  height: number;
  /** Direction from hips to shoulders. Default 180 (upright). */
  torso?: number;
  torsoLen?: number;
  /** Head tilt relative to the torso, degrees; positive tilts toward screen-right. */
  head?: number;
  /** Body rotation toward profile in [-1, 1]; negative turns toward screen-left. */
  turn?: number;
  facing?: 'camera' | 'away';
  armL: LimbSpec;
  armR: LimbSpec;
  legL: LimbSpec;
  legR: LimbSpec;
}

export interface Figure extends Person {
  /** Head circle for drawing, in normalized coordinates; radius is a fraction of view height. */
  head: { x: number; y: number; r: number };
}

// Body proportions as fractions of total standing height.
export const BODY = {
  torso: 0.3,
  shoulderHalf: 0.105,
  hipHalf: 0.065,
  upperArm: 0.165,
  forearm: 0.15,
  thigh: 0.245,
  shin: 0.245,
  neckToNose: 0.095,
  headRadius: 0.055,
} as const;

const RAD = Math.PI / 180;

/** Unit vector for a screen-space angle, in "height units" (y down). */
export function dir(angleDeg: number): { x: number; y: number } {
  return { x: Math.sin(angleDeg * RAD), y: Math.cos(angleDeg * RAD) };
}

/**
 * Build a figure's keypoints.
 * @param aspect view width / view height, so angles look right on screen.
 */
export function buildFigure(spec: FigureSpec, aspect: number): Figure {
  const h = spec.height;
  // Convert a displacement in height units into normalized view units.
  const toView = (v: { x: number; y: number }, len: number) => ({
    x: (v.x * len * h) / aspect,
    y: v.y * len * h,
  });
  const add = (p: { x: number; y: number }, d: { x: number; y: number }) => ({
    x: p.x + d.x,
    y: p.y + d.y,
  });

  const torsoAngle = spec.torso ?? 180;
  const torsoDir = dir(torsoAngle);
  // Perpendicular pointing to screen-right for an upright torso.
  const perp = { x: -torsoDir.y, y: torsoDir.x };
  const turn = Math.max(-1, Math.min(1, spec.turn ?? 0));
  const width = 1 - 0.75 * Math.abs(turn);

  const hipMid = spec.at;
  const shoulderMid = add(hipMid, toView(torsoDir, BODY.torso * (spec.torsoLen ?? 1)));

  const shoulderL = add(shoulderMid, toView(perp, -BODY.shoulderHalf * width));
  const shoulderR = add(shoulderMid, toView(perp, BODY.shoulderHalf * width));
  const hipL = add(hipMid, toView(perp, -BODY.hipHalf * width));
  const hipR = add(hipMid, toView(perp, BODY.hipHalf * width));

  const limb = (root: { x: number; y: number }, l: LimbSpec, upperLen: number, lowerLen: number) => {
    const mid = add(root, toView(dir(l.upper), upperLen * (l.upperLen ?? 1)));
    const end = add(mid, toView(dir(l.lower), lowerLen * (l.lowerLen ?? 1)));
    return [mid, end] as const;
  };
  const [elbowL, wristL] = limb(shoulderL, spec.armL, BODY.upperArm, BODY.forearm);
  const [elbowR, wristR] = limb(shoulderR, spec.armR, BODY.upperArm, BODY.forearm);
  const [kneeL, ankleL] = limb(hipL, spec.legL, BODY.thigh, BODY.shin);
  const [kneeR, ankleR] = limb(hipR, spec.legR, BODY.thigh, BODY.shin);

  const headDir = dir(torsoAngle + (spec.head ?? 0));
  const headPerp = { x: -headDir.y, y: headDir.x };
  const nose = add(add(shoulderMid, toView(headDir, BODY.neckToNose)), toView(headPerp, 0.03 * turn));
  const headCenter = add(shoulderMid, toView(headDir, BODY.neckToNose + 0.01));
  const eyeL = add(add(nose, toView(headDir, 0.02)), toView(headPerp, -0.018 * width));
  const eyeR = add(add(nose, toView(headDir, 0.02)), toView(headPerp, 0.018 * width));
  const earL = add(add(nose, toView(headDir, 0.01)), toView(headPerp, -0.04 * (turn > 0 ? 1 : width)));
  const earR = add(add(nose, toView(headDir, 0.01)), toView(headPerp, 0.04 * (turn < 0 ? 1 : width)));

  const away = spec.facing === 'away';
  const keypoints: Keypoint[] = new Array(KEYPOINT_COUNT);
  const set = (i: number, p: { x: number; y: number }, score = 1) => {
    keypoints[i] = { x: p.x, y: p.y, score };
  };
  // Facing the camera, the person's anatomical left appears on screen-right.
  const anatomicalLeftIsScreenRight = !away;
  const pick = <T,>(screenL: T, screenR: T): [T, T] =>
    anatomicalLeftIsScreenRight ? [screenR, screenL] : [screenL, screenR];

  const faceScore = away ? 0 : 1;
  set(KP.nose, nose, faceScore);
  const [leftEye, rightEye] = pick(eyeL, eyeR);
  set(KP.leftEye, leftEye, faceScore);
  set(KP.rightEye, rightEye, faceScore);
  const [leftEar, rightEar] = pick(earL, earR);
  set(KP.leftEar, leftEar, away ? 1 : faceScore);
  set(KP.rightEar, rightEar, away ? 1 : faceScore);

  const pairs: [number, number, { x: number; y: number }, { x: number; y: number }][] = [
    [KP.leftShoulder, KP.rightShoulder, shoulderL, shoulderR],
    [KP.leftElbow, KP.rightElbow, elbowL, elbowR],
    [KP.leftWrist, KP.rightWrist, wristL, wristR],
    [KP.leftHip, KP.rightHip, hipL, hipR],
    [KP.leftKnee, KP.rightKnee, kneeL, kneeR],
    [KP.leftAnkle, KP.rightAnkle, ankleL, ankleR],
  ];
  for (const [li, ri, screenL, screenR] of pairs) {
    const [left, right] = pick(screenL, screenR);
    set(li, left);
    set(ri, right);
  }

  return {
    keypoints,
    score: 1,
    head: { x: headCenter.x, y: headCenter.y, r: BODY.headRadius * h },
  };
}

export function mirrorFigure(figure: Figure): Figure {
  return {
    score: figure.score,
    keypoints: figure.keypoints.map((k) => ({ ...k, x: 1 - k.x })),
    head: { ...figure.head, x: 1 - figure.head.x },
  };
}
