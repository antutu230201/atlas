import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiFetch, createTestApp, login, register, type TestApp } from './app-fixture';

/**
 * 复盘日记模块集成测试：upsert 语义（同日同类型一篇）、周报限周一、月快照过滤、
 * 软删除/归档/恢复与占位冲突、guest 只读、租户隔离、AI 润色（Mock 拒绝 + 真实供应商一次调用）。
 */

let app: TestApp;
let ownerCookie: string;
let guestCookie: string;
let outsiderCookie: string;
let upstream: Server;
let upstreamHits: number;

const call = (cookie: string, action: string, body?: unknown, slug = 'journal-team') =>
  apiFetch(app.url, `/modules/workspaces/${slug}/journal/call/${action}`, {
    method: 'POST',
    cookie,
    body,
  });

const upstreamUrl = async (): Promise<string> =>
  new Promise((resolve) => {
    const addr = upstream.address();
    resolve(`http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}/v1`);
  });

const putAiConfig = async (apiKey: string | null) => {
  if (apiKey === null) {
    return apiFetch(app.url, '/ai/config', {
      method: 'PUT',
      cookie: ownerCookie,
      body: { apiKey: null },
    });
  }
  return apiFetch(app.url, '/ai/config', {
    method: 'PUT',
    cookie: ownerCookie,
    body: { baseUrl: await upstreamUrl(), model: 'test-model-x', apiKey, timeoutMs: 10_000 },
  });
};

interface SnapshotShape {
  month: string;
  entries: Array<{
    id: string;
    kind: 'daily' | 'weekly';
    day: string;
    mood: number | null;
    content: string;
    aiText: string | null;
  }>;
  archived: Array<{ id: string; day: string; title: string }>;
  summary: { monthDaily: number; monthWeekly: number; streak: number; currentMonday: string };
}

beforeAll(async () => {
  app = await createTestApp();
  await register(app.url, 'journal-owner@example.com', '复盘主');
  await register(app.url, 'journal-guest@example.com', '复盘访客');
  await register(app.url, 'journal-outsider@example.com', '复盘外人');
  ownerCookie = (await login(app.url, 'journal-owner@example.com')).cookie!;
  guestCookie = (await login(app.url, 'journal-guest@example.com')).cookie!;
  outsiderCookie = (await login(app.url, 'journal-outsider@example.com')).cookie!;

  await apiFetch(app.url, '/workspaces', {
    method: 'POST',
    cookie: ownerCookie,
    body: { name: '复盘团队', slug: 'journal-team' },
  });
  const invite = await apiFetch(app.url, '/workspaces/journal-team/members/invite', {
    method: 'POST',
    cookie: ownerCookie,
    body: { email: 'journal-guest@example.com', role: 'guest' },
  });
  await apiFetch(app.url, '/auth/invitations/accept', {
    method: 'POST',
    cookie: guestCookie,
    body: { token: invite.body.data.token },
  });
  await apiFetch(app.url, '/modules/workspaces/journal-team/journal/enable', {
    method: 'POST',
    cookie: ownerCookie,
  });

  // OpenAI 兼容 mock 上游：计数供"润色一次调用"断言
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
            choices: [{ message: { content: '润色后的复盘文本' } }],
            usage: { prompt_tokens: 20, completion_tokens: 10 },
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
  await putAiConfig(null);
  await new Promise<void>((resolve) => upstream.close(() => resolve()));
  await app.close();
});

