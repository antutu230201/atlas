import { afterEach, describe, expect, it, vi } from 'vitest';
import { MockAIProvider, OpenAICompatProvider } from '../src/ai';

const okResponse = () =>
  new Response(
    JSON.stringify({
      model: 'deepseek-v4.1-flash-1017',
      choices: [{ message: { content: '今天也保持节奏。' } }],
      usage: { prompt_tokens: 12, completion_tokens: 8 },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('OpenAICompatProvider', () => {
  it('isReady 随 apiKey 有无切换', () => {
    const ready = new OpenAICompatProvider({
      baseUrl: 'https://example.com/v1',
      apiKey: 'sk_test',
      model: 'm1',
    });
    const blank = new OpenAICompatProvider({
      baseUrl: 'https://example.com/v1',
      apiKey: '',
      model: 'm1',
    });
    expect(ready.isReady()).toBe(true);
    expect(blank.isReady()).toBe(false);
  });

  it('发送 system+user 消息并解析响应文本与用量', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    vi.stubGlobal('fetch', fetchMock);
    const provider = new OpenAICompatProvider({
      baseUrl: 'https://example.com/v1/',
      apiKey: 'sk_test',
      model: 'deepseek-v4.1-flash-1017',
      name: 'ai-test',
    });

    const result = await provider.complete({
      system: '你是成长助手',
      prompt: '总结今天',
      maxTokens: 128,
      temperature: 0.7,
    });

    expect(result).toEqual({
      text: '今天也保持节奏。',
      model: 'deepseek-v4.1-flash-1017',
      usage: { promptTokens: 12, completionTokens: 8 },
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://example.com/v1/chat/completions');
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe('deepseek-v4.1-flash-1017');
    expect(body.messages).toEqual([
      { role: 'system', content: '你是成长助手' },
      { role: 'user', content: '总结今天' },
    ]);
    expect(body.max_tokens).toBe(128);
    expect(body.stream).toBe(false);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk_test');
  });

  it('非 2xx 抛出带状态码与响应片段的中文错误', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{"error":"余额不足"}', { status: 402 })),
    );
    const provider = new OpenAICompatProvider({
      baseUrl: 'https://example.com/v1',
      apiKey: 'sk_test',
      model: 'm1',
    });
    await expect(provider.complete({ prompt: 'hi' })).rejects.toThrow(
      /AI 供应商返回 402：.*余额不足/s,
    );
  });

  it('请求超时抛出明确错误', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
            );
          }),
      ),
    );
    const provider = new OpenAICompatProvider({
      baseUrl: 'https://example.com/v1',
      apiKey: 'sk_test',
      model: 'm1',
      timeoutMs: 20,
    });
    await expect(provider.complete({ prompt: 'hi' })).rejects.toThrow('AI 请求超时（20ms）');
  });

  it('空内容与网络错误均有可读错误信息', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ choices: [{ message: { content: '' } }] }), {
          status: 200,
        }),
      ),
    );
    const provider = new OpenAICompatProvider({
      baseUrl: 'https://example.com/v1',
      apiKey: 'sk_test',
      model: 'm1',
    });
    await expect(provider.complete({ prompt: 'hi' })).rejects.toThrow('空内容');

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    await expect(provider.complete({ prompt: 'hi' })).rejects.toThrow('fetch failed');
  });
});

describe('MockAIProvider', () => {
  it('返回模板响应且用量为估算值', async () => {
    const provider = new MockAIProvider();
    const result = await provider.complete({ prompt: '测试提示词' });
    expect(result.model).toBe('mock-1');
    expect(result.text).toContain('[MockAI]');
    expect(result.usage.promptTokens).toBeGreaterThan(0);
  });
});
