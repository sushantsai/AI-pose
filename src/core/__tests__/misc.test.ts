import { sanitizePostKit, sanitizeSceneAnalysis, type SceneAnalysis } from '@contract';
import { captureReducer, DEFAULT_CAPTURE, holdProgress, type CaptureState } from '../capture';
import { smartCrop, subjectBounds } from '../crop';
import { buildFigure } from '../poseDsl';
import { getPose, POSES } from '../poses';
import { localSceneAnalysis, rankPoses } from '../recommend';
import { smoothPeople } from '../smoothing';

describe('smartCrop', () => {
  const image = { width: 3000, height: 4000 };
  it('returns the largest crop of the requested aspect', () => {
    const story = smartCrop(image, 9 / 16, null);
    expect(story.height).toBe(4000);
    expect(story.width / story.height).toBeCloseTo(9 / 16, 2);
    const square = smartCrop(image, 1, null);
    expect(square.width).toBe(3000);
    expect(square.height).toBe(3000);
  });

  it('keeps an off-center subject inside the crop', () => {
    const subject = { x: 0.05, y: 0.1, width: 0.2, height: 0.8 };
    const crop = smartCrop(image, 9 / 16, subject);
    expect(crop.x).toBe(0);
    const square = smartCrop(image, 1, { x: 0.4, y: 0.6, width: 0.2, height: 0.35 });
    expect(square.y + square.height).toBeLessThanOrEqual(4000);
    expect(square.y).toBeLessThanOrEqual(0.6 * 4000);
  });

  it('derives subject bounds from people', () => {
    const fig = buildFigure(getPose('solo-classic-hip')!.figures[0], 3 / 4);
    const b = subjectBounds([fig])!;
    expect(b.height).toBeGreaterThan(0.5);
    expect(b.x).toBeGreaterThan(0.2);
  });
});

describe('captureReducer', () => {
  const cfg = { ...DEFAULT_CAPTURE, holdMs: 500, countdownMs: 0 };
  const tick = (now: number, score: number, ready = score >= cfg.threshold) => ({ type: 'tick' as const, now, score, ready });

  it('fires after holding the pose', () => {
    let s: CaptureState = { phase: 'searching' };
    s = captureReducer(s, tick(0, 85), cfg);
    expect(s.phase).toBe('holding');
    expect(holdProgress(s, 250, cfg)).toBeCloseTo(0.5);
    s = captureReducer(s, tick(300, 78), cfg); // small dip is tolerated
    expect(s.phase).toBe('holding');
    s = captureReducer(s, tick(520, 86), cfg);
    expect(s.phase).toBe('capturing');
    s = captureReducer(s, { type: 'captured', now: 600 }, cfg);
    expect(s.phase).toBe('cooldown');
    s = captureReducer(s, tick(600 + cfg.cooldownMs, 90), cfg);
    expect(s.phase).toBe('searching');
  });

  it('resets when the pose is lost', () => {
    let s: CaptureState = captureReducer({ phase: 'searching' }, tick(0, 85), cfg);
    s = captureReducer(s, tick(100, 50), cfg);
    expect(s.phase).toBe('searching');
  });

  it('counts down when a timer is set', () => {
    const timed = { ...cfg, countdownMs: 3000 };
    let s: CaptureState = captureReducer({ phase: 'searching' }, tick(0, 85), timed);
    s = captureReducer(s, tick(600, 85), timed);
    expect(s.phase).toBe('countdown');
    s = captureReducer(s, tick(2000, 70), timed); // moderate wobble during countdown
    expect(s.phase).toBe('countdown');
    s = captureReducer(s, tick(3700, 82), timed);
    expect(s.phase).toBe('capturing');
  });
});

describe('recommendations', () => {
  it('ranks scene-appropriate poses with variety', () => {
    const picks = rankPoses('beach', 1, 'playful');
    expect(picks).toHaveLength(4);
    picks.forEach((p) => expect(p.people).toBe(1));
    expect(picks.some((p) => p.scenes.includes('beach'))).toBe(true);
    const postures = picks.map((p) => p.posture);
    postures.forEach((posture) => expect(postures.filter((x) => x === posture).length).toBeLessThanOrEqual(2));
  });

  it('only suggests couple poses for two people', () => {
    rankPoses('sunset', 2, 'romantic').forEach((p) => expect(p.people).toBe(2));
    expect(localSceneAnalysis('city', 2).recommendations.length).toBeGreaterThan(0);
  });
});

describe('contract sanitizers', () => {
  const valid = new Set(POSES.filter((p) => p.people === 1).map((p) => p.id));
  it('drops unknown, duplicate and wrong-size poses', () => {
    const raw: SceneAnalysis = {
      scene: { type: 'beach', summary: 'Beach', lighting: 'Backlit' },
      recommendations: [
        { poseId: 'solo-wave', why: 'a', placement: 'b' },
        { poseId: 'solo-wave', why: 'dup', placement: 'b' },
        { poseId: 'made-up', why: 'x', placement: 'y' },
        { poseId: 'duo-twirl', why: 'couple', placement: 'y' },
        { poseId: 'solo-jump', why: 'c', placement: 'd' },
      ],
      photographerTips: ['one', 'two', 'three', 'four'],
      framing: { orientation: 'portrait', cameraHeight: 'low' },
    };
    const clean = sanitizeSceneAnalysis(raw, valid);
    expect(clean.recommendations.map((r) => r.poseId)).toEqual(['solo-wave', 'solo-jump']);
    expect(clean.photographerTips).toHaveLength(3);
  });

  it('normalizes hashtags', () => {
    const kit = sanitizePostKit({
      captions: [{ style: 'short', text: ' Golden hour ' }],
      hashtags: ['sunset', '#sunset', 'golden hour', ''],
      altText: 'A person on a beach',
      tip: 'Post in the evening',
    });
    expect(kit.hashtags).toEqual(['#sunset', '#goldenhour']);
    expect(kit.captions[0].text).toBe('Golden hour');
  });
});

describe('smoothPeople', () => {
  it('blends matched people and passes new ones through', () => {
    const a = buildFigure(getPose('solo-wave')!.figures[0], 0.75);
    const moved = { ...a, keypoints: a.keypoints.map((k) => ({ ...k, x: k.x + 0.02 })) };
    const [smoothed] = smoothPeople([a], [moved], 0.5);
    expect(smoothed.keypoints[5].x).toBeCloseTo(a.keypoints[5].x + 0.01);
    const far = { ...a, keypoints: a.keypoints.map((k) => ({ ...k, x: k.x + 0.4 })) };
    expect(smoothPeople([a], [far])[0]).toBe(far);
  });
});
