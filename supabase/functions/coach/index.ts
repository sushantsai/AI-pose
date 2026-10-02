// Supabase Edge Function: AI scene analysis and post captions via Claude Haiku 4.5.
// Deploy: supabase functions deploy coach
// Secrets: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
import Anthropic from 'npm:@anthropic-ai/sdk@0.131.0';
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import {
  POSTKIT_SCHEMA,
  SCENE_SCHEMA,
  sanitizePostKit,
  sanitizeSceneAnalysis,
  type CoachRequest,
  type PostKit,
  type SceneAnalysis,
} from '../_shared/contract.ts';
import { catalogFor, postKitSystemPrompt, postKitUserText, sceneSystemPrompt, sceneUserText } from '../_shared/prompts.ts';
import { parseCoachRequest } from '../_shared/validate.ts';

const MODEL = Deno.env.get('COACH_MODEL') ?? 'claude-haiku-4-5';
const DAILY_LIMIT: Record<CoachRequest['action'], number> = {
  scene: Number(Deno.env.get('DAILY_SCENE_LIMIT') ?? 40),
  postkit: Number(Deno.env.get('DAILY_POSTKIT_LIMIT') ?? 40),
};

const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { ok: false, error: 'POST only' });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: 'Invalid JSON' });
  }
  const parsed = parseCoachRequest(body);
  if (!parsed.ok) return json(400, { ok: false, error: parsed.error });
  const request = parsed.request;

  // Per-user daily quota. The function runs with the caller's JWT, so the
  // database function can read auth.uid() and nobody can spend someone else's quota.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
  );
  const { data: remaining, error: quotaError } = await supabase.rpc('consume_coach_quota', {
    p_action: request.action,
    p_limit: DAILY_LIMIT[request.action],
  });
  if (quotaError) {
    if (quotaError.message.includes('quota_exceeded')) {
      return json(429, { ok: false, code: 'quota_exceeded', error: 'Daily AI limit reached. Offline suggestions still work.' });
    }
    if (quotaError.message.includes('not_authenticated')) {
      return json(401, { ok: false, code: 'unauthorized', error: 'Sign in required' });
    }
    console.error('quota', quotaError);
    return json(500, { ok: false, error: 'Quota check failed' });
  }

  try {
    const data = request.action === 'scene' ? await analyzeScene(request) : await writePostKit(request);
    return json(200, { ok: true, data, remaining });
  } catch (err) {
    return handleError(err);
  }
});

async function callClaude(
  system: string,
  image: string,
  text: string,
  schema: { [key: string]: unknown },
  maxTokens: number,
) {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
          { type: 'text', text },
        ],
      },
    ],
    output_config: { format: { type: 'json_schema', schema } },
  });
  if (response.stop_reason === 'refusal') throw new CoachError(422, 'refused', 'The AI could not help with this image.');
  if (response.stop_reason === 'max_tokens') throw new CoachError(502, 'truncated', 'The AI response was cut off. Please try again.');
  const block = response.content.find((b) => b.type === 'text');
  if (!block || block.type !== 'text') throw new CoachError(502, 'empty', 'Empty AI response');
  console.log(JSON.stringify({ model: MODEL, usage: response.usage }));
  return JSON.parse(block.text);
}

async function analyzeScene(request: Extract<CoachRequest, { action: 'scene' }>): Promise<SceneAnalysis> {
  const raw = (await callClaude(
    sceneSystemPrompt(request.people),
    request.image,
    sceneUserText(request.vibe),
    SCENE_SCHEMA,
    1200,
  )) as SceneAnalysis;
  const valid = new Set(catalogFor(request.people).map((c) => c.id));
  return sanitizeSceneAnalysis(raw, valid);
}

async function writePostKit(request: Extract<CoachRequest, { action: 'postkit' }>): Promise<PostKit> {
  const raw = (await callClaude(
    postKitSystemPrompt(),
    request.image,
    postKitUserText(request),
    POSTKIT_SCHEMA,
    900,
  )) as PostKit;
  return sanitizePostKit(raw);
}

class CoachError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function handleError(err: unknown): Response {
  if (err instanceof CoachError) return json(err.status, { ok: false, code: err.code, error: err.message });
  if (err instanceof Anthropic.RateLimitError) {
    return json(503, { ok: false, code: 'busy', error: 'The AI is busy. Please try again in a moment.' });
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return json(503, { ok: false, code: 'unreachable', error: 'Could not reach the AI service.' });
  }
  if (err instanceof Anthropic.APIError) {
    console.error('anthropic', err.status, err.message);
    return json(502, { ok: false, code: 'upstream', error: 'The AI service returned an error.' });
  }
  if (err instanceof SyntaxError) {
    return json(502, { ok: false, code: 'bad_output', error: 'The AI returned an unexpected format.' });
  }
  console.error(err);
  return json(500, { ok: false, error: 'Unexpected error' });
}
