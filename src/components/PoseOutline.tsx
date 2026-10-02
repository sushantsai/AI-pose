import { memo, useId } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, Mask, Path, Rect } from 'react-native-svg';
import type { Annotation } from '@/core/annotations';
import { bodyShape, outlineThickness, type BodyShape } from '@/core/outline';
import type { Figure } from '@/core/poseDsl';
import { fonts } from '@/lib/theme';

function ShapeLayer({ shape, grow, color }: { shape: BodyShape; grow: number; color: string }) {
  const d = `M${shape.torso.map((p) => `${p.x},${p.y}`).join(' L')} Z`;
  return (
    <G>
      <Path d={d} fill={color} stroke={color} strokeWidth={Math.max(0.5, shape.torsoW + grow * 2)} strokeLinejoin="round" />
      {shape.bones.map((b, i) => (
        <Line key={i} x1={b.a.x} y1={b.a.y} x2={b.b.x} y2={b.b.y} stroke={color} strokeWidth={Math.max(0.5, b.w + grow * 2)} strokeLinecap="round" />
      ))}
      <Circle cx={shape.head.c.x} cy={shape.head.c.y} r={Math.max(0.5, shape.head.r + grow)} fill={color} />
    </G>
  );
}

export interface PoseOutlineProps {
  figures: Figure[];
  width: number;
  height: number;
  color?: string;
  hideLegs?: boolean;
  /** Outline thickness in px; defaults to scale with the figure. */
  thickness?: number;
  /** Draw a soft dark halo so the line reads on bright backgrounds. */
  halo?: boolean;
}

/**
 * Smooth body-contour outline of a pose: the union of limb capsules, torso and
 * head, drawn as a single line (mask of "grown" shape minus the shape itself).
 */
export const PoseOutline = memo(function PoseOutline({
  figures,
  width,
  height,
  color = '#FFFFFF',
  hideLegs = false,
  thickness,
  halo = true,
}: PoseOutlineProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const shapes = figures.map((f) => bodyShape(f, width, height, hideLegs));
  const t = thickness ?? outlineThickness(figures[0], height);
  const layers = [
    ...(halo ? [{ id: `${uid}h`, grow: t + 2.5, inset: -1.5, fill: 'rgba(0,0,0,0.28)' }] : []),
    { id: `${uid}l`, grow: t, inset: 0, fill: color },
  ];
  return (
    <Svg width={width} height={height} pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Defs>
        {layers.map((layer) => (
          <Mask key={layer.id} id={layer.id} maskUnits="userSpaceOnUse" x={0} y={0} width={width} height={height}>
            <Rect x={0} y={0} width={width} height={height} fill="black" />
            {shapes.map((s, i) => (
              <ShapeLayer key={`o${i}`} shape={s} grow={layer.grow} color="white" />
            ))}
            {shapes.map((s, i) => (
              <ShapeLayer key={`i${i}`} shape={s} grow={layer.inset} color="black" />
            ))}
          </Mask>
        ))}
      </Defs>
      {layers.map((layer) => (
        <Rect key={layer.id} x={0} y={0} width={width} height={height} fill={layer.fill} mask={`url(#${layer.id})`} />
      ))}
    </Svg>
  );
});

/** Hand-written notes placed on the limbs that need to move. */
export const LimbNotes = memo(function LimbNotes({
  notes,
  width,
  height,
  color = '#FFFFFF',
}: {
  notes: Annotation[];
  width: number;
  height: number;
  color?: string;
}) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {notes.map((n, i) => (
        <View
          key={`${n.text}${i}`}
          style={[styles.note, { left: n.x * width - 90, top: n.y * height - 22, transform: [{ rotate: `${n.rotate}deg` }] }]}
        >
          <Text style={[styles.noteText, { color }]}>{n.text}</Text>
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  note: { position: 'absolute', width: 180, height: 44, alignItems: 'center', justifyContent: 'center' },
  noteText: {
    fontFamily: fonts.hand,
    fontSize: 28,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 1 },
  },
});
