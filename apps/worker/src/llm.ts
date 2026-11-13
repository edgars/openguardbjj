import { config } from './config.ts';

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

export const llmEnabled = () => !!config.llm.baseUrl;

/**
 * Chamada única a um endpoint compatível com OpenAI (/chat/completions) pedindo JSON.
 * Planos grátis (Groq) limitam por minuto: em 429 espera o retry-after (≤ 30 s) e tenta uma vez.
 */
export async function chatJson<T>(messages: ChatMessage[], opts: { maxTokens?: number; signal?: AbortSignal } = {}): Promise<T> {
  if (!config.llm.baseUrl) throw new Error('LLM não configurado (LLM_BASE_URL).');
  const payload: Record<string, unknown> = {
    model: config.llm.model,
    temperature: 0,
    max_tokens: opts.maxTokens ?? 2000,
    response_format: { type: 'json_object' },
    messages,
  };
  // Modelos de raciocínio (gpt-oss) gastam menos tokens/tempo com esforço baixo.
  if (/gpt-oss/i.test(config.llm.model)) payload.reasoning_effort = 'low';

  const timeout = AbortSignal.timeout(config.llm.timeoutMs);
  const call = () =>
    fetch(`${config.llm.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout,
      headers: {
        'content-type': 'application/json',
        ...(config.llm.apiKey ? { authorization: `Bearer ${config.llm.apiKey}` } : {}),
      },
      body: JSON.stringify(payload),
    });

  let resp = await call();
  if (resp.status === 429) {
    const wait = Math.min(30, Number(resp.headers.get('retry-after')) || 10);
    await resp.body?.cancel();
    await new Promise((r) => setTimeout(r, wait * 1000));
    resp = await call();
  }
  if (!resp.ok) throw new Error(`LLM HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const body = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = body.choices?.[0]?.message?.content ?? '{}';
  return JSON.parse(content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1) || '{}') as T;
}
