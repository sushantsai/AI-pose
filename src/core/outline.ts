import { canonicalize } from './matching';
import type { Figure } from './poseDsl';

type Pt = { x: number; y: number };

/** A pose as body-shaped capsules, in pixels. Rendering draws its contour. */
export interface BodyShape {
  bones: { a: Pt; b: Pt; w: number }[];
  /** Shoulder–hip quad, rounded by `torsoW`. */
  torso: Pt[];
  torsoW: number;
  head: { c: Pt; r: number };
}

/** Body parts sized from the head radius so every figure scale looks right. */
export function bodyShape(figure: Figure, width: number, height: number, hideLegs = false): BodyShape {
  const px = (p: Pt) => ({ x: p.x * width, y: p.y * height });
  const c = canonicalize(figure);
  const r = figure.head.r * height;
  const bones: { a: Pt; b: Pt; w: number }[] = [
    { a: c.L.shoulder, b: c.L.elbow, w: 1.05 * r },
    { a: c.L.elbow, b: c.L.wrist, w: 0.85 * r },
    { a: c.R.shoulder, b: c.R.elbow, w: 1.05 * r },
    { a: c.R.elbow, b: c.R.wrist, w: 0.85 * r },
  ];
  if (!hideLegs) {
    bones.push(
      { a: c.L.hip, b: c.L.knee, w: 1.5 * r },
      { a: c.L.knee, b: c.L.ankle, w: 1.05 * r },
      { a: c.R.hip, b: c.R.knee, w: 1.5 * r },
      { a: c.R.knee, b: c.R.ankle, w: 1.05 * r },
    );
  }
  const shoulderMid = { x: (c.L.shoulder.x + c.R.shoulder.x) / 2, y: (c.L.shoulder.y + c.R.shoulder.y) / 2 };
  bones.push({ a: shoulderMid, b: { x: figure.head.x, y: figure.head.y }, w: 0.8 * r });
  return {
    bones: bones.map((bone) => ({ a: px(bone.a), b: px(bone.b), w: bone.w })),
    torso: [c.L.shoulder, c.R.shoulder, c.R.hip, c.L.hip].map(px),
    torsoW: 1.5 * r,
    head: { c: px(figure.head), r },
  };
}

/** Outline thickness that reads well from thumbnails up to full screen. */
export function outlineThickness(figure: Figure | undefined, height: number): number {
  const r = figure ? figure.head.r * height : 10;
  return Math.min(4, Math.max(1.5, r * 0.13));
}

/**
 * SVG markup for the shape grown by `grow` px, in a single color. Used inside
 * masks: (shape grown by t) minus (shape) = an outline of the whole body.
 */
export function shapeSvg(shape: BodyShape, grow: number, color: string): string {
  const d = `M${shape.torso.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L')} Z`;
  const parts = [
    `<path d="${d}" fill="${color}" stroke="${color}" stroke-width="${Math.max(0.5, shape.torsoW + grow * 2)}" stroke-linejoin="round"/>`,
    ...shape.bones.map(
      (b) =>
        `<line x1="${b.a.x.toFixed(1)}" y1="${b.a.y.toFixed(1)}" x2="${b.b.x.toFixed(1)}" y2="${b.b.y.toFixed(1)}" stroke="${color}" stroke-width="${Math.max(0.5, b.w + grow * 2)}" stroke-linecap="round"/>`,
    ),
    `<circle cx="${shape.head.c.x.toFixed(1)}" cy="${shape.head.c.y.toFixed(1)}" r="${Math.max(0.5, shape.head.r + grow)}" fill="${color}"/>`,
  ];
  return parts.join('');
}
