import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiFetch, createTestApp, login, register, type TestApp } from './app-fixture';

let app: TestApp;
let ownerCookie: string;

const call = (action: string, body?: unknown) =>
  apiFetch(app.url, `/modules/workspaces/exp-team/todo_notes/call/${action}`, {
    method: 'POST',
    cookie: ownerCookie,
    body,
  });

beforeAll(async () => {
  app = await createTestApp();
  await register(app.url, 'exp-owner@example.com', '导出主');
  ownerCookie = (await login(app.url, 'exp-owner@example.com')).cookie!;
  await apiFetch(app.url, '/workspaces', {
    method: 'POST',
    cookie: ownerCookie,
    body: { name: '导出团队', slug: 'exp-team' },
  });
  await apiFetch(app.url, '/modules/workspaces/exp-team/todo_notes/enable', {
    method: 'POST',
    cookie: ownerCookie,
  });
  for (const title of ['买牛奶', '写代码', '健身30分钟']) {
    await call('create', { title, notes: `关于${title}的备注` });
  }
});

afterAll(async () => {
  await app.close();
});

describe('搜索 / 导出 / 导入（阶段 4）', () => {
  it('search 全文搜索标题和正文', async () => {
    const res = await call('search', { q: '牛奶' });
    expect(res.status).toBe(200);
    expect(res.body.data.results).toHaveLength(1);
    expect(res.body.data.results[0].label).toBe('买牛奶');
  });

  it('search 无结果时返回空数组', async () => {
    const res = await call('search', { q: '不存在的关键词' });
    expect(res.status).toBe(200);
    expect(res.body.data.results).toHaveLength(0);
  });

  it('exportData 返回全部待办（含字段完整性）', async () => {
    const res = await call('exportData');
    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(3);
    expect(res.body.data.moduleName).toBe('todo_notes');
    const first = res.body.data.todos[0];
    expect(first).toHaveProperty('id');
    expect(first).toHaveProperty('title');
    expect(first).toHaveProperty('status');
    expect(first).toHaveProperty('workspaceId');
  });

  it('importData 导入新待办', async () => {
    const res = await call('importData', {
      todos: [{ title: '导入的待办A' }, { title: '导入的待办B', priority: 'high' }],
    });
    expect(res.status).toBe(200);
    expect(res.body.data.imported).toBe(2);
    const list = await call('list');
    expect(list.body.data.todos).toHaveLength(5);
  });

  it('importData 跳过重复 id', async () => {
    const exportRes = await call('exportData');
    const firstTodo = exportRes.body.data.todos[0];
    const res = await call('importData', {
      todos: [{ ...firstTodo, title: '试图覆盖' }],
    });
    expect(res.status).toBe(200);
    expect(res.body.data.imported).toBe(0);
    expect(res.body.data.skipped).toBe(1);
  });

  it('importData 拒绝格式错误数据', async () => {
    const res = await call('importData', { todos: [{ title: '' }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('atlas.module.action-failed');
  });
});
