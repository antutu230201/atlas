import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createManagedDb } from '../../src/db/client';
import { apiFetch, createTestApp, login, register, type TestApp } from './app-fixture';

let app: TestApp;
let ownerCookie: string;
const admin = createManagedDb('postgres://atlas:atlas@localhost:5433/atlas');

const call = (cookie: string, action: string, body?: unknown) =>
  apiFetch(app.url, `/modules/workspaces/todo-team/todo_notes/call/${action}`, {
    method: 'POST',
    cookie,
    body,
  });

const createdIds: string[] = [];
let otherCookie: string;

beforeAll(async () => {
  app = await createTestApp();
  await register(app.url, 'todo-owner@example.com', '待办主');
  await register(app.url, 'todo-other@example.com', '隔壁用户');
  ownerCookie = (await login(app.url, 'todo-owner@example.com')).cookie!;
  otherCookie = (await login(app.url, 'todo-other@example.com')).cookie!;

  await apiFetch(app.url, '/workspaces', {
    method: 'POST',
    cookie: ownerCookie,
    body: { name: '待办团队', slug: 'todo-team' },
  });
  await apiFetch(app.url, '/modules/workspaces/todo-team/todo_notes/enable', {
    method: 'POST',
    cookie: ownerCookie,
  });

  // 隔离对照：隔壁用户自己的空间
  await apiFetch(app.url, '/workspaces', {
    method: 'POST',
    cookie: otherCookie,
    body: { name: '隔壁团队', slug: 'other-team' },
  });
  await apiFetch(app.url, '/modules/workspaces/other-team/todo_notes/enable', {
    method: 'POST',
    cookie: otherCookie,
  });
  void otherCookie;
});

afterAll(async () => {
  await app.close();
  await admin.end();
});

describe('待办与笔记模块（阶段 3b）', () => {
  it('create 创建三条待办并回显', async () => {
    for (const title of ['写周报', '晨间跑步', '交房租']) {
      const res = await call(ownerCookie, 'create', { title, priority: 'high' });
      expect(res.status).toBe(200);
      createdIds.push(res.body.data.id);
    }
    const list = await call(ownerCookie, 'list');
    expect(list.body.data.todos).toHaveLength(3);
  });

  it('list 支持状态筛选与标题搜索', async () => {
    const search = await call(ownerCookie, 'list', { q: '周报' });
    expect(search.body.data.todos).toHaveLength(1);
    expect(search.body.data.todos[0].title).toBe('写周报');

    const setStatus = await call(ownerCookie, 'setStatus', {
      id: createdIds[1],
      status: 'done',
    });
    expect(setStatus.status).toBe(200);
    const doneOnly = await call(ownerCookie, 'list', { status: 'done' });
    expect(doneOnly.body.data.todos).toHaveLength(1);
    expect(doneOnly.body.data.todos[0].status).toBe('done');
  });

  it('update 修改字段；reorder 重排 sortOrder', async () => {
    const updated = await call(ownerCookie, 'update', {
      id: createdIds[0],
      title: '写周报（改）',
      priority: 'normal',
    });
    expect(updated.body.data.title).toBe('写周报（改）');

    const reversed = [...createdIds].reverse();
    const reordered = await call(ownerCookie, 'reorder', { ids: reversed });
    expect(reordered.body.data.reordered).toBe(3);
    // reorder 后 sortOrder 覆盖了创建顺序：升序读第一条应是 reversed[0]
    const sorted = await call(ownerCookie, 'list', {});
    expect(sorted.body.data.todos[0].id).toBe(reversed[0]);
  });

  it('widgetToday 返回未完成计数与最近条目', async () => {
    const widget = await call(ownerCookie, 'widgetToday');
    expect(widget.body.data.openCount).toBe(2);
    expect(widget.body.data.recent.length).toBeGreaterThan(0);
  });

  it('软删除进回收站；restore 恢复；purge 永久删除', async () => {
    const removed = await call(ownerCookie, 'remove', { id: createdIds[2] });
    expect(removed.status).toBe(200);

    const active = await call(ownerCookie, 'list');
    expect(active.body.data.todos).toHaveLength(2);

    const trash = await call(ownerCookie, 'listTrash');
    expect(trash.body.data.todos).toHaveLength(1);
    const trashedId = trash.body.data.todos[0].id;

    const restored = await call(ownerCookie, 'restore', { id: trashedId });
    expect(restored.status).toBe(200);
    expect((await call(ownerCookie, 'list')).body.data.todos).toHaveLength(3);

    await call(ownerCookie, 'remove', { id: createdIds[2] });
    const purged = await call(ownerCookie, 'purge', { id: createdIds[2] });
    expect(purged.status).toBe(200);
    const trashAfter = await call(ownerCookie, 'listTrash');
    expect(trashAfter.body.data.todos).toHaveLength(0);
  });

  it('工作空间隔离：隔壁团队看不到本团队待办', async () => {
    const otherCall = (action: string, body?: unknown) =>
      apiFetch(app.url, `/modules/workspaces/other-team/todo_notes/call/${action}`, {
        method: 'POST',
        cookie: otherCookie,
        body,
      });
    const list = await otherCall('list');
    expect(list.status).toBe(200);
    expect(list.body.data.todos).toHaveLength(0);
  });

  it('事件落库：todo.created / todo.completed / todo.deleted', async () => {
    const rows = await admin.db.execute(
      sql`select name from platform.event where name like 'todo.%' order by created_at`,
    );
    const names = (rows.rows as Array<{ name: string }>).map((r) => r.name);
    expect(names).toContain('todo.created');
    expect(names).toContain('todo.completed');
    expect(names).toContain('todo.deleted');
  });

  it('非法输入被拒绝（标题为空 / 非法状态）', async () => {
    const empty = await call(ownerCookie, 'create', { title: '' });
    expect(empty.status).toBe(400);
    expect(empty.body.message ?? '').toContain('输入不合法');
    const badStatus = await call(ownerCookie, 'setStatus', {
      id: createdIds[0],
      status: 'archived',
    });
    expect(badStatus.status).toBe(400);
  });
});
