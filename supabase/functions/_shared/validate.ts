import { VIBES, type CoachRequest, type Vibe } from './contract.ts';

/** ~512 px JPEGs are 30–80 KB; anything far larger is a client bug or abuse. */
export const MAX_IMAGE_BASE64_CHARS = 600_000;

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

export type Parsed = { ok: true; request: CoachRequest } | { ok: false; error: string };

function parseVibe(v: unknown): Vibe | null | undefined {
  if (v == null) return null;
  return (VIBES as readonly string[]).includes(v as string) ? (v as Vibe) : undefined;
}

function parseImage(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const data = v.startsWith('data:') ? v.slice(v.indexOf(',') + 1) : v;
  if (data.length === 0 || data.length > MAX_IMAGE_BASE64_CHARS) return null;
  // Checking a prefix keeps validation cheap on large strings.
  return BASE64.test(data.slice(0, 2048).replace(/=+$/, '')) ? data : null;
}

export function parseCoachRequest(body: unknown): Parsed {
  if (typeof body !== 'object' || body == null) return { ok: false, error: 'Body must be a JSON object' };
  const b = body as Record<string, unknown>;
  const image = parseImage(b.image);
  if (!image) return { ok: false, error: 'image must be a base64 JPEG under 450 KB' };
  const people = b.people === 2 ? 2 : b.people === 1 ? 1 : null;
  if (!people) return { ok: false, error: 'people must be 1 or 2' };
  const vibe = parseVibe(b.vibe);
  if (vibe === undefined) return { ok: false, error: 'unknown vibe' };

  if (b.action === 'scene') {
    return { ok: true, request: { action: 'scene', image, people, vibe } };
  }
  if (b.action === 'postkit') {
    const platform = b.platform === 'facebook' ? 'facebook' : b.platform === 'instagram' ? 'instagram' : null;
    if (!platform) return { ok: false, error: 'platform must be instagram or facebook' };
    const sceneSummary = typeof b.sceneSummary === 'string' ? b.sceneSummary.slice(0, 160) : null;
    return { ok: true, request: { action: 'postkit', image, people, vibe, platform, sceneSummary } };
  }
  return { ok: false, error: 'action must be scene or postkit' };
}
