/**
 * Provider configuration and the OpenAI-compatible client used for
 * "bring your own model" (OpenRouter, OpenAI, Groq, Together, a local
 * gateway, ...). Plain fetch so it runs in Deno and in Jest.
 *
 * Supabase secrets:
 *   AI_PROVIDER   "anthropic" (default) or "openai" (any OpenAI-compatible API)
 *   AI_BASE_URL   e.g. https://openrouter.ai/api/v1  (optional for anthropic)
 *   AI_API_KEY    key for that provider (anthropic falls back to ANTHROPIC_API_KEY)
 *   AI_MODEL      model id, e.g. "google/gemini-2.5-flash" on OpenRouter
 *                 (falls back to COACH_MODEL, then claude-haiku-4-5 for anthropic)
 */

export type ProviderKind = 'anthropic' | 'openai';

export interface ProviderConfig {
  kind: ProviderKind;
  baseUrl: string | null;
  apiKey: string;
  model: string;
}

export interface VisionJsonRequest {
  system: string;
  text: string;
  /** Base64 JPEG. */
  image: string;
  schemaName: string;
  schema: { [key: string]: unknown };
  maxTokens: number;
}

export class ProviderError extends Error {
  constructor(
    readonly status: number,
    readonly code: 'not_configured' | 'auth' | 'rate_limited' | 'unreachable' | 'upstream' | 'bad_output' | 'refused',
    message: string,
  ) {
    super(message);
  }
}

/** Pasted secrets often carry whitespace or quotes; strip them. */
export function cleanSecret(value: string | undefined | null): string {
  return (value ?? '').trim().replace(/^["']|["']$/g, '').trim();
}

export function readProviderConfig(env: (name: string) => string | undefined): ProviderConfig {
  const raw = cleanSecret(env('AI_PROVIDER')).toLowerCase();
  const kind: ProviderKind = raw === 'openai' || raw === 'openai-compatible' || raw === 'openrouter' ? 'openai' : 'anthropic';
  const baseUrl = cleanSecret(env('AI_BASE_URL')) || (raw === 'openrouter' ? 'https://openrouter.ai/api/v1' : '') || null;
  const apiKey = cleanSecret(env('AI_API_KEY')) || (kind === 'anthropic' ? cleanSecret(env('ANTHROPIC_API_KEY')) : '');
  const model = cleanSecret(env('AI_MODEL')) || cleanSecret(env('COACH_MODEL')) || (kind === 'anthropic' ? 'claude-haiku-4-5' : '');
  return { kind, baseUrl: baseUrl ? baseUrl.replace(/\/+$/, '') : null, apiKey, model };
}

/** Describe a config for logs without leaking the key. */
export function describeConfig(c: ProviderConfig): string {
  const keyType = c.apiKey ? `${c.apiKey.split('-').slice(0, 3).join('-').slice(0, 14)}… (${c.apiKey.length} chars)` : 'missing';
  return `provider=${c.kind} model=${c.model || 'missing'} base=${c.baseUrl ?? 'default'} key=${keyType}`;
}

/** Pull a JSON object out of model text, tolerating ```json fences and chatter. */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : text).trim();
  try {
    return JSON.parse(body);
  } catch {
    const start = body.indexOf('{');
    const end = body.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(body.slice(start, end + 1));
    throw new ProviderError(502, 'bad_output', 'The AI returned an unexpected format.');
  }
}

type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

function messageFromBody(body: string): string {
  try {
    const parsed = JSON.parse(body);
    return String(parsed?.error?.message ?? parsed?.message ?? body).slice(0, 300);
  } catch {
    return body.slice(0, 300);
  }
}

/**
 * Call an OpenAI-compatible /chat/completions endpoint with an image and get
 * JSON back. Tries strict JSON-schema output first; if the model or gateway
 * rejects `response_format`, retries asking for JSON in the prompt instead.
 */
export async function openAiCompatibleJson(
  config: ProviderConfig,
  req: VisionJsonRequest,
  fetchImpl: Fetch,
  log: (msg: string) => void = () => {},
): Promise<unknown> {
  if (!config.baseUrl) throw new ProviderError(503, 'not_configured', 'AI_BASE_URL is not set.');
  if (!config.apiKey) throw new ProviderError(503, 'not_configured', 'AI_API_KEY is not set.');
  if (!config.model) throw new ProviderError(503, 'not_configured', 'AI_MODEL is not set.');

  const userContent = [
    { type: 'text', text: req.text },
    { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${req.image}` } },
  ];
  const attempt = async (strict: boolean) => {
    const system = strict
      ? req.system
      : `${req.system}\n\nRespond with only a JSON object (no prose, no code fences) that matches this JSON Schema:\n${JSON.stringify(req.schema)}`;
    const body: Record<string, unknown> = {
      model: config.model,
      max_tokens: req.maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userContent },
      ],
    };
    if (strict) body.response_format = { type: 'json_schema', json_schema: { name: req.schemaName, strict: true, schema: req.schema } };
    try {
      return await fetchImpl(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
          // Optional attribution headers used by OpenRouter; ignored elsewhere.
          'HTTP-Referer': 'https://posecoach.app',
          'X-Title': 'PoseCoach',
        },
        body: JSON.stringify(body),
      });
    } catch {
      throw new ProviderError(503, 'unreachable', 'Could not reach the AI provider.');
    }
  };

  let res = await attempt(true);
  let text = await res.text();
  if (!res.ok && (res.status === 400 || res.status === 422)) {
    log(`structured output rejected (${res.status}): ${messageFromBody(text)}; retrying with prompt-only JSON`);
    res = await attempt(false);
    text = await res.text();
  }
  if (!res.ok) {
    const msg = messageFromBody(text);
    log(`provider error ${res.status}: ${msg}`);
    if (res.status === 401 || res.status === 403) throw new ProviderError(502, 'auth', 'The AI provider rejected the API key.');
    if (res.status === 429) throw new ProviderError(503, 'rate_limited', 'The AI is busy. Please try again in a moment.');
    if (res.status === 402) throw new ProviderError(502, 'upstream', 'The AI provider account is out of credit.');
    throw new ProviderError(502, 'upstream', 'The AI provider returned an error.');
  }

  let parsed: { choices?: { message?: { content?: unknown; refusal?: string | null }; finish_reason?: string }[] };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ProviderError(502, 'bad_output', 'The AI returned an unexpected format.');
  }
  const choice = parsed.choices?.[0];
  if (choice?.message?.refusal) throw new ProviderError(422, 'refused', 'The AI could not help with this image.');
  if (choice?.finish_reason === 'length') throw new ProviderError(502, 'bad_output', 'The AI response was cut off. Please try again.');
  const content = choice?.message?.content;
  const asText = typeof content === 'string' ? content : Array.isArray(content) ? content.map((p) => p?.text ?? '').join('') : '';
  if (!asText) throw new ProviderError(502, 'bad_output', 'Empty AI response');
  return extractJson(asText);
}
