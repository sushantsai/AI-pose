import {
  decodeMultiPose,
  frameToView,
  MOVENET_STRIDE,
  orientPoint,
  peopleInView,
  unletterbox,
} from '../movenet';

function fakeOutput(people: { score: number; x: number; y: number }[]): Float32Array {
  const out = new Float32Array(6 * MOVENET_STRIDE);
  people.forEach((p, i) => {
    const base = i * MOVENET_STRIDE;
    for (let k = 0; k < 17; k++) {
      out[base + k * 3] = p.y;
      out[base + k * 3 + 1] = p.x;
      out[base + k * 3 + 2] = 0.8;
    }
    out[base + 55] = p.score;
  });
  return out;
}

describe('decodeMultiPose', () => {
  it('keeps confident detections, best first', () => {
    const people = decodeMultiPose(fakeOutput([
      { score: 0.4, x: 0.3, y: 0.5 },
      { score: 0.05, x: 0.5, y: 0.5 },
      { score: 0.9, x: 0.7, y: 0.5 },
    ]));
    expect(people).toHaveLength(2);
    expect(people[0].score).toBeCloseTo(0.9);
    expect(people[0].keypoints[0].x).toBeCloseTo(0.7);
    expect(people[1].keypoints).toHaveLength(17);
  });
});

describe('coordinate mapping', () => {
  it('removes letterbox padding for a portrait buffer', () => {
    // 720x1280 into 256x256 'contain': content is 144 px wide, centered.
    const left = unletterbox({ x: 56 / 256, y: 0 }, 720, 1280);
    const right = unletterbox({ x: 200 / 256, y: 1 }, 720, 1280);
    expect(left.x).toBeCloseTo(0);
    expect(right.x).toBeCloseTo(1);
    expect(right.y).toBeCloseTo(1);
  });

  it('orients and mirrors points', () => {
    expect(orientPoint({ x: 0.2, y: 0.1 }, 'up', false)).toEqual({ x: 0.2, y: 0.1 });
    expect(orientPoint({ x: 0.2, y: 0.1 }, 'up', true).x).toBeCloseTo(0.8);
    expect(orientPoint({ x: 0.2, y: 0.1 }, 'down', false)).toEqual({ x: 0.8, y: 0.9 });
  });

  it('maps a 16:9 frame onto a taller phone screen with cover cropping', () => {
    const frame = { width: 720, height: 1280 };
    const view = { width: 390, height: 844 };
    // Center stays center.
    const c = frameToView({ x: 0.5, y: 0.5 }, frame, view);
    expect(c.x).toBeCloseTo(0.5);
    expect(c.y).toBeCloseTo(0.5);
    // The frame is wider than the screen, so its edges fall outside the view.
    expect(frameToView({ x: 0, y: 0.5 }, frame, view).x).toBeLessThan(0);
  });

  it('runs the whole pipeline', () => {
    const out = fakeOutput([{ score: 0.9, x: 0.5, y: 0.5 }]);
    const [person] = peopleInView(out, { bufferWidth: 720, bufferHeight: 1280, orientation: 'up', mirrored: false }, { width: 720, height: 1280 });
    expect(person.keypoints[0].x).toBeCloseTo(0.5);
    expect(person.keypoints[0].y).toBeCloseTo(0.5);
  });
});
