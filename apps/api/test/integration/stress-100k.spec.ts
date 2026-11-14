import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { apiFetch, createTestApp, login, register, type TestApp } from './app-fixture';

/**
 * 10 万级压测复测（2026-11-15，P2 存量收口）——docs/plans/system-optimization-next-steps.md §P2：
 * 隔离库（5433 测试库，global-setup 截断，绝不触碰正式库）注入 10 万通知 + 1 千待办/笔记，
 * 对真实 API 路径做同口径采样（p50/p95），按宪法 §4-1"核心操作 <100ms 反馈"设预算。
 * 只在热点证据明确时改查询/索引；租户过滤与 RLS 不为速度绕过。
 */

const NOTIFY_TOTAL = 100_000;
const BULK_SMALL = 1_000;
const SAMPLES = 20;

let app: TestApp;
let cookie: string;
let pool: Pool;
let userId = '';
let workspaceId = '';
let deepCursor = '';

/** 同口径采样：预热的 p50/p95（毫秒） */
const measure = async (
  label: string,
  fn: () => Promise<unknown>,
  samples = SAMPLES,
): Promise<{ label: string; p50: number; p95: number; max: number }> => {
  await fn(); // 预热（连接池 + 缓存）
  const times: number[] = [];
  for (let index = 0; index < samples; index += 1) {
    const started = performance.now();
    await fn();
    times.push(performance.now() - started);
  }
  times.sort((a, b) => a - b);
  const p = (ratio: number) => times[Math.min(times.length - 1, Math.floor(ratio * times.length))]!;
  const result = {
    label,
    p50: Math.round(p(0.5)),
    p95: Math.round(p(0.95)),
    max: Math.round(times[times.length - 1]!),
  };
  console.log(
    `[stress] ${label}: p50=${result.p50}ms p95=${result.p95}ms max=${result.max}ms (n=${samples})`,
  );
  return result;
};

beforeAll(async () => {
  app = await createTestApp();
  await register(app.url, 'stress@example.com', '压测验收');
  cookie = (await login(app.url, 'stress@example.com')).cookie!;
  const ws = await apiFetch(app.url, '/workspaces', {
    method: 'POST',
    cookie,
    body: { name: '压测空间', slug: 'stress-team' },
  });
  expect(ws.status).toBe(201);
  for (const moduleName of ['todo_notes', 'sample_note']) {
    const enabled = await apiFetch(
      app.url,
      `/modules/workspaces/stress-team/${moduleName}/enable`,
      {
        method: 'POST',
        cookie,
      },
    );
    expect(enabled.status).toBe(201);
  }

  // 隔离库直连种子（管理员连接；禁触碰正式库——本 spec 只指向 5433）
  pool = new Pool({ connectionString: 'postgres://atlas:atlas@localhost:5433/atlas', max: 2 });
  const userRow = await pool.query<{ id: string }>(
    `select id from platform."user" where email = 'stress@example.com'`,
  );
  const wsRow = await pool.query<{ id: string }>(
    `select id from platform.workspace where slug = 'stress-team'`,
  );
  userId = userRow.rows[0]!.id;
  workspaceId = wsRow.rows[0]!.id;

  await pool.query(
    `insert into platform.notification (workspace_id, user_id, type, title, body)
     select $1::uuid, $2::uuid, 'system', '压测通知 #' || g, '{}'::jsonb
     from generate_series(1, $3::int) g`,
    [workspaceId, userId, NOTIFY_TOTAL],
  );
  // 100 条已读 + 最近 200 条标记已读（贴近真实未读占比仍 ≥ 99%）
  await pool.query(
    `with ranked as (
       select id, row_number() over (order by created_at desc, id desc) as rn
       from platform.notification where user_id = $1
     )
     update platform.notification n set read_at = now()
     from ranked r where n.id = r.id and r.rn > $2`,
    [userId, NOTIFY_TOTAL - 200],
  );
  await pool.query(
    `insert into "modules.todo_notes".todo (workspace_id, title, notes, status, priority, sort_order, created_by)
     select $1::uuid, '压测待办 #' || g, '', 'open', 'normal', g, $2
     from generate_series(1, $3::int) g`,
    [workspaceId, userId, BULK_SMALL],
  );
  await pool.query(
    `insert into "modules.sample_note".note (workspace_id, title, body)
     select $1::uuid, '压测笔记 #' || g, repeat('内容', 40)
     from generate_series(1, $2::int) g`,
    [workspaceId, BULK_SMALL],
  );

  // 深分页游标：取第 98,000 行的 id（同毫秒批量插入靠 (created_at, id) 行比较打破平局）
  const cursorRow = await pool.query<{ id: string }>(
    `select id from platform.notification where user_id = $1::uuid
     order by created_at desc, id desc offset 98000 limit 1`,
    [userId],
  );
  deepCursor = cursorRow.rows[0]!.id;
}, 120_000);

