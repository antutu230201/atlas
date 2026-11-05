import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiFetch, createTestApp, login, register, type TestApp } from './app-fixture';

/**
 * AI 配置界面化集成测试：本地起一个 OpenAI 兼容 mock 服务器作为"真实供应商"，
 * 全链路验证 GET/PUT /ai/config、热切换（chat 立即走新供应商）、测试连接、
 * key 掩码不泄露、清除回落 env/Mock。
 */

let app: TestApp;
let cookie: string;
let upstream: Server;
let upstreamHits: number;
const upstreamUrl = async (): Promise<string> =>
  new Promise((resolve) => {
    const addr = upstream.address();
    resolve(`http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}/v1`);
  });

const call = (action: 'config' | 'config/test', method: 'GET' | 'PUT' | 'POST', body?: unknown) =>
  apiFetch(app.url, `/ai/${action}`, { method, cookie, body });

beforeAll(async () => {
  app = await createTestApp();
  await register(app.url, 'ai-config@example.com', 'AI 配置员');
  cookie = (await login(app.url, 'ai-config@example.com')).cookie!;

  // OpenAI 兼容上游：/v1/chat/completions 返回固定内容
  upstreamHits = 0;
  upstream = createServer((req, res) => {
    if ((req.url ?? '').endsWith('/chat/completions')) {
      upstreamHits += 1;
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        const auth = req.headers.authorization ?? '';
        if (!auth.startsWith('Bearer sk_good')) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'invalid api key' } }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            model: 'test-model-x',
            choices: [{ message: { content: '连接成功' } }],
            usage: { prompt_tokens: 5, completion_tokens: 4 },
          }),
        );
      });
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
});

afterAll(async () => {
  await new Promise<void>((resolve) => upstream.close(() => resolve()));
  await app.close();
});

describe('AI 配置界面化', () => {
  it('初始视图：无库配置无 env key → mock 来源，无掩码', async () => {
    const view = (await call('config', 'GET')).body.data as {
      source: string;
      hasKey: boolean;
    };
    // fixture 进程不带 AI_API_KEY（env.spec 有默认值空串）
    expect(view.source).toBe('mock');
    expect(view.hasKey).toBe(false);
  });

  it('测试连接：错误 key 返回上游错误；正确 key 返回 ok 与样例', async () => {
    const baseUrl = await upstreamUrl();
    const bad = (
      await call('config/test', 'POST', { baseUrl, model: 'test-model-x', apiKey: 'sk_bad' })
    ).body.data as { ok: boolean; error?: string };
    expect(bad.ok).toBe(false);
    expect(bad.error).toContain('401');

    const good = (
      await call('config/test', 'POST', { baseUrl, model: 'test-model-x', apiKey: 'sk_good' })
    ).body.data as { ok: boolean; model?: string; sample?: string };
    expect(good.ok).toBe(true);
    expect(good.model).toBe('test-model-x');
  });

  it('保存后热切换：chat 立即走新供应商，GET 回掩码不含明文', async () => {
    const baseUrl = await upstreamUrl();
    const saved = await call('config', 'PUT', {
      baseUrl,
      model: 'test-model-x',
      apiKey: 'sk_good_secret_key',
      timeoutMs: 10000,
    });
    expect(saved.status).toBe(200);
    const view = saved.body.data as { source: string; hasKey: boolean; keyMasked: string | null };
    expect(view.source).toBe('db');
    expect(view.hasKey).toBe(true);
    expect(view.keyMasked).toContain('***');
    expect(view.keyMasked).not.toContain('sk_good_secret_key');

    const chat = await apiFetch(app.url, '/ai/chat', {
      method: 'POST',
      cookie,
      body: { message: '你好' },
    });
    expect(chat.status).toBe(200);
    expect((chat.body.data as { text: string }).text).toBe('连接成功');
    expect(upstreamHits).toBeGreaterThanOrEqual(1);
  });

  it('apiKey 留空保持不变；显式清除后回落 mock，chat 不再打到上游', async () => {
    const baseUrl = await upstreamUrl();
    const keep = (await call('config', 'PUT', { baseUrl, model: 'test-model-x' })).body.data as {
      hasKey: boolean;
      source: string;
    };
    expect(keep.hasKey).toBe(true);
    expect(keep.source).toBe('db');

    const hitsBefore = upstreamHits;
    const cleared = (await call('config', 'PUT', { apiKey: null })).body.data as {
      source: string;
      hasKey: boolean;
    };
    expect(cleared.source).toBe('mock');
    expect(cleared.hasKey).toBe(false);

    const chat = await apiFetch(app.url, '/ai/chat', {
      method: 'POST',
      cookie,
      body: { message: '你好' },
    });
    expect(chat.status).toBe(200);
    // Mock 供应商文案
    expect((chat.body.data as { text: string }).text).toContain('[MockAI]');
    expect(upstreamHits).toBe(hitsBefore);
  });

  it('非法表单被拒（base URL 非法 / 模型名为空）', async () => {
    const badUrl = await call('config', 'PUT', { baseUrl: 'not-a-url' });
    expect(badUrl.status).toBe(200);
    expect(badUrl.body.error).toBe('atlas.ai.invalid-config');
    const badModel = await call('config', 'PUT', { model: '' });
    expect(badModel.body.error).toBe('atlas.ai.invalid-config');
  });
});
