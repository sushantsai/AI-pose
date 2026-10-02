import { KP, type Person } from '../keypoints';
import {
  angleDiff,
  canonicalize,
  evaluateShot,
  framingHints,
  personSide,
  poseHints,
  scorePose,
} from '../matching';
import { buildFigure, mirrorFigure, type FigureSpec } from '../poseDsl';
import { arm, figure, leg } from '../poses/builders';
import { getPose } from '../poses';

const ASPECT = 9 / 16;

const relaxed: FigureSpec = figure({ armL: arm.relaxed('L'), armR: arm.relaxed('R'), legL: leg.straight('L'), legR: leg.straight('R') });
const waveRight: FigureSpec = { ...relaxed, armR: arm.wave('R') };

/** Treat a sketch as if the camera had detected it. */
const asDetected = (spec: FigureSpec, jitter = 0): Person => {
  const f = buildFigure(spec, ASPECT);
  return {
    score: 0.9,
    keypoints: f.keypoints.map((k, i) => ({
      x: k.x + (i % 2 ? jitter : -jitter),
      y: k.y + (i % 3 ? jitter : -jitter),
      score: 0.9,
    })),
  };
};

describe('angle helpers', () => {
  it('wraps around 360', () => {
    expect(angleDiff(170, -170)).toBeCloseTo(20);
    expect(angleDiff(10, 350)).toBeCloseTo(20);
    expect(angleDiff(90, 90)).toBe(0);
  });
});

describe('canonicalize', () => {
  it('labels limbs by screen side, whichever way the person faces', () => {
    const front = canonicalize(buildFigure(relaxed, ASPECT));
    const back = canonicalize(buildFigure({ ...relaxed, facing: 'away' }, ASPECT));
    expect(front.L.shoulder.x).toBeLessThan(front.R.shoulder.x);
    expect(back.L.shoulder.x).toBeLessThan(back.R.shoulder.x);
  });
});

describe('scorePose', () => {
  const target = buildFigure(waveRight, ASPECT);

  it('scores a perfect match at 100', () => {
    expect(scorePose(target, asDetected(waveRight), { aspect: ASPECT, includeLegs: true }).score).toBeCloseTo(100);
  });

  it('tolerates small jitter', () => {
    expect(scorePose(target, asDetected(waveRight, 0.005), { aspect: ASPECT, includeLegs: true }).score).toBeGreaterThan(90);
  });

  it('penalises a missing arm raise', () => {
    const result = scorePose(target, asDetected(relaxed), { aspect: ASPECT, includeLegs: true });
    expect(result.score).toBeLessThan(85);
    const worst = [...result.segments].sort((a, b) => a.similarity - b.similarity)[0];
    expect(['upperArmR', 'forearmR']).toContain(worst.id);
  });

  it('flags hidden legs only when legs matter', () => {
    const noLegs = asDetected(waveRight);
    [KP.leftKnee, KP.rightKnee, KP.leftAnkle, KP.rightAnkle].forEach((i) => (noLegs.keypoints[i].score = 0.05));
    expect(scorePose(target, noLegs, { aspect: ASPECT, includeLegs: true }).legsHidden).toBe(true);
    const half = scorePose(target, noLegs, { aspect: ASPECT, includeLegs: false });
    expect(half.legsHidden).toBe(false);
    expect(half.score).toBeCloseTo(100);
  });
});

describe('hints', () => {
  it('maps screen sides to the person’s own sides per camera', () => {
    expect(personSide('R', 'front')).toBe('right');
    expect(personSide('R', 'back')).toBe('left');
  });

  it('asks to raise the right arm (from the subject’s view) when shot with the back camera', () => {
    const result = scorePose(buildFigure(waveRight, ASPECT), asDetected(relaxed), { aspect: ASPECT, includeLegs: true });
    const hints = poseHints(result, 'back');
    expect(hints[0]).toMatch(/^Raise your left (arm|hand)$/);
    expect(poseHints(result, 'front')[0]).toMatch(/^Raise your right (arm|hand)$/);
  });

  it('asks to lower an arm that is too high', () => {
    const result = scorePose(buildFigure(relaxed, ASPECT), asDetected(waveRight), { aspect: ASPECT, includeLegs: true });
    expect(poseHints(result, 'front')[0]).toMatch(/^Lower your right (arm|hand)$/);
  });

  it('gives framing directions', () => {
    const target = buildFigure(relaxed, ASPECT);
    const small = asDetected({ ...relaxed, height: relaxed.height * 0.5 });
    expect(framingHints(target, small, 'back').hints).toContain('Come a little closer');
    const shifted = asDetected({ ...relaxed, at: { x: 0.25, y: relaxed.at.y } });
    // Person is on screen-left and must move screen-right: their left on the back camera.
    expect(framingHints(target, shifted, 'back').hints).toContain('Move a little to your left');
    expect(framingHints(target, shifted, 'front').hints).toContain('Move a little to your right');
    expect(framingHints(target, asDetected(relaxed), 'back').ok).toBe(true);
  });
});

describe('evaluateShot', () => {
  const opts = { aspect: ASPECT, camera: 'back' as const, framing: 'full' as const };

  it('reports when nobody is in frame', () => {
    const r = evaluateShot([buildFigure(relaxed, ASPECT)], [], opts);
    expect(r.status).toBe('no-person');
    expect(r.hints[0]).toBe('Step into the frame');
  });

  it('is ready when the pose and framing match', () => {
    const r = evaluateShot([buildFigure(waveRight, ASPECT)], [asDetected(waveRight)], opts);
    expect(r.status).toBe('ready');
    expect(r.hints[0]).toMatch(/hold still/i);
  });

  it('accepts the mirror image of the pose', () => {
    const target = buildFigure(waveRight, ASPECT);
    const mirroredPerson = mirrorFigure(buildFigure(waveRight, ASPECT));
    const r = evaluateShot([target], [{ ...mirroredPerson, score: 0.9 }], opts);
    expect(r.mirrored).toBe(true);
    expect(r.status).toBe('ready');
  });

  it('handles couples regardless of detection order', () => {
    const pose = getPose('duo-hold-hands')!;
    const targets = pose.figures.map((f) => buildFigure(f, ASPECT));
    const people = pose.figures.map((f) => asDetected(f)).reverse();
    const r = evaluateShot(targets, people, opts);
    expect(r.status).toBe('ready');
    expect(r.score).toBeGreaterThan(95);
  });

  it('asks for the second person in a couple pose', () => {
    const pose = getPose('duo-side-hug')!;
    const targets = pose.figures.map((f) => buildFigure(f, ASPECT));
    const r = evaluateShot(targets, [asDetected(pose.figures[0])], opts);
    expect(r.status).toBe('missing-person');
  });

  it('asks a couple standing far apart to move closer', () => {
    const pose = getPose('duo-side-hug')!;
    const targets = pose.figures.map((f) => buildFigure(f, ASPECT));
    const people = [
      asDetected({ ...pose.figures[0], at: { x: 0.1, y: pose.figures[0].at.y } }),
      asDetected({ ...pose.figures[1], at: { x: 0.9, y: pose.figures[1].at.y } }),
    ];
    const r = evaluateShot(targets, people, opts);
    expect(r.status).toBe('adjusting');
    expect(r.hints).toContain('Move closer together');
  });
});
