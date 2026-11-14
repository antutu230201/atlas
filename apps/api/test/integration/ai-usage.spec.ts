import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiFetch, createTestApp, login, register, type TestApp } from './app-fixture';

/**
 * AI 用量可见化（GET /v1/ai/usage）：模块调用（ctx.ai.complete）写入 ai_usage 后，
 * 端点按用户聚合返回当月次数与 token 总量；未调用时返回零值。
 * 上游为本地 OpenAI 兼容 mock（固定 usage: prompt 5 + completion 4）。
 */

let app: TestApp;
let cookie: string;
let upstream: Server;

const upstreamUrl = async (): Promise<string> =>
  new Promise((resolve) => {
    const addr = upstream.address();
    resolve(`http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}/v1`);
  });

const usage = async () =>
  (await apiFetch(app.url, '/ai/usage', { method: 'GET', cookie })).body.data as {
    month: string;
    calls: number;
    promptTokens: number;
    completionTokens: number;
    byModule: Array<{ moduleName: string; calls: number; tokens: number }>;
  };

beforeAll(async () => {
  app = await createTestApp();
  await register(app.url, 'ai-usage@example.com', '用量验收');
  cookie = (await login(app.url, 'ai-usage@example.com')).cookie!;

  upstream = createServer((req, res) => {
    if ((req.url ?? '').endsWith('/chat/completions')) {
      req.on('data', () => undefined);
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
            choices: [{ message: { content: 'AI 小结 OK' } }],
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
  // 清除 db AI 配置回落 mock，防止泄漏到同轮/后续运行的其它 spec
  await apiFetch(app.url, '/ai/config', { method: 'PUT', cookie, body: { apiKey: null } });
  await new Promise<void>((resolve) => upstream.close(() => resolve()));
  await app.close();
});

describe('AI 用量可见化', () => {
  it('未产生任何调用：返回当月零值', async () => {
    const empty = await usage();
    expect(empty.calls).toBe(0);
    expect(empty.promptTokens).toBe(0);
    expect(empty.completionTokens).toBe(0);
    expect(empty.month).toMatch(/^\d{4}-\d{2}$/);
  });

  it('模块调用一次（dashboard 小结）→ usage 聚合 1 次 / 9 tokens', async () => {
    // 配置 mock 上游并启用大屏模块（快照会触发一次每日小结生成）
    await apiFetch(app.url, '/ai/config', {
      method: 'PUT',
      cookie,
      body: {
        baseUrl: await upstreamUrl(),
        model: 'test-model-x',
        apiKey: 'sk_good',
        timeoutMs: 10_000,
      },
    });
    await apiFetch(app.url, '/workspaces', {
      method: 'POST',
      cookie,
      body: { name: '用量空间', slug: 'usage-space' },
    });
    await apiFetch(app.url, '/modules/workspaces/usage-space/dashboard/enable', {
      method: 'POST',
      cookie,
    });
    const snapshot = await apiFetch(
      app.url,
      '/modules/workspaces/usage-space/dashboard/call/snapshot',
      { method: 'POST', cookie, body: {} },
    );
    expect(snapshot.status).toBe(200);

    const report = await usage();
    expect(report.calls).toBe(1);
    expect(report.promptTokens).toBe(5);
    expect(report.completionTokens).toBe(4);
    expect(report.byModule).toHaveLength(1);
    expect(report.byModule[0]?.moduleName).toBe('dashboard');
    expect(report.byModule[0]?.tokens).toBe(9);
  });

  it('同日重复快照走缓存：usage 不再增长（成本断言）', async () => {
    await apiFetch(app.url, '/modules/workspaces/usage-space/dashboard/call/snapshot', {
      method: 'POST',
      cookie,
      body: {},
    });
    await apiFetch(app.url, '/modules/workspaces/usage-space/dashboard/call/snapshot', {
      method: 'POST',
      cookie,
      body: {},
    });
    const report = await usage();
    expect(report.calls).toBe(1);
  });

  it('未登录：401', async () => {
    const denied = await apiFetch(app.url, '/ai/usage', { method: 'GET' });
    expect(denied.status).toBe(401);
  });
});
