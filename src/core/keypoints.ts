/**
 * COCO-17 keypoint layout, as produced by MoveNet.
 * Indices are anatomical (the person's own left/right).
 */
export const KP = {
  nose: 0,
  leftEye: 1,
  rightEye: 2,
  leftEar: 3,
  rightEar: 4,
  leftShoulder: 5,
  rightShoulder: 6,
  leftElbow: 7,
  rightElbow: 8,
  leftWrist: 9,
  rightWrist: 10,
  leftHip: 11,
  rightHip: 12,
  leftKnee: 13,
  rightKnee: 14,
  leftAnkle: 15,
  rightAnkle: 16,
} as const;

export const KEYPOINT_COUNT = 17;

/** A point in normalized view space: x in [0,1] across, y in [0,1] down. */
export interface Keypoint {
  x: number;
  y: number;
  /** Confidence in [0,1]. Target (sketch) keypoints use 1, or 0 for "not drawn". */
  score: number;
}

export interface Person {
  keypoints: Keypoint[];
  /** Overall detection confidence. */
  score: number;
}

/** Bones drawn for the skeleton/sketch overlay. */
export const SKELETON: readonly (readonly [number, number])[] = [
  [KP.leftShoulder, KP.rightShoulder],
  [KP.leftShoulder, KP.leftElbow],
  [KP.leftElbow, KP.leftWrist],
  [KP.rightShoulder, KP.rightElbow],
  [KP.rightElbow, KP.rightWrist],
  [KP.leftShoulder, KP.leftHip],
  [KP.rightShoulder, KP.rightHip],
  [KP.leftHip, KP.rightHip],
  [KP.leftHip, KP.leftKnee],
  [KP.leftKnee, KP.leftAnkle],
  [KP.rightHip, KP.rightKnee],
  [KP.rightKnee, KP.rightAnkle],
];

export const MIN_KEYPOINT_SCORE = 0.25;

export function isVisible(k: Keypoint | undefined, min = MIN_KEYPOINT_SCORE): k is Keypoint {
  return k != null && k.score >= min;
}

export function midpoint(a: Keypoint, b: Keypoint): Keypoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, score: Math.min(a.score, b.score) };
}

/** Bounding box of visible keypoints, or null if fewer than two are visible. */
export function personBounds(
  person: Person,
  min = MIN_KEYPOINT_SCORE,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const visible = person.keypoints.filter((k) => k.score >= min);
  if (visible.length < 2) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const k of visible) {
    minX = Math.min(minX, k.x);
    minY = Math.min(minY, k.y);
    maxX = Math.max(maxX, k.x);
    maxY = Math.max(maxY, k.y);
  }
  return { minX, minY, maxX, maxY };
}

/** Hip midpoint, falling back to shoulders when hips are hidden. */
export function personCenter(person: Person): Keypoint | null {
  const k = person.keypoints;
  if (isVisible(k[KP.leftHip]) && isVisible(k[KP.rightHip])) {
    return midpoint(k[KP.leftHip], k[KP.rightHip]);
  }
  if (isVisible(k[KP.leftShoulder]) && isVisible(k[KP.rightShoulder])) {
    return midpoint(k[KP.leftShoulder], k[KP.rightShoulder]);
  }
  const b = personBounds(person);
  return b ? { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2, score: 1 } : null;
}

export function mirrorPerson(person: Person): Person {
  return {
    score: person.score,
    keypoints: person.keypoints.map((k) => ({ ...k, x: 1 - k.x })),
  };
}