describe('复盘日记模块', () => {
  it('保存日记 → 快照可见，连续复盘 1 天，心情存档', async () => {
    const result = await call(ownerCookie, 'saveEntry', {
      kind: 'daily',
      day: '2026-11-14',
      mood: 4,
      content: '今天完成了模块开发，流程顺畅。',
    });
    expect(result.status).toBe(200);
    const snap = (await call(ownerCookie, 'snapshot', { month: '2026-11' })).body
      .data as SnapshotShape;
    expect(snap.summary.monthDaily).toBe(1);
    expect(snap.summary.streak).toBe(1);
    expect(snap.entries[0]?.mood).toBe(4);
    expect(snap.entries[0]?.kind).toBe('daily');
  });

  it('同日同类型再次保存 = 更新（upsert），条目不重复', async () => {
    const before = (await call(ownerCookie, 'snapshot', { month: '2026-11' })).body
      .data as SnapshotShape;
    const result = await call(ownerCookie, 'saveEntry', {
      kind: 'daily',
      day: '2026-11-14',
      mood: 5,
      content: '补充：下午还修了一个顽固 bug。',
    });
    expect(result.status).toBe(200);
    const snap = (await call(ownerCookie, 'snapshot', { month: '2026-11' })).body
      .data as SnapshotShape;
    expect(snap.summary.monthDaily).toBe(before.summary.monthDaily);
    expect(snap.entries[0]?.mood).toBe(5);
    expect(snap.entries[0]?.content).toContain('顽固 bug');
    expect(snap.entries[0]?.id).toBe(before.entries[0]?.id);
  });

  it('周复盘限周一；周一可独立于同日日记保存', async () => {
    const notMonday = await call(ownerCookie, 'saveEntry', {
      kind: 'weekly',
      day: '2026-11-15', // 周日
      content: '非法周报',
    });
    expect(notMonday.status).toBe(400);

    const monday = await call(ownerCookie, 'saveEntry', {
      kind: 'weekly',
      day: '2026-11-09', // 周一
      content: '本周把 goals 模块交付了。',
    });
    expect(monday.status).toBe(200);
    const snap = (await call(ownerCookie, 'snapshot', { month: '2026-11' })).body
      .data as SnapshotShape;
    expect(snap.summary.monthWeekly).toBe(1);
    expect(snap.entries.filter((item) => item.kind === 'weekly')).toHaveLength(1);
  });

  it('月快照按 month 过滤：其他月份的条目不混入', async () => {
    await call(ownerCookie, 'saveEntry', {
      kind: 'daily',
      day: '2020-01-15',
      content: '两年前的旧日记。',
    });
    const current = (await call(ownerCookie, 'snapshot', { month: '2026-11' })).body
      .data as SnapshotShape;
    expect(current.entries.every((item) => item.day.startsWith('2026-11'))).toBe(true);
    const old = (await call(ownerCookie, 'snapshot', { month: '2020-01' })).body
      .data as SnapshotShape;
    expect(old.entries).toHaveLength(1);
    expect(old.entries[0]?.content).toContain('旧日记');
  });

  it('软删除 → 归档区；恢复回列表', async () => {
    const snap = (await call(ownerCookie, 'snapshot', { month: '2026-11' })).body
      .data as SnapshotShape;
    const daily = snap.entries.find((item) => item.kind === 'daily')!;
    expect(daily).toBeDefined();

    await call(ownerCookie, 'deleteEntry', { entryId: daily.id });
    const afterDelete = (await call(ownerCookie, 'snapshot', { month: '2026-11' })).body
      .data as SnapshotShape;
    expect(afterDelete.entries.find((item) => item.id === daily.id)).toBeUndefined();
    expect(afterDelete.archived.map((item) => item.id)).toContain(daily.id);

    const restored = await call(ownerCookie, 'restoreEntry', { entryId: daily.id });
    expect(restored.status).toBe(200);
    const afterRestore = (await call(ownerCookie, 'snapshot', { month: '2026-11' })).body
      .data as SnapshotShape;
    expect(afterRestore.entries.map((item) => item.id)).toContain(daily.id);
  });

  it('恢复与占位冲突：同周期已有新条目时拒绝恢复', async () => {
    const snap = (await call(ownerCookie, 'snapshot', { month: '2026-11' })).body
      .data as SnapshotShape;
    const daily = snap.entries.find((item) => item.kind === 'daily' && item.day === '2026-11-14')!;
    await call(ownerCookie, 'deleteEntry', { entryId: daily.id });
    // 同日新建占位
    const again = await call(ownerCookie, 'saveEntry', {
      kind: 'daily',
      day: '2026-11-14',
      content: '重新写的版本。',
    });
    expect(again.status).toBe(200);
    const clash = await call(ownerCookie, 'restoreEntry', { entryId: daily.id });
    expect(clash.status).toBe(400);
  });

  it('guest 只读：写操作 403，snapshot 可读', async () => {
    const snap = (await call(guestCookie, 'snapshot', {})).body.data as SnapshotShape;
    expect(snap.entries.length).toBeGreaterThanOrEqual(0);
    const denied = await call(guestCookie, 'saveEntry', {
      kind: 'daily',
      day: '2026-11-14',
      content: 'x',
    });
    expect(denied.status).toBe(403);
  });

  it('租户隔离：外人操作他工作区条目被拒', async () => {
    await apiFetch(app.url, '/workspaces', {
      method: 'POST',
      cookie: outsiderCookie,
      body: { name: '复盘外人空间', slug: 'journal-out' },
    });
    await apiFetch(app.url, '/modules/workspaces/journal-out/journal/enable', {
      method: 'POST',
      cookie: outsiderCookie,
    });
    const ownerSnap = (await call(ownerCookie, 'snapshot', { month: '2026-11' })).body
      .data as SnapshotShape;
    const cross = await call(outsiderCookie, 'deleteEntry', {
      entryId: ownerSnap.entries[0]!.id,
    });
    expect([400, 404]).toContain(cross.status);
    const outsiderSnap = (await call(outsiderCookie, 'snapshot', {}, 'journal-out')).body
      .data as SnapshotShape;
    expect(outsiderSnap.entries).toHaveLength(0);
  });

  it('AI 润色：Mock 未配置时明确拒绝，不消耗配额', async () => {
    await putAiConfig(null);
    const snap = (await call(ownerCookie, 'snapshot', { month: '2026-11' })).body
      .data as SnapshotShape;
    const target = snap.entries[0]!;
    const refused = await call(ownerCookie, 'polishEntry', { entryId: target.id });
    expect(refused.status).toBe(400);
    expect((refused.body as { message?: string }).message ?? '').toContain('AI 供应商未配置');
    expect(upstreamHits).toBe(0);
  });

  it('AI 润色：真实供应商一次调用成功，aiText 入库存档且原文不动', async () => {
    await putAiConfig('sk_good');
    const snap = (await call(ownerCookie, 'snapshot', { month: '2026-11' })).body
      .data as SnapshotShape;
    const target = snap.entries.find((item) => item.kind === 'daily')!;
    const polished = await call(ownerCookie, 'polishEntry', { entryId: target.id });
    expect(polished.status).toBe(200);
    expect((polished.body.data as { aiText: string }).aiText).toBe('润色后的复盘文本');
    expect(upstreamHits).toBe(1);

    const after = (await call(ownerCookie, 'snapshot', { month: '2026-11' })).body
      .data as SnapshotShape;
    const updated = after.entries.find((item) => item.id === target.id)!;
    expect(updated.aiText).toBe('润色后的复盘文本');
    expect(updated.content).toBe(target.content);
  });
});
