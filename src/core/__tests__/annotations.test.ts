import { annotationsFor, cueSentence, limbLabel, placeLabel } from '../annotations';
import { evaluateShot, type SegmentResult } from '../matching';
import { buildFigure, type FigureSpec } from '../poseDsl';
import { arm, figure, leg } from '../poses/builders';
import { defaultPicks } from '../recommend';

const ASPECT = 9 / 16;
const relaxed: FigureSpec = figure({ armL: arm.relaxed('L'), armR: arm.relaxed('R'), legL: leg.straight('L'), legR: leg.straight('R') });
const wave: FigureSpec = { ...relaxed, armR: arm.wave('R') };
const seg = (p: Partial<SegmentResult>): SegmentResult => ({ id: 'upperArmR', side: 'R', weight: 1, target: 0, actual: 0, similarity: 0, ...p });

describe('limbLabel', () => {
  it('says which way to move, without left/right', () => {
    expect(limbLabel(seg({ target: 160, actual: 10 }))).toBe('raise arm ↑');
    expect(limbLabel(seg({ id: 'forearmL', side: 'L', target: 5, actual: 170 }))).toBe('hand down ↓');
    expect(limbLabel(seg({ id: 'thighR', target: 80, actual: 5 }))).toBe('lift knee ↑');
    expect(limbLabel(seg({ id: 'shinL', side: 'L', target: -40, actual: 0 }))).toBe('← foot');
    expect(limbLabel(seg({ id: 'torso', side: undefined, target: 170, actual: 180 }))).toBe('lean →');
    expect(limbLabel(seg({ actual: null }))).toBeNull();
  });
});

describe('placeLabel', () => {
  it('puts the label outside the body, on the limb’s side, readable', () => {
    const f = buildFigure(wave, ASPECT);
    const a = placeLabel(f, seg({ id: 'upperArmR', side: 'R' }), 'raise arm ↑', ASPECT);
    expect(a.x).toBeGreaterThan(0.5);
    expect(Math.abs(a.rotate)).toBeLessThanOrEqual(30);
    const l = placeLabel(f, seg({ id: 'thighL', side: 'L' }), 'x', ASPECT);
    expect(l.x).toBeLessThan(0.5);
  });
});

describe('annotationsFor', () => {
  it('labels the arm that needs raising', () => {
    const target = buildFigure(wave, ASPECT);
    const f = buildFigure(relaxed, ASPECT);
    const ev = evaluateShot([target], [{ ...f, score: 0.9 }], { aspect: ASPECT, camera: 'back', framing: 'full' });
    const labels = annotationsFor(ev, ASPECT);
    expect(labels.length).toBeGreaterThan(0);
    expect(labels[0].text).toMatch(/raise arm|hand up/);
    expect(labels[0].x).toBeGreaterThan(0.5);
  });

  it('shows nothing once the pose matches', () => {
    const target = buildFigure(wave, ASPECT);
    const ev = evaluateShot([target], [{ ...target, score: 0.9 }], { aspect: ASPECT, camera: 'back', framing: 'full' });
    expect(annotationsFor(ev, ASPECT)).toEqual([]);
    expect(ev.framingHints).toEqual([]);
  });
});

describe('helpers', () => {
  it('joins cues into one instruction line', () => {
    expect(cueSentence(['Put one hand on your hip', 'Pop the opposite knee', 'Chin down', 'Smile'])).toBe(
      'Put one hand on your hip, pop the opposite knee, chin down',
    );
  });

  it('pages through default picks', () => {
    const a = defaultPicks(1, 0).map((p) => p.id);
    const b = defaultPicks(1, 1).map((p) => p.id);
    expect(a).toHaveLength(4);
    expect(a.some((id) => b.includes(id))).toBe(false);
    defaultPicks(2, 5).forEach((p) => expect(p.people).toBe(2));
  });
});