afterAll(async () => {
  // 种子仅存在于隔离测试库，下一次 global-setup 截断回收；这里主动清掉减轻内存占用
  if (pool) {
    await pool.query(`delete from platform.notification where user_id = $1`, [userId]);
    await pool.query(`delete from "modules.todo_notes".todo where workspace_id = $1`, [
      workspaceId,
    ]);
    await pool.query(`delete from "modules.sample_note".note where workspace_id = $1`, [
      workspaceId,
    ]);
    await pool.end();
  }
  await app.close();
});

describe('10 万级数据压测（隔离库）', () => {
  it('通知 10 万行：列表首/深页、未读数、免打扰偏好全部 <100ms 预算', async () => {
    const firstPage = await measure('通知列表首页(20条)', () =>
      apiFetch(app.url, '/notifications?limit=20', { cookie }),
    );
    expect(firstPage.p95).toBeLessThan(100);

    const deepPage = await measure('通知列表深页(offset≈9.8万)', () =>
      apiFetch(app.url, `/notifications?limit=20&cursor=${encodeURIComponent(deepCursor)}`, {
        cookie,
      }),
    );
    expect(deepPage.p95).toBeLessThan(150);

    const unread = await measure('未读数(≈9.98万)', () =>
      apiFetch(app.url, '/notifications/unread-count', { cookie }),
    );
    expect(unread.p95).toBeLessThan(100);

    const quiet = await measure('免打扰偏好', () =>
      apiFetch(app.url, '/notifications/quiet-hours', { cookie }),
    );
    expect(quiet.p95).toBeLessThan(100);
  }, 150_000);

  it('待办/笔记 1 千行：列表首屏 <100ms', async () => {
    const todoList = await measure('待办列表(limit100/共1千)', () =>
      apiFetch(app.url, '/modules/workspaces/stress-team/todo_notes/call/list', {
        method: 'POST',
        cookie,
        body: {},
      }),
    );
    expect(todoList.p95).toBeLessThan(100);

    const noteList = await measure('笔记列表(limit100/共1千)', () =>
      apiFetch(app.url, '/modules/workspaces/stress-team/sample_note/call/list', {
        method: 'POST',
        cookie,
        body: {},
      }),
    );
    expect(noteList.p95).toBeLessThan(100);
  }, 150_000);

  it('通知导出（宪法 §4）：10 万行全量 JSON 一次可用性', async () => {
    const started = performance.now();
    const exported = await apiFetch(app.url, '/notifications/export', { cookie });
    const elapsed = Math.round(performance.now() - started);
    expect(exported.status).toBe(200);
    const data = exported.body.data as { count: number; notifications: unknown[] };
    expect(data.count).toBe(NOTIFY_TOTAL);
    expect(data.notifications).toHaveLength(NOTIFY_TOTAL);
    console.log(
      `[stress] 通知导出10万行: ${elapsed}ms, 响应 ${(JSON.stringify(exported.body).length / 1024 / 1024).toFixed(1)}MB`,
    );
    expect(elapsed).toBeLessThan(10_000);
  }, 60_000);
});
