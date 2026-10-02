import { SCENES, VIBES } from '@contract';
import { personBounds } from '../keypoints';
import { buildFigure } from '../poseDsl';
import { catalogLine, getPose, POSES, posesFor } from '../poses';
import { CATALOG } from '../../../supabase/functions/_shared/catalog';

describe('pose library', () => {
  it('has a healthy number of solo and couple poses', () => {
    expect(posesFor(1).length).toBeGreaterThanOrEqual(25);
    expect(posesFor(2).length).toBeGreaterThanOrEqual(12);
  });

  it('uses unique ids', () => {
    const ids = POSES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(getPose(ids[0])).toBe(POSES[0]);
  });

  it.each(POSES.map((p) => [p.id, p] as const))('%s is well formed', (_id, pose) => {
    expect(pose.figures).toHaveLength(pose.people);
    expect(pose.cues.length).toBeGreaterThan(0);
    pose.scenes.forEach((s) => expect(SCENES).toContain(s));
    pose.vibes.forEach((v) => expect(VIBES).toContain(v));

    for (const spec of pose.figures) {
      const fig = buildFigure(spec, 9 / 16);
      for (const k of fig.keypoints) {
        expect(Number.isFinite(k.x)).toBe(true);
        expect(Number.isFinite(k.y)).toBe(true);
      }
      const b = personBounds(fig)!;
      // Sketches should be on screen; half-body poses may run off the bottom.
      expect(b.minX).toBeGreaterThan(-0.05);
      expect(b.maxX).toBeLessThan(1.05);
      expect(b.minY).toBeGreaterThan(0);
      if (pose.framing === 'full') expect(b.maxY).toBeLessThan(1);
    }
  });

  it('keeps the AI catalog in sync with the library (run `npm run gen:catalog`)', () => {
    expect(CATALOG).toEqual(POSES.map((p) => ({ id: p.id, people: p.people, line: catalogLine(p) })));
  });
});
