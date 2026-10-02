import { KP } from '../keypoints';
import { boneAngle } from '../matching';
import { buildFigure, mirrorFigure } from '../poseDsl';
import { arm, figure, leg } from '../poses/builders';

const ASPECT = 9 / 16;

describe('buildFigure', () => {
  const standing = figure({
    armL: arm.relaxed('L'),
    armR: arm.outstretched('R'),
    legL: leg.straight('L'),
    legR: leg.straight('R'),
  });
  const f = buildFigure(standing, ASPECT);
  const k = f.keypoints;

  it('places joints in anatomical order top to bottom', () => {
    expect(k[KP.nose].y).toBeLessThan(k[KP.leftShoulder].y);
    expect(k[KP.leftShoulder].y).toBeLessThan(k[KP.leftHip].y);
    expect(k[KP.leftHip].y).toBeLessThan(k[KP.leftKnee].y);
    expect(k[KP.leftKnee].y).toBeLessThan(k[KP.leftAnkle].y);
  });

  it('puts the anatomical left on screen-right when facing the camera', () => {
    expect(k[KP.leftShoulder].x).toBeGreaterThan(k[KP.rightShoulder].x);
    expect(k[KP.leftHip].x).toBeGreaterThan(k[KP.rightHip].x);
  });

  it('puts the anatomical left on screen-left when facing away and hides the face', () => {
    const away = buildFigure({ ...standing, facing: 'away' }, ASPECT).keypoints;
    expect(away[KP.leftShoulder].x).toBeLessThan(away[KP.rightShoulder].x);
    expect(away[KP.nose].score).toBe(0);
  });

  it('keeps authored angles correct on screen regardless of aspect ratio', () => {
    // The screen-right arm is authored straight out (90°); for a person facing
    // the camera that is their anatomical left arm.
    const angle = boneAngle(k[KP.leftShoulder], k[KP.leftElbow], ASPECT);
    expect(angle).toBeCloseTo(90, 5);
    const wide = buildFigure(standing, 16 / 9).keypoints;
    expect(boneAngle(wide[KP.leftShoulder], wide[KP.leftElbow], 16 / 9)).toBeCloseTo(90, 5);
  });

  it('scales with the requested height', () => {
    const tall = buildFigure({ ...standing, height: 0.8 }, ASPECT).keypoints;
    const short = buildFigure({ ...standing, height: 0.4 }, ASPECT).keypoints;
    const span = (kp: typeof tall) => kp[KP.leftAnkle].y - kp[KP.leftShoulder].y;
    expect(span(tall) / span(short)).toBeCloseTo(2, 5);
  });

  it('mirrors around the vertical center line', () => {
    const m = mirrorFigure(f);
    expect(m.keypoints[KP.nose].x).toBeCloseTo(1 - k[KP.nose].x);
    expect(m.head.x).toBeCloseTo(1 - f.head.x);
  });
});
