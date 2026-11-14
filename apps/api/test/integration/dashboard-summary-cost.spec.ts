import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiFetch, createTestApp, login, register, type TestApp } from './app-fixture';

/**
 * AI 每日小结降本回归（2026-11-14）：
 * - 供应商失败（401/限流/超时）→ 回退本地数据小结（source='local'）并照常写缓存，
 *   当天后续快照零上游调用（消除 stale-while-revalidate 每 5 分钟快照轮询的重试风暴）；
 * - 供应商正常 → 每天最多 1 次自动生成（TTL 24h），手动 refresh 强刷才再次调用。
 * 用本地 OpenAI 兼容 mock 上游的请求计数作为成本断言。
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

const snapshot = async () =>
  (
    await apiFetch(app.url, '/modules/workspaces/sum-team/dashboard/call/snapshot', {
      method: 'POST',
      cookie,
      body: {},
    })
  ).body.data as {
    summary: {
      status: string;
      payload: { text: string; source: 'ai' | 'local'; basis?: string[] } | null;
    };
  };

const putConfig = async (apiKey: string) =>
  apiFetch(app.url, '/ai/config', {
    method: 'PUT',
    cookie,
    body: { baseUrl: await upstreamUrl(), model: 'test-model-x', apiKey, timeoutMs: 10_000 },
  });

beforeAll(async () => {
  app = await createTestApp();
  await register(app.url, 'sum-cost@example.com', '小结降本');
  cookie = (await login(app.url, 'sum-cost@example.com')).cookie!;
  await apiFetch(app.url, '/workspaces', {
    method: 'POST',
    cookie,
    body: { name: '小结团队', slug: 'sum-team' },
  });
  await apiFetch(app.url, '/modules/workspaces/sum-team/dashboard/enable', {
    method: 'POST',
    cookie,
  });

  upstreamHits = 0;
  upstream = createServer((req, res) => {
    if ((req.url ?? '').endsWith('/chat/completions')) {
      upstreamHits += 1;
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
            usage: { prompt_tokens: 10, completion_tokens: 5 },
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
  // 显式清除 db 配置回落 mock：防止本 spec 的 AI 配置泄漏到同轮/后续运行的其它 spec
  await apiFetch(app.url, '/ai/config', { method: 'PUT', cookie, body: { apiKey: null } });
  await new Promise<void>((resolve) => upstream.close(() => resolve()));
  await app.close();
});

describe('AI 每日小结降本', () => {
  it('供应商失败 → 本地数据小结兜底（source=local），且只打了 1 次上游', async () => {
    await putConfig('sk_bad');
    const first = await snapshot();
    expect(first.summary.status).toBe('fresh');
    expect(first.summary.payload?.source).toBe('local');
    expect(first.summary.payload?.text).toContain('最近 7 天完成待办');
    expect(first.summary.payload?.basis?.length ?? 0).toBeGreaterThan(0);
    expect(upstreamHits).toBe(1);
  });

  it('失败后同一天再拉快照：零上游调用（缓存兜底，重试风暴消除）', async () => {
    await snapshot();
    await snapshot();
    expect(upstreamHits).toBe(1);
  });

  it('恢复供应商 + 手动 refresh → AI 小结，且 24h 内重复快照不再调用', async () => {
    await putConfig('sk_good');
    const refreshed = await apiFetch(
      app.url,
      '/modules/workspaces/sum-team/dashboard/call/refresh',
      {
        method: 'POST',
        cookie,
        body: { sources: ['summary'] },
      },
    );
    expect(refreshed.status).toBe(200);

    const after = await snapshot();
    expect(after.summary.payload?.source).toBe('ai');
    expect(after.summary.payload?.text).toBe('AI 小结 OK');
    expect(upstreamHits).toBe(2);

    // TTL 24h：当天后续快照走缓存，不再消耗配额
    await snapshot();
    await snapshot();
    expect(upstreamHits).toBe(2);
  });

  it('导出：倒计时全量 JSON——宪法 §4 数据可导出', async () => {
    await apiFetch(app.url, '/modules/workspaces/ws/dashboard/call/createCountdown', {
      method: 'POST',
      cookie,
      body: { title: '导出测试纪念日', targetDate: '2026-12-01' },
    });
    const exported = await apiFetch(app.url, '/modules/workspaces/ws/dashboard/call/exportData', {
      method: 'POST',
      cookie,
    });
    const data = exported.body.data as {
      moduleName: string;
      count: number;
      countdowns: Array<{ title: string; deletedAt: string | null }>;
    };
    expect(data.moduleName).toBe('dashboard');
    expect(data.countdowns.some((item) => item.title === '导出测试纪念日')).toBe(true);
    expect(data.count).toBe(data.countdowns.length);
  });
});
