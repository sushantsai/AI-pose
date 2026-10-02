import { KP } from '../keypoints';
import { evaluateShot } from '../matching';
import { peopleInView } from '../movenet';
import { buildFigure } from '../poseDsl';
import { getPose, posesFor } from '../poses';
import fixture from './fixtures/dancer.json';

/**
 * Output of the bundled MoveNet model on a real photo (a man in a deep squat,
 * side-on), letterboxed exactly like the on-device resizer does. Generated with
 * the Python LiteRT runtime; guards the decode + coordinate pipeline.
 */
describe('real MoveNet output', () => {
  const view = { width: fixture.width, height: fixture.height };
  const geometry = { bufferWidth: fixture.width, bufferHeight: fixture.height, orientation: 'up' as const, mirrored: false };
  const people = peopleInView(fixture.output, geometry, view);

  it('finds exactly one person with anatomically sensible keypoints', () => {
    expect(people).toHaveLength(1);
    const k = people[0].keypoints;
    expect(k[KP.nose].x).toBeCloseTo(0.585, 2);
    expect(k[KP.nose].y).toBeCloseTo(0.337, 2);
    expect(k[KP.nose].y).toBeLessThan(k[KP.leftHip].y);
    expect(k[KP.leftHip].y).toBeLessThan(k[KP.leftAnkle].y);
  });

  it('never reports a false "ready" for poses the person is not doing', () => {
    // A side-on squat is not in the library, so nothing should come close.
    const aspect = view.width / view.height;
    for (const pose of posesFor(1)) {
      const result = evaluateShot(pose.figures.map((f) => buildFigure(f, aspect)), people, {
        aspect,
        camera: 'back',
        framing: pose.framing,
      });
      expect(result.status).not.toBe('ready');
      expect(result.score).toBeLessThan(70);
    }
  });

  it('ranks hands-near-face poses above arms-down poses for raised hands', () => {
    const aspect = view.width / view.height;
    const score = (id: string) => {
      const pose = getPose(id)!;
      return evaluateShot(pose.figures.map((f) => buildFigure(f, aspect)), people, { aspect, camera: 'back', framing: pose.framing }).score;
    };
    expect(score('solo-coffee')).toBeGreaterThan(score('solo-portrait-straight'));
  });
});
