import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createManagedDb } from '../../src/db/client';
import type { EventDispatcherService } from '../../src/events/event-dispatcher.service';
import { apiFetch, createTestApp, login, register, type TestApp } from './app-fixture';

let app: TestApp;
let ownerCookie: string;
let memberCookie: string;
const admin = createManagedDb('postgres://atlas:atlas@localhost:5433/atlas');

async function eventRow(
  name: string,
): Promise<{ status: string; attempts: number; last_error: string | null }> {
  const rows = await admin.db.execute(
    sql`select status, attempts, last_error from platform.event where name = ${name} order by created_at desc limit 1`,
  );
  return rows.rows[0] as { status: string; attempts: number; last_error: string | null };
}

beforeAll(async () => {
  app = await createTestApp();
  await register(app.url, 'ev-owner@example.com', '事件主');
  await register(app.url, 'ev-member@example.com', '事件成员');
  ownerCookie = (await login(app.url, 'ev-owner@example.com')).cookie!;
  memberCookie = (await login(app.url, 'ev-member@example.com')).cookie!;
  await apiFetch(app.url, '/workspaces', {
    method: 'POST',
    cookie: ownerCookie,
    body: { name: '事件团队', slug: 'ev-team' },
  });
  const invite = await apiFetch(app.url, '/workspaces/ev-team/members/invite', {
    method: 'POST',
    cookie: ownerCookie,
    body: { email: 'ev-member@example.com', role: 'member' },
  });
  await apiFetch(app.url, '/auth/invitations/accept', {
    method: 'POST',
    cookie: memberCookie,
    body: { token: invite.body.data.token },
  });
  await apiFetch(app.url, '/modules/workspaces/ev-team/sample_note/enable', {
    method: 'POST',
    cookie: ownerCookie,
  });
});

afterAll(async () => {
  await app.close();
  await admin.end();
});

describe('事件总线与通知（2c，ADR-0005 §8）', () => {
  it('outbox：业务动作同事务落事件；启用模块本身也发布事件', async () => {
    const rows = await admin.db.execute(sql`select name from platform.event order by created_at`);
    const names = (rows.rows as Array<{ name: string }>).map((r) => r.name);
    expect(names).toContain('workspace.created');
    expect(names).toContain('member.invited');
    expect(names).toContain('module.enabled');
  });

  it('派发：note.created 分发到订阅 handler（settings 计数）', async () => {
    await call(ownerCookie, 'create', { title: '第一条笔记' });

    // outbox 里是 pending（fixture 关闭了自动派发）
    const before = await eventRow('note.created');
    expect(before.status).toBe('pending');

    // 注册引导（个人空间+大屏启用）会先产生一批事件，可能占满首个派发批次；
    // 循环派发直到 note.created 被处理（防批次次序脆弱）。
    let result = await dispatchOnce();
    for (let i = 0; i < 10 && (await eventRow('note.created')).status === 'pending'; i += 1) {
      result = await dispatchOnce();
    }
    expect(result.delivered).toBeGreaterThanOrEqual(1);

    // handler 订阅自增 settings.greeted
    const demo = await call(ownerCookie, 'settingsDemo');
    expect(demo.body.data.settings.greeted).toBeGreaterThanOrEqual(1);

    const after = await eventRow('note.created');
    expect(after.status).toBe('delivered');
  });

  it('无订阅的事件直接标记 delivered', async () => {
    const result = await dispatchOnce();
    // workspace.created / member.invited 等无模块订阅（member.invited 走内核通知）
    expect(result.claimed).toBeGreaterThanOrEqual(0);
    const row = await eventRow('workspace.created');
    expect(row.status).toBe('delivered');
  });

  it('member.invited 内置订阅：站内通知 + 邮件适配器', async () => {
    await dispatchOnce();
    const list = await apiFetch(app.url, '/notifications', { cookie: memberCookie });
    expect(list.status).toBe(200);
    const invited = list.body.data.items.find((n: { type: string }) => n.type === 'member.invited');
    expect(invited).toBeTruthy();

    const count = await apiFetch(app.url, '/notifications/unread-count', { cookie: memberCookie });
    expect(count.body.data.count).toBe(1);
    const unread = await apiFetch(app.url, '/notifications?unread=true', { cookie: memberCookie });
    expect(unread.body.data.items.map((n: { id: string }) => n.id)).toContain(invited.id);

    const read = await apiFetch(app.url, `/notifications/${invited.id}/read`, {
      method: 'POST',
      cookie: memberCookie,
    });
    expect(read.status).toBe(200);
    const afterRead = await apiFetch(app.url, '/notifications/unread-count', {
      cookie: memberCookie,
    });
    expect(afterRead.body.data.count).toBe(0);
    const unreadAfterRead = await apiFetch(app.url, '/notifications?unread=true', {
      cookie: memberCookie,
    });
    expect(unreadAfterRead.body.data.items).toHaveLength(0);
  });

  it('重试与死信：失败 handler 退避重试直至死信', async () => {
    await call(ownerCookie, 'emitFailing', {});

    // 第一次派发：handler 抛错 → pending + attempts=1
    await dispatchOnce();
    const first = await eventRow('note.failing');
    expect(first.status).toBe('pending');
    expect(first.attempts).toBe(1);
    expect(first.last_error).toContain('故意失败');

    // 人为耗尽重试次数并清除退避窗口 → 死信
    await admin.db.execute(
      sql`update platform.event set attempts = 7, next_attempt_at = now() where name = 'note.failing'`,
    );
    await dispatchOnce();
    const dead = await eventRow('note.failing');
    expect(dead.status).toBe('dead');
    expect(dead.attempts).toBe(8);
  });

  it('通知游标分页：limit=1 翻页取全量且不重不漏', async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 10; page += 1) {
      const url = `/notifications?limit=1${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      // cursor 现在是纯 uuid（最后一条的 id），翻页应不重不漏
      const res = await apiFetch(app.url, url, { cookie: memberCookie });
      expect(res.status).toBe(200);
      const { items, nextCursor } = res.body.data;
      seen.push(...items.map((n: { id: string }) => n.id));
      if (!nextCursor) break;
      cursor = nextCursor;
    }
    const full = await apiFetch(app.url, '/notifications?limit=50', { cookie: memberCookie });
    const allIds = full.body.data.items.map((n: { id: string }) => n.id);
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toEqual(allIds);
  });

  it('通知 read-all', async () => {
    const all = await apiFetch(app.url, '/notifications/read-all', {
      method: 'POST',
      cookie: memberCookie,
    });
    expect(all.status).toBe(200);
    const list = await apiFetch(app.url, '/notifications', { cookie: memberCookie });
    const unread = list.body.data.items.filter((n: { readAt: string | null }) => n.readAt === null);
    expect(unread).toHaveLength(0);
    const count = await apiFetch(app.url, '/notifications/unread-count', { cookie: memberCookie });
    expect(count.body.data.count).toBe(0);
  });

  function call(cookie: string, action: string, body?: unknown) {
    return apiFetch(app.url, '/modules/workspaces/ev-team/sample_note/call/' + action, {
      method: 'POST',
      cookie,
      body,
    });
  }

  async function dispatchOnce() {
    const handle = (globalThis as { __atlasTestDispatcher?: EventDispatcherService })
      .__atlasTestDispatcher;
    if (!handle) throw new Error('派发器未注册到测试夹具');
    return handle.runOnce();
  }
});
