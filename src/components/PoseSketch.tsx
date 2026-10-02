import { memo } from 'react';
import Svg, { Circle, G, Line } from 'react-native-svg';
import { isVisible, SKELETON, type Person } from '@/core/keypoints';
import { canonicalize, type SegmentId } from '@/core/matching';
import type { Figure } from '@/core/poseDsl';
import { colors } from '@/lib/theme';

type Pt = { x: number; y: number };

/** Bones of a figure keyed by the matcher's segment ids, plus the torso outline. */
function bonesOf(figure: Figure) {
  const c = canonicalize(figure);
  const limbs: [SegmentId, Pt, Pt][] = [
    ['upperArmL', c.L.shoulder, c.L.elbow],
    ['forearmL', c.L.elbow, c.L.wrist],
    ['upperArmR', c.R.shoulder, c.R.elbow],
    ['forearmR', c.R.elbow, c.R.wrist],
    ['thighL', c.L.hip, c.L.knee],
    ['shinL', c.L.knee, c.L.ankle],
    ['thighR', c.R.hip, c.R.knee],
    ['shinR', c.R.knee, c.R.ankle],
  ];
  const torso: [Pt, Pt][] = [
    [c.L.shoulder, c.R.shoulder],
    [c.L.hip, c.R.hip],
    [c.L.shoulder, c.L.hip],
    [c.R.shoulder, c.R.hip],
  ];
  return { limbs, torso };
}

export interface PoseSketchProps {
  figures: Figure[];
  width: number;
  height: number;
  color?: string;
  /** Per-figure, per-segment colors for live feedback. */
  segmentColors?: (Partial<Record<SegmentId, string>> | null)[];
  /** Hide legs for waist-up poses. */
  hideLegs?: boolean;
  /** Stroke width as a fraction of view height. */
  stroke?: number;
  opacity?: number;
}

const LEG_SEGMENTS = new Set<SegmentId>(['thighL', 'shinL', 'thighR', 'shinR']);

/** The "ghost" pose outline drawn over the camera and on pose cards. */
export const PoseSketch = memo(function PoseSketch({
  figures,
  width,
  height,
  color = colors.overlayGhost,
  segmentColors,
  hideLegs = false,
  stroke = 0.018,
  opacity = 1,
}: PoseSketchProps) {
  const sw = Math.max(2, stroke * height);
  const px = (p: Pt) => ({ x: p.x * width, y: p.y * height });
  return (
    <Svg width={width} height={height} pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0 }}>
      {figures.map((figure, fi) => {
        const { limbs, torso } = bonesOf(figure);
        const head = px(figure.head);
        const torsoColor = segmentColors?.[fi]?.torso ?? color;
        return (
          <G key={fi} opacity={opacity}>
            {/* Soft shadow first so the outline reads on bright backgrounds. */}
            {[...torso, ...limbs.map(([, a, b]) => [a, b] as [Pt, Pt])].map(([a, b], i) => {
              const pa = px(a);
              const pb = px(b);
              return (
                <Line key={`s${i}`} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} stroke={colors.overlayShadow} strokeWidth={sw + 4} strokeLinecap="round" />
              );
            })}
            {torso.map(([a, b], i) => {
              const pa = px(a);
              const pb = px(b);
              return <Line key={`t${i}`} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} stroke={torsoColor} strokeWidth={sw * 0.8} strokeLinecap="round" />;
            })}
            {limbs.map(([id, a, b]) => {
              if (hideLegs && LEG_SEGMENTS.has(id)) return null;
              const pa = px(a);
              const pb = px(b);
              return (
                <Line
                  key={id}
                  x1={pa.x}
                  y1={pa.y}
                  x2={pb.x}
                  y2={pb.y}
                  stroke={segmentColors?.[fi]?.[id] ?? color}
                  strokeWidth={sw}
                  strokeLinecap="round"
                />
              );
            })}
            <Circle cx={head.x} cy={head.y} r={figure.head.r * height} stroke={colors.overlayShadow} strokeWidth={sw + 4} fill="none" />
            <Circle cx={head.x} cy={head.y} r={figure.head.r * height} stroke={torsoColor} strokeWidth={sw * 0.8} fill="none" />
          </G>
        );
      })}
    </Svg>
  );
});

/** Thin skeleton of what the camera actually sees. */
export const DetectedSkeleton = memo(function DetectedSkeleton({
  people,
  width,
  height,
  color = colors.accent2,
}: {
  people: Person[];
  width: number;
  height: number;
  color?: string;
}) {
  return (
    <Svg width={width} height={height} pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0 }}>
      {people.map((p, pi) => (
        <G key={pi}>
          {SKELETON.map(([a, b], i) => {
            const ka = p.keypoints[a];
            const kb = p.keypoints[b];
            if (!isVisible(ka) || !isVisible(kb)) return null;
            return (
              <Line
                key={i}
                x1={ka.x * width}
                y1={ka.y * height}
                x2={kb.x * width}
                y2={kb.y * height}
                stroke={color}
                strokeWidth={3}
                strokeLinecap="round"
                opacity={0.9}
              />
            );
          })}
          {p.keypoints.map((k, i) =>
            isVisible(k) && i > 4 ? <Circle key={`k${i}`} cx={k.x * width} cy={k.y * height} r={4} fill={color} /> : null,
          )}
        </G>
      ))}
    </Svg>
  );
});
