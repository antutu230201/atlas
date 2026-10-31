import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createManagedDb } from '../../src/db/client';
import { apiFetch, createTestApp, login, register, type TestApp } from './app-fixture';

let app: TestApp;
let ownerCookie: string;
let memberCookie: string;
let guestCookie: string;
let outsiderCookie: string;

const call = (
  cookie: string,
  action: string,
  body?: unknown,
  slug = 'mod-team',
  name = 'sample_note',
) =>
  apiFetch(app.url, `/modules/workspaces/${slug}/${name}/call/${action}`, {
    method: 'POST',
    cookie,
    body,
  });

beforeAll(async () => {
  app = await createTestApp();
  await register(app.url, 'mod-owner@example.com', '模块主');
  await register(app.url, 'mod-member@example.com', '模块成员');
  await register(app.url, 'mod-guest@example.com', '访客');
  await register(app.url, 'mod-outsider@example.com', '局外人');
  ownerCookie = (await login(app.url, 'mod-owner@example.com')).cookie!;
  memberCookie = (await login(app.url, 'mod-member@example.com')).cookie!;
  guestCookie = (await login(app.url, 'mod-guest@example.com')).cookie!;
  outsiderCookie = (await login(app.url, 'mod-outsider@example.com')).cookie!;

  await apiFetch(app.url, '/workspaces', {
    method: 'POST',
    cookie: ownerCookie,
    body: { name: '模块团队', slug: 'mod-team' },
  });
  const inviteMember = await apiFetch(app.url, '/workspaces/mod-team/members/invite', {
    method: 'POST',
    cookie: ownerCookie,
    body: { email: 'mod-member@example.com', role: 'member' },
  });
  await apiFetch(app.url, '/auth/invitations/accept', {
    method: 'POST',
    cookie: memberCookie,
    body: { token: inviteMember.body.data.token },
  });
  const inviteGuest = await apiFetch(app.url, '/workspaces/mod-team/members/invite', {
    method: 'POST',
    cookie: ownerCookie,
    body: { email: 'mod-guest@example.com', role: 'guest' },
  });
  await apiFetch(app.url, '/auth/invitations/accept', {
    method: 'POST',
    cookie: guestCookie,
    body: { token: inviteGuest.body.data.token },
  });
});

afterAll(async () => {
  await app.close();
});

describe('模块系统（2b，ADR-0005 §7）', () => {
  it('目录包含示例模块', async () => {
    const catalog = await apiFetch(app.url, '/modules', { cookie: ownerCookie });
    expect(catalog.status).toBe(200);
    const names = catalog.body.data.map((m: { name: string }) => m.name);
    expect(names).toContain('sample_note');
  });

  it('未启用时调用 → 409；member 启用 → 403；owner 启用 → 201', async () => {
    const before = await call(ownerCookie, 'list');
    expect(before.status).toBe(409);
    expect(before.body.error).toBe('atlas.module.not-enabled');

    const byMember = await apiFetch(app.url, '/modules/workspaces/mod-team/sample_note/enable', {
      method: 'POST',
      cookie: memberCookie,
    });
    expect(byMember.status).toBe(403);

    const byOwner = await apiFetch(app.url, '/modules/workspaces/mod-team/sample_note/enable', {
      method: 'POST',
      cookie: ownerCookie,
    });
    expect(byOwner.status).toBe(201);
    expect(byOwner.body.data.enabled).toContain('sample_note');

    const status = await apiFetch(app.url, '/modules/workspaces/mod-team', { cookie: ownerCookie });
    const sample = status.body.data.find((m: { name: string }) => m.name === 'sample_note');
    expect(sample.enabled).toBe(true);
  });

  it('list / create / remove 动作全流程 + 事件落库', async () => {
    const empty = await call(ownerCookie, 'list');
    expect(empty.status).toBe(200);
    expect(empty.body.data.notes).toHaveLength(0);

    const created = await call(ownerCookie, 'create', { title: '第一条', body: '内容' });
    expect(created.status).toBe(200);
    expect(created.body.data.title).toBe('第一条');

    const listed = await call(ownerCookie, 'list');
    expect(listed.body.data.notes).toHaveLength(1);

    // 事件 outbox 落库（管理员连接验证）
    const admin = createManagedDb('postgres://atlas:atlas@localhost:5433/atlas');
    try {
      const events = await admin.db.execute(
        sql`select name, payload from platform.event where name = 'note.created' order by created_at desc limit 1`,
      );
      const row = events.rows[0] as { name: string; payload: { title: string } };
      expect(row.name).toBe('note.created');
      expect(row.payload.title).toBe('第一条');
    } finally {
      await admin.end();
    }

    const removed = await call(ownerCookie, 'remove', { id: created.body.data.id });
    expect(removed.status).toBe(200);
    const afterRemove = await call(ownerCookie, 'list');
    expect(afterRemove.body.data.notes).toHaveLength(0);
  });

  it('guest 只读：list 200，create 403', async () => {
    const read = await call(guestCookie, 'list');
    expect(read.status).toBe(200);
    const write = await call(guestCookie, 'create', { title: '访客写入' });
    expect(write.status).toBe(403);
    expect(write.body.error).toBe('atlas.auth.forbidden');
  });

  it('工作空间数据隔离：局外人自己的空间互不可见', async () => {
    await call(ownerCookie, 'create', { title: '主空间笔记' });

    // 局外人自建空间并启用同一模块
    await apiFetch(app.url, '/workspaces', {
      method: 'POST',
      cookie: outsiderCookie,
      body: { name: '局外团队', slug: 'out-team' },
    });
    const enable = await apiFetch(app.url, '/modules/workspaces/out-team/sample_note/enable', {
      method: 'POST',
      cookie: outsiderCookie,
    });
    expect(enable.status).toBe(201);
    await call(outsiderCookie, 'create', { title: '局外笔记' }, 'out-team');

    const ownerList = await call(ownerCookie, 'list');
    const titles = ownerList.body.data.notes.map((n: { title: string }) => n.title);
    expect(titles).toContain('主空间笔记');
    expect(titles).not.toContain('局外笔记');

    const outsiderList = await call(outsiderCookie, 'list', undefined, 'out-team');
    const outsiderTitles = outsiderList.body.data.notes.map((n: { title: string }) => n.title);
    expect(outsiderTitles).toEqual(['局外笔记']);
  });

  it('模块设置读写（ModuleContext.settings）', async () => {
    const set = await call(ownerCookie, 'settingsDemo', { maxNotes: 42 });
    expect(set.status).toBe(200);
    const get = await call(ownerCookie, 'settingsDemo');
    expect(get.body.data.settings.maxNotes).toBe(42);
  });

  it('停用后调用 → 409；重新启用后数据保留', async () => {
    await call(ownerCookie, 'create', { title: '停用前的笔记' });

    const disable = await apiFetch(app.url, '/modules/workspaces/mod-team/sample_note/disable', {
      method: 'POST',
      cookie: ownerCookie,
    });
    expect(disable.status).toBe(201);

    const afterDisable = await call(ownerCookie, 'list');
    expect(afterDisable.status).toBe(409);
    expect(afterDisable.body.error).toBe('atlas.module.not-enabled');

    const reEnable = await apiFetch(app.url, '/modules/workspaces/mod-team/sample_note/enable', {
      method: 'POST',
      cookie: ownerCookie,
    });
    expect(reEnable.status).toBe(201);
    const list = await call(ownerCookie, 'list');
    const titles = list.body.data.notes.map((n: { title: string }) => n.title);
    expect(titles).toContain('停用前的笔记');
  });
});
