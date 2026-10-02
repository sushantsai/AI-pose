import { describeConfig, extractJson, openAiCompatibleJson, ProviderError, readProviderConfig, type ProviderConfig } from '../llm.ts';

const env = (vars: Record<string, string>) => (name: string) => vars[name];

describe('readProviderConfig', () => {
  it('defaults to Anthropic Haiku with the legacy key', () => {
    const c = readProviderConfig(env({ ANTHROPIC_API_KEY: ' "sk-ant-api03-abc" \n' }));
    expect(c).toEqual({ kind: 'anthropic', baseUrl: null, apiKey: 'sk-ant-api03-abc', model: 'claude-haiku-4-5' });
  });

  it('supports OpenRouter via a shortcut', () => {
    const c = readProviderConfig(env({ AI_PROVIDER: 'openrouter', AI_API_KEY: 'sk-or-v1-x', AI_MODEL: 'google/gemini-2.5-flash' }));
    expect(c).toEqual({ kind: 'openai', baseUrl: 'https://openrouter.ai/api/v1', apiKey: 'sk-or-v1-x', model: 'google/gemini-2.5-flash' });
  });

  it('supports any OpenAI-compatible base URL', () => {
    const c = readProviderConfig(env({ AI_PROVIDER: 'openai', AI_BASE_URL: 'https://api.example.com/v1/', AI_API_KEY: 'k', AI_MODEL: 'm' }));
    expect(c.baseUrl).toBe('https://api.example.com/v1');
    expect(c.kind).toBe('openai');
  });

  it('never prints the key', () => {
    const d = describeConfig({ kind: 'openai', baseUrl: null, apiKey: 'sk-or-v1-supersecretvalue', model: 'm' });
    expect(d).not.toContain('supersecret');
    expect(d).toContain('25 chars');
  });
});

describe('extractJson', () => {
  it('handles fences and chatter', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Sure! {"a":2} hope that helps')).toEqual({ a: 2 });
    expect(() => extractJson('no json here')).toThrow(ProviderError);
  });
});

describe('openAiCompatibleJson', () => {
  const config: ProviderConfig = { kind: 'openai', baseUrl: 'https://openrouter.ai/api/v1', apiKey: 'sk-or', model: 'google/gemini-2.5-flash' };
  const req = { system: 'sys', text: 'pick poses', image: 'QUJD', schemaName: 'scene', schema: { type: 'object' }, maxTokens: 500 };
  const reply = (status: number, body: unknown) => ({ ok: status < 300, status, text: async () => JSON.stringify(body) });

  it('sends an image + strict JSON schema and parses the answer', async () => {
    const calls: { url: string; body: any; headers: Record<string, string> }[] = [];
    const fetchImpl = async (url: string, init: { headers: Record<string, string>; body: string }) => {
      calls.push({ url, body: JSON.parse(init.body), headers: init.headers });
      return reply(200, { choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }] });
    };
    await expect(openAiCompatibleJson(config, req, fetchImpl as any)).resolves.toEqual({ ok: true });
    expect(calls[0].url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(calls[0].headers.Authorization).toBe('Bearer sk-or');
    expect(calls[0].body.model).toBe('google/gemini-2.5-flash');
    expect(calls[0].body.response_format.type).toBe('json_schema');
    expect(calls[0].body.messages[1].content[1].image_url.url).toBe('data:image/jpeg;base64,QUJD');
  });

  it('retries without response_format when the model rejects it', async () => {
    const bodies: any[] = [];
    const fetchImpl = async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body);
      bodies.push(body);
      return body.response_format
        ? reply(400, { error: { message: 'response_format not supported' } })
        : reply(200, { choices: [{ message: { content: '```json\n{"ok":2}\n```' } }] });
    };
    await expect(openAiCompatibleJson(config, req, fetchImpl as any)).resolves.toEqual({ ok: 2 });
    expect(bodies).toHaveLength(2);
    expect(bodies[1].messages[0].content).toContain('JSON Schema');
  });

  it('maps provider errors', async () => {
    const f = (status: number) => (async () => reply(status, { error: { message: 'nope' } })) as any;
    await expect(openAiCompatibleJson(config, req, f(401))).rejects.toMatchObject({ code: 'auth' });
    await expect(openAiCompatibleJson(config, req, f(429))).rejects.toMatchObject({ code: 'rate_limited' });
    await expect(openAiCompatibleJson(config, req, f(402))).rejects.toMatchObject({ code: 'upstream' });
    await expect(openAiCompatibleJson({ ...config, model: '' }, req, f(200))).rejects.toMatchObject({ code: 'not_configured' });
  });
});
