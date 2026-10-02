// Supabase Edge Function: AI scene analysis and post captions.
// Default model: Claude Haiku 4.5. Any OpenAI-compatible provider (e.g. OpenRouter)
// can be used instead by setting secrets; see _shared/llm.ts and the README.
// Deploy: supabase functions deploy coach
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
import { describeConfig, extractJson, openAiCompatibleJson, ProviderError, readProviderConfig, type ProviderConfig } from '../_shared/llm.ts';
import { parseCoachRequest } from '../_shared/validate.ts';

const DAILY_LIMIT: Record<CoachRequest['action'], number> = {
  scene: Number(Deno.env.get('DAILY_SCENE_LIMIT') ?? 40),
  postkit: Number(Deno.env.get('DAILY_POSTKIT_LIMIT') ?? 40),
};

const provider: ProviderConfig = readProviderConfig((name) => Deno.env.get(name));
console.log(`coach ready: ${describeConfig(provider)}`);

let anthropic: Anthropic | null = null;

/** Created lazily so a missing key returns a clear error instead of crashing the function on boot. */
function getAnthropic(): Anthropic {
  if (anthropic) return anthropic;
  if (!provider.apiKey) throw new CoachError(503, 'not_configured', 'The AI coach is not configured yet.');
  anthropic = new Anthropic({ apiKey: provider.apiKey, ...(provider.baseUrl ? { baseURL: provider.baseUrl } : {}) });
  return anthropic;
}

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

  // Per-user daily quota. Verify who is calling from their JWT, then spend
  // quota with the service role; users cannot call the quota function themselves.
  const url = Deno.env.get('SUPABASE_URL')!;
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: auth, error: authError } = await admin.auth.getUser(jwt);
  if (authError || !auth.user) return json(401, { ok: false, code: 'unauthorized', error: 'Sign in required' });

  const { data: remaining, error: quotaError } = await admin.rpc('consume_coach_quota', {
    p_user: auth.user.id,
    p_action: request.action,
    p_limit: DAILY_LIMIT[request.action],
  });
  if (quotaError) {
    if (quotaError.message.includes('quota_exceeded')) {
      return json(429, { ok: false, code: 'quota_exceeded', error: 'Daily AI limit reached. Offline suggestions still work.' });
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

async function callModel(
  system: string,
  image: string,
  text: string,
  schemaName: string,
  schema: { [key: string]: unknown },
  maxTokens: number,
): Promise<unknown> {
  if (provider.kind === 'openai') {
    return openAiCompatibleJson(provider, { system, text, image, schemaName, schema, maxTokens }, fetch, (m) => console.error(m));
  }
  const content = [
    { type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: image } },
    { type: 'text' as const, text },
  ];
  let response: Anthropic.Message;
  let strict = true;
  try {
    response = await getAnthropic().messages.create({
      model: provider.model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content }],
      output_config: { format: { type: 'json_schema', schema } },
    });
  } catch (err) {
    // Some Anthropic-compatible gateways do not support structured outputs:
    // retry once with the schema in the prompt instead.
    if (!(err instanceof Anthropic.BadRequestError)) throw err;
    console.error(`structured output rejected: ${err.message}; retrying with prompt-only JSON`);
    strict = false;
    response = await getAnthropic().messages.create({
      model: provider.model,
      max_tokens: maxTokens,
      system: `${system}\n\nRespond with only a JSON object (no prose, no code fences) that matches this JSON Schema:\n${JSON.stringify(schema)}`,
      messages: [{ role: 'user', content }],
    });
  }
  if (response.stop_reason === 'refusal') throw new CoachError(422, 'refused', 'The AI could not help with this image.');
  if (response.stop_reason === 'max_tokens') throw new CoachError(502, 'truncated', 'The AI response was cut off. Please try again.');
  const block = response.content.find((b) => b.type === 'text');
  if (!block || block.type !== 'text') throw new CoachError(502, 'empty', 'Empty AI response');
  console.log(JSON.stringify({ model: provider.model, strict, usage: response.usage }));
  return strict ? JSON.parse(block.text) : extractJson(block.text);
}

async function analyzeScene(request: Extract<CoachRequest, { action: 'scene' }>): Promise<SceneAnalysis> {
  const raw = (await callModel(
    sceneSystemPrompt(request.people),
    request.image,
    sceneUserText(request.vibe),
    'scene_analysis',
    SCENE_SCHEMA,
    1200,
  )) as SceneAnalysis;
  const valid = new Set(catalogFor(request.people).map((c) => c.id));
  return sanitizeSceneAnalysis(raw, valid);
}

async function writePostKit(request: Extract<CoachRequest, { action: 'postkit' }>): Promise<PostKit> {
  const raw = (await callModel(
    postKitSystemPrompt(),
    request.image,
    postKitUserText(request),
    'post_kit',
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
  if (err instanceof ProviderError) {
    if (err.code === 'auth') console.error(`AI provider auth failed: ${describeConfig(provider)}`);
    return json(err.status, { ok: false, code: err.code, error: err.message });
  }
  if (err instanceof Anthropic.RateLimitError) {
    return json(503, { ok: false, code: 'busy', error: 'The AI is busy. Please try again in a moment.' });
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return json(503, { ok: false, code: 'unreachable', error: 'Could not reach the AI service.' });
  }
  if (err instanceof Anthropic.AuthenticationError) {
    // Logs only the key type and length, never the key itself.
    console.error(`AI provider auth failed: ${describeConfig(provider)}`);
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
