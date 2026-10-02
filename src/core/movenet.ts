import { KEYPOINT_COUNT, type Keypoint, type Person } from './keypoints';

/** MoveNet MultiPose Lightning, patched to a fixed square input. */
export const MOVENET_INPUT_SIZE = 256;
export const MOVENET_MAX_PEOPLE = 6;
/** Values per detection: 17 × (y, x, score) + box (ymin, xmin, ymax, xmax, score). */
export const MOVENET_STRIDE = 56;
export const MIN_PERSON_SCORE = 0.2;

export type Orientation = 'up' | 'right' | 'down' | 'left';

/** Everything needed to map model output back onto the on-screen preview. */
export interface FrameGeometry {
  /** Pixel buffer size as handed to the resizer. */
  bufferWidth: number;
  bufferHeight: number;
  /** How the buffer must be rotated to appear upright (VisionCamera `Frame.orientation`). */
  orientation: Orientation;
  /** True when pixels must be flipped horizontally to match the preview (`Frame.isMirrored`). */
  mirrored: boolean;
}

/** Decode the raw [1, 6, 56] output tensor into people in model-input space (0..1). */
export function decodeMultiPose(output: ArrayLike<number>, minScore = MIN_PERSON_SCORE): Person[] {
  const people: Person[] = [];
  for (let p = 0; p < MOVENET_MAX_PEOPLE; p++) {
    const base = p * MOVENET_STRIDE;
    if (base + MOVENET_STRIDE > output.length) break;
    const score = output[base + 55];
    if (!(score >= minScore)) continue;
    const keypoints: Keypoint[] = [];
    for (let k = 0; k < KEYPOINT_COUNT; k++) {
      keypoints.push({
        y: output[base + k * 3],
        x: output[base + k * 3 + 1],
        score: output[base + k * 3 + 2],
      });
    }
    people.push({ keypoints, score });
  }
  return people.sort((a, b) => b.score - a.score);
}

/**
 * Undo the resizer's 'contain' letterboxing: model-space (0..1 of the padded
 * square) → buffer-space (0..1 of the original buffer).
 */
export function unletterbox(
  p: { x: number; y: number },
  bufferWidth: number,
  bufferHeight: number,
  size = MOVENET_INPUT_SIZE,
): { x: number; y: number } {
  const scale = Math.min(size / bufferWidth, size / bufferHeight);
  const contentW = (bufferWidth * scale) / size;
  const contentH = (bufferHeight * scale) / size;
  const padX = (1 - contentW) / 2;
  const padY = (1 - contentH) / 2;
  return { x: (p.x - padX) / contentW, y: (p.y - padY) / contentH };
}

/** Rotate a normalized buffer point so it is upright, then apply mirroring. */
export function orientPoint(p: { x: number; y: number }, orientation: Orientation, mirrored: boolean) {
  let x: number;
  let y: number;
  switch (orientation) {
    case 'right': // buffer must be rotated 90° clockwise
      x = 1 - p.y;
      y = p.x;
      break;
    case 'left': // rotated 90° counter-clockwise
      x = p.y;
      y = 1 - p.x;
      break;
    case 'down':
      x = 1 - p.x;
      y = 1 - p.y;
      break;
    default:
      x = p.x;
      y = p.y;
  }
  return { x: mirrored ? 1 - x : x, y };
}

/** Size of the upright frame, after applying orientation. */
export function uprightSize(g: FrameGeometry): { width: number; height: number } {
  const sideways = g.orientation === 'left' || g.orientation === 'right';
  return sideways
    ? { width: g.bufferHeight, height: g.bufferWidth }
    : { width: g.bufferWidth, height: g.bufferHeight };
}

/**
 * Map a point from the upright frame (0..1) to the preview view (0..1), for a
 * preview that fills the view with resizeMode 'cover'.
 */
export function frameToView(
  p: { x: number; y: number },
  frame: { width: number; height: number },
  view: { width: number; height: number },
): { x: number; y: number } {
  const scale = Math.max(view.width / frame.width, view.height / frame.height);
  const shownW = frame.width * scale;
  const shownH = frame.height * scale;
  const offX = (view.width - shownW) / 2;
  const offY = (view.height - shownH) / 2;
  return {
    x: (p.x * shownW + offX) / view.width,
    y: (p.y * shownH + offY) / view.height,
  };
}

/** Full pipeline: raw model output → people in normalized preview coordinates. */
export function peopleInView(
  output: ArrayLike<number>,
  geometry: FrameGeometry,
  view: { width: number; height: number },
): Person[] {
  const upright = uprightSize(geometry);
  return decodeMultiPose(output).map((person) => ({
    score: person.score,
    keypoints: person.keypoints.map((k) => {
      const inBuffer = unletterbox(k, geometry.bufferWidth, geometry.bufferHeight);
      const inFrame = orientPoint(inBuffer, geometry.orientation, geometry.mirrored);
      const inView = frameToView(inFrame, upright, view);
      return { x: inView.x, y: inView.y, score: k.score };
    }),
  }));
}

/** People in normalized upright-frame coordinates (used for cropping the captured photo). */
export function peopleInFrame(output: ArrayLike<number>, geometry: FrameGeometry): Person[] {
  return decodeMultiPose(output).map((person) => ({
    score: person.score,
    keypoints: person.keypoints.map((k) => {
      const inFrame = orientPoint(
        unletterbox(k, geometry.bufferWidth, geometry.bufferHeight),
        geometry.orientation,
        geometry.mirrored,
      );
      return { x: inFrame.x, y: inFrame.y, score: k.score };
    }),
  }));
}
