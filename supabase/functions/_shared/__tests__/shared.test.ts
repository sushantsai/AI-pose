import { catalogFor, sceneSystemPrompt, postKitUserText } from '../prompts.ts';
import { MAX_IMAGE_BASE64_CHARS, parseCoachRequest } from '../validate.ts';

const IMG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk';

describe('parseCoachRequest', () => {
  it('accepts a scene request', () => {
    const r = parseCoachRequest({ action: 'scene', image: IMG, people: 2, vibe: 'romantic' });
    expect(r).toEqual({ ok: true, request: { action: 'scene', image: IMG, people: 2, vibe: 'romantic' } });
  });

  it('strips data-URL prefixes', () => {
    const r = parseCoachRequest({ action: 'scene', image: `data:image/jpeg;base64,${IMG}`, people: 1 });
    expect(r.ok && r.request.image).toBe(IMG);
  });

  it('rejects bad input', () => {
    expect(parseCoachRequest(null).ok).toBe(false);
    expect(parseCoachRequest({ action: 'scene', image: IMG, people: 3 }).ok).toBe(false);
    expect(parseCoachRequest({ action: 'scene', image: 'not base64!!', people: 1 }).ok).toBe(false);
    expect(parseCoachRequest({ action: 'scene', image: 'A'.repeat(MAX_IMAGE_BASE64_CHARS + 4), people: 1 }).ok).toBe(false);
    expect(parseCoachRequest({ action: 'scene', image: IMG, people: 1, vibe: 'spooky' }).ok).toBe(false);
    expect(parseCoachRequest({ action: 'postkit', image: IMG, people: 1, platform: 'tiktok' }).ok).toBe(false);
    expect(parseCoachRequest({ action: 'delete', image: IMG, people: 1 }).ok).toBe(false);
  });

  it('accepts a postkit request', () => {
    const r = parseCoachRequest({ action: 'postkit', image: IMG, people: 1, platform: 'facebook', sceneSummary: 'Lake' });
    expect(r.ok && r.request.action === 'postkit' && r.request.platform).toBe('facebook');
  });
});

describe('prompts', () => {
  it('only lists poses for the right group size', () => {
    const solo = sceneSystemPrompt(1);
    expect(solo).toContain('solo-classic-hip');
    expect(solo).not.toContain('duo-twirl');
    expect(catalogFor(2).every((c) => c.people === 2)).toBe(true);
  });

  it('describes the post', () => {
    expect(postKitUserText({ platform: 'instagram', people: 2, sceneSummary: 'Beach', vibe: 'romantic' })).toBe(
      'Platform: Instagram. Photo of two people. Location: Beach. Vibe: romantic.',
    );
  });
});
