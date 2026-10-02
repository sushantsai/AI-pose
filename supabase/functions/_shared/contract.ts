/**
 * Shared contract between the mobile app and the `coach` edge function.
 * Plain TypeScript with no runtime imports, so both Deno and Metro can use it.
 */

export const SCENES = [
  'beach',
  'mountain',
  'city',
  'cafe',
  'park',
  'home',
  'landmark',
  'wall',
  'stairs',
  'water',
  'sunset',
  'event',
  'gym',
  'office',
  'snow',
  'night',
] as const;
export type Scene = (typeof SCENES)[number];

export const VIBES = [
  'casual',
  'confident',
  'candid',
  'elegant',
  'playful',
  'romantic',
  'adventurous',
  'professional',
] as const;
export type Vibe = (typeof VIBES)[number];

export type Platform = 'instagram' | 'facebook';

/* ----------------------------- Requests ---------------------------------- */

export interface SceneRequest {
  action: 'scene';
  /** Base64 JPEG, already downscaled on device (~512 px long edge). */
  image: string;
  people: 1 | 2;
  vibe?: Vibe | null;
}

export interface PostKitRequest {
  action: 'postkit';
  /** Base64 JPEG of the chosen photo (~512 px long edge). */
  image: string;
  platform: Platform;
  people: 1 | 2;
  sceneSummary?: string | null;
  vibe?: Vibe | null;
}

export type CoachRequest = SceneRequest | PostKitRequest;

/* ----------------------------- Responses --------------------------------- */

export interface PoseRecommendation {
  poseId: string;
  /** One sentence: why this pose suits this scene. */
  why: string;
  /** Where to stand / how to use the scene, e.g. "Stand by the railing on the left". */
  placement: string;
}

export interface SceneAnalysis {
  scene: {
    type: Scene;
    /** Short description, e.g. "Sunset beach with warm backlight". */
    summary: string;
    /** Where the light comes from and how to use it. */
    lighting: string;
  };
  recommendations: PoseRecommendation[];
  photographerTips: string[];
  framing: {
    orientation: 'portrait' | 'landscape';
    cameraHeight: 'eye' | 'low' | 'high';
  };
}

export interface PostKit {
  captions: Array<{ style: 'short' | 'witty' | 'aesthetic'; text: string }>;
  hashtags: string[];
  altText: string;
  /** One practical posting tip for the platform. */
  tip: string;
}

export type CoachResponse<T> = { ok: true; data: T; remaining?: number } | { ok: false; error: string; code?: string };

/* --------------------------- JSON schemas -------------------------------- */
// Used with structured outputs. No numeric/length constraints (unsupported);
// counts are enforced by the prompt and by `sanitize*` below.

export const SCENE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['scene', 'recommendations', 'photographerTips', 'framing'],
  properties: {
    scene: {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'summary', 'lighting'],
      properties: {
        type: { type: 'string', enum: [...SCENES] },
        summary: { type: 'string' },
        lighting: { type: 'string' },
      },
    },
    recommendations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['poseId', 'why', 'placement'],
        properties: {
          poseId: { type: 'string' },
          why: { type: 'string' },
          placement: { type: 'string' },
        },
      },
    },
    photographerTips: { type: 'array', items: { type: 'string' } },
    framing: {
      type: 'object',
      additionalProperties: false,
      required: ['orientation', 'cameraHeight'],
      properties: {
        orientation: { type: 'string', enum: ['portrait', 'landscape'] },
        cameraHeight: { type: 'string', enum: ['eye', 'low', 'high'] },
      },
    },
  },
} as const;

export const POSTKIT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['captions', 'hashtags', 'altText', 'tip'],
  properties: {
    captions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['style', 'text'],
        properties: {
          style: { type: 'string', enum: ['short', 'witty', 'aesthetic'] },
          text: { type: 'string' },
        },
      },
    },
    hashtags: { type: 'array', items: { type: 'string' } },
    altText: { type: 'string' },
    tip: { type: 'string' },
  },
} as const;

/* ---------------------------- Sanitizers --------------------------------- */

const clip = (s: unknown, max: number): string => (typeof s === 'string' ? s.trim().slice(0, max) : '');

/**
 * Keep only recommendations for poses that exist and fit the group size,
 * de-duplicated, at most `max`. Never trust model output blindly.
 */
export function sanitizeSceneAnalysis(
  raw: SceneAnalysis,
  validPoseIds: ReadonlySet<string>,
  max = 4,
): SceneAnalysis {
  const seen = new Set<string>();
  const recommendations: PoseRecommendation[] = [];
  for (const r of raw.recommendations ?? []) {
    if (!validPoseIds.has(r.poseId) || seen.has(r.poseId)) continue;
    seen.add(r.poseId);
    recommendations.push({ poseId: r.poseId, why: clip(r.why, 200), placement: clip(r.placement, 200) });
    if (recommendations.length >= max) break;
  }
  const type = (SCENES as readonly string[]).includes(raw.scene?.type) ? raw.scene.type : 'city';
  return {
    scene: { type, summary: clip(raw.scene?.summary, 160), lighting: clip(raw.scene?.lighting, 200) },
    recommendations,
    photographerTips: (raw.photographerTips ?? []).map((t) => clip(t, 200)).filter(Boolean).slice(0, 3),
    framing: {
      orientation: raw.framing?.orientation === 'landscape' ? 'landscape' : 'portrait',
      cameraHeight: ['eye', 'low', 'high'].includes(raw.framing?.cameraHeight) ? raw.framing.cameraHeight : 'eye',
    },
  };
}

export function sanitizePostKit(raw: PostKit): PostKit {
  const hashtags = Array.from(
    new Set(
      (raw.hashtags ?? [])
        .map((h) => clip(h, 40).replace(/\s+/g, ''))
        .filter(Boolean)
        .map((h) => (h.startsWith('#') ? h : `#${h}`)),
    ),
  ).slice(0, 15);
  return {
    captions: (raw.captions ?? [])
      .filter((c) => ['short', 'witty', 'aesthetic'].includes(c.style))
      .map((c) => ({ style: c.style, text: clip(c.text, 300) }))
      .filter((c) => c.text)
      .slice(0, 3),
    hashtags,
    altText: clip(raw.altText, 300),
    tip: clip(raw.tip, 240),
  };
}
