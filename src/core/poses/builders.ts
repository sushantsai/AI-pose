import type { FigureSpec, LimbSpec } from '../poseDsl';

/**
 * Small vocabulary for authoring poses. `side` is the screen side: 'L' limbs
 * point outward with negative angles, 'R' limbs with positive ones, so every
 * helper is written once for the screen-right limb and flipped for 'L'.
 */
export type Side = 'L' | 'R';

const flip = (side: Side, limb: LimbSpec): LimbSpec =>
  side === 'R' ? limb : { ...limb, upper: -limb.upper, lower: -limb.lower };

export const arm = {
  relaxed: (s: Side) => flip(s, { upper: 8, lower: 5 }),
  onHip: (s: Side) => flip(s, { upper: 42, lower: -42 }),
  inPocket: (s: Side) => flip(s, { upper: 12, lower: -18 }),
  wave: (s: Side) => flip(s, { upper: 135, lower: 170 }),
  straightUp: (s: Side) => flip(s, { upper: 170, lower: 175 }),
  wideV: (s: Side) => flip(s, { upper: 140, lower: 140 }),
  outstretched: (s: Side) => flip(s, { upper: 90, lower: 90 }),
  /** Forearm across the stomach toward the other side. */
  acrossBody: (s: Side) => flip(s, { upper: 12, lower: -95 }),
  /** Hand up near the chin, elbow down in front of the body. */
  toFace: (s: Side) => flip(s, { upper: -15, lower: -172 }),
  /** Hand in the hair, elbow raised. */
  inHair: (s: Side) => flip(s, { upper: 140, lower: -115 }),
  /** Hand behind the head, elbow out. */
  behindHead: (s: Side) => flip(s, { upper: 120, lower: -120 }),
  /** Hand resting on a raised knee or the thigh while seated. */
  onKnee: (s: Side) => flip(s, { upper: 5, lower: -30 }),
  /** Pointing up and away at something. */
  point: (s: Side) => flip(s, { upper: 115, lower: 120 }),
  /** Arm reaching to the partner's back (drawn horizontal behind them). */
  aroundPartner: (s: Side) => flip(s, { upper: 60, lower: 95 }),
  /** Hand held low between partners. */
  holdHandLow: (s: Side) => flip(s, { upper: 6, lower: 12 }),
  /** Raised hand held by the partner for a twirl. */
  holdHandHigh: (s: Side) => flip(s, { upper: 150, lower: 175 }),
  /** Elbow resting on a wall or railing beside the body. */
  restingHigh: (s: Side) => flip(s, { upper: 75, lower: 170 }),
};

export const leg = {
  straight: (s: Side) => flip(s, { upper: 3, lower: 2 }),
  wide: (s: Side) => flip(s, { upper: 12, lower: 10 }),
  /** Ankle crossed in front of the other leg. */
  crossed: (s: Side) => flip(s, { upper: -6, lower: -14 }),
  /** Knee relaxed and turned in (classic "model" knee pop). */
  kneePop: (s: Side) => flip(s, { upper: -4, lower: 12, upperLen: 0.97 }),
  /** Forward step while walking toward the camera. */
  stepping: (s: Side) => flip(s, { upper: 5, lower: -4, upperLen: 0.85, lowerLen: 0.95 }),
  /** Seated, thigh pointing at the camera (foreshortened), shin down. */
  seated: (s: Side) => flip(s, { upper: 10, lower: 4, upperLen: 0.35 }),
  /** Seated with the knee up and foot near the body. */
  seatedKneeUp: (s: Side) => flip(s, { upper: 150, lower: 10, upperLen: 0.55 }),
  /** Seated with the leg stretched out sideways. */
  seatedOut: (s: Side) => flip(s, { upper: 80, lower: 85, upperLen: 0.9 }),
  /** Deep crouch, knee out. */
  crouch: (s: Side) => flip(s, { upper: 75, lower: 8, upperLen: 0.75 }),
  /** Tucked jump. */
  jumpTuck: (s: Side) => flip(s, { upper: 30, lower: -20, upperLen: 0.8 }),
  /** Back leg bent behind (e.g. leaning on a wall with one foot up). */
  footUp: (s: Side) => flip(s, { upper: 4, lower: -150, lowerLen: 0.6 }),
};

/** Standard full-body placement for a single person. */
export const SOLO_FULL = { at: { x: 0.5, y: 0.47 }, height: 0.72 } as const;
/** Waist-up portrait placement. */
export const SOLO_HALF = { at: { x: 0.5, y: 0.74 }, height: 1.12 } as const;
/** Seated, full body. */
export const SOLO_SEATED = { at: { x: 0.5, y: 0.6 }, height: 0.72 } as const;

export function figure(spec: Partial<FigureSpec> & Pick<FigureSpec, 'armL' | 'armR' | 'legL' | 'legR'>): FigureSpec {
  return { ...SOLO_FULL, ...spec };
}
