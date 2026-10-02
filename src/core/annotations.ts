import { canonicalize, type SegmentId, type SegmentResult, type ShotEvaluation } from './matching';
import type { Figure } from './poseDsl';

/**
 * Hand-written style labels drawn right on the body part that needs to move
 * ("raise arm ↑" next to the arm). Because the label sits on the limb itself,
 * it never has to say "left" or "right".
 */
export interface Annotation {
  text: string;
  /** Anchor in normalized view coordinates. */
  x: number;
  y: number;
  /** Text rotation in degrees, kept readable (never upside down). */
  rotate: number;
}

const upness = (deg: number) => -Math.cos((deg * Math.PI) / 180);
const rightness = (deg: number) => Math.sin((deg * Math.PI) / 180);

const PART: Record<Exclude<SegmentId, 'torso'>, { noun: string; up: string; down: string }> = {
  upperArmL: { noun: 'arm', up: 'raise arm ↑', down: 'lower arm ↓' },
  upperArmR: { noun: 'arm', up: 'raise arm ↑', down: 'lower arm ↓' },
  forearmL: { noun: 'hand', up: 'hand up ↑', down: 'hand down ↓' },
  forearmR: { noun: 'hand', up: 'hand up ↑', down: 'hand down ↓' },
  thighL: { noun: 'knee', up: 'lift knee ↑', down: 'knee down ↓' },
  thighR: { noun: 'knee', up: 'lift knee ↑', down: 'knee down ↓' },
  shinL: { noun: 'foot', up: 'lift foot ↑', down: 'foot down ↓' },
  shinR: { noun: 'foot', up: 'lift foot ↑', down: 'foot down ↓' },
};

/** Short label for one off-target segment, with an on-screen arrow. */
export function limbLabel(seg: SegmentResult): string | null {
  if (seg.actual == null) return null;
  const dUp = upness(seg.target) - upness(seg.actual);
  const dRight = rightness(seg.target) - rightness(seg.actual);
  if (seg.id === 'torso') {
    if (Math.abs(dRight) < 0.12) return null;
    return dRight > 0 ? 'lean →' : '← lean';
  }
  const part = PART[seg.id];
  if (Math.abs(dUp) >= Math.abs(dRight) * 0.8 && Math.abs(dUp) > 0.15) return dUp > 0 ? part.up : part.down;
  if (Math.abs(dRight) > 0.15) return dRight > 0 ? `${part.noun} →` : `← ${part.noun}`;
  return null;
}

type Pt = { x: number; y: number };

function segmentEnds(figure: Figure, id: SegmentId): [Pt, Pt] {
  const c = canonicalize(figure);
  switch (id) {
    case 'torso':
      return [
        { x: (c.L.hip.x + c.R.hip.x) / 2, y: (c.L.hip.y + c.R.hip.y) / 2 },
        { x: (c.L.shoulder.x + c.R.shoulder.x) / 2, y: (c.L.shoulder.y + c.R.shoulder.y) / 2 },
      ];
    case 'upperArmL':
      return [c.L.shoulder, c.L.elbow];
    case 'forearmL':
      return [c.L.elbow, c.L.wrist];
    case 'upperArmR':
      return [c.R.shoulder, c.R.elbow];
    case 'forearmR':
      return [c.R.elbow, c.R.wrist];
    case 'thighL':
      return [c.L.hip, c.L.knee];
    case 'shinL':
      return [c.L.knee, c.L.ankle];
    case 'thighR':
      return [c.R.hip, c.R.knee];
    case 'shinR':
      return [c.R.knee, c.R.ankle];
  }
}

/**
 * Place a label beside the target limb, pushed outward away from the body
 * and rotated along the bone like a hand-written note.
 */
export function placeLabel(figure: Figure, seg: SegmentResult, text: string, aspect: number): Annotation {
  const [a, b] = segmentEnds(figure, seg.id);
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  // Work in pixel-proportional units (height = 1) so angles match the screen.
  const dx = (b.x - a.x) * aspect;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  let normal = { x: -dy / len, y: dx / len };
  // Point the offset away from the body: toward the limb's own screen side.
  const outward = seg.side === 'L' ? -1 : seg.side === 'R' ? 1 : 0;
  if (outward !== 0 && Math.sign(normal.x) !== outward) normal = { x: -normal.x, y: -normal.y };
  if (outward === 0) normal = { x: 0, y: -1 };
  const offset = figure.head.r * 1.6;
  let rotate = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (rotate > 90) rotate -= 180;
  if (rotate < -90) rotate += 180;
  // Steep text is hard to read on a phone; keep notes gently tilted.
  rotate = Math.max(-30, Math.min(30, rotate));
  return {
    text,
    x: Math.min(0.92, Math.max(0.08, mid.x + (normal.x * offset) / aspect)),
    y: Math.min(0.95, Math.max(0.05, mid.y + normal.y * offset)),
    rotate,
  };
}

/** Up to `max` labels for the worst-matching limbs (one per person for couples). */
export function annotationsFor(evaluation: ShotEvaluation, aspect: number, max = 2): Annotation[] {
  if (evaluation.status !== 'adjusting') return [];
  const perPerson = evaluation.people.length > 1 ? 1 : max;
  const out: Annotation[] = [];
  evaluation.people.forEach((p, i) => {
    if (!p) return;
    const target = evaluation.targets[i];
    const ranked = [...p.pose.segments]
      .filter((s) => s.actual != null && s.similarity < 0.75)
      .sort((x, y) => (1 - y.similarity) * y.weight - (1 - x.similarity) * x.weight);
    let added = 0;
    for (const seg of ranked) {
      const text = limbLabel(seg);
      if (!text) continue;
      out.push(placeLabel(target, seg, text, aspect));
      if (++added >= perPerson) break;
    }
  });
  return out.slice(0, max);
}

/** The pose's cues as one instruction line, like "Hand on hip, pop one knee, chin down". */
export function cueSentence(cues: string[], max = 3): string {
  return cues
    .slice(0, max)
    .map((c, i) => (i === 0 ? c : c.charAt(0).toLowerCase() + c.slice(1)))
    .join(', ');
}
