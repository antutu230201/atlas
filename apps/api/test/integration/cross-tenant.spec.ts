import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createManagedDb } from '../../src/db/client';
import { workspace as workspaceTable } from '../../src/db/schema';
import { apiFetch, createTestApp, login, register, type TestApp } from './app-fixture';

let app: TestApp;
let ownerCookie: string;
let memberCookie: string;
let outsiderCookie: string;

beforeAll(async () => {
  app = await createTestApp();
  // 种子：owner 建空间 sec-team；member 受邀加入；outsider 无任何归属
  await register(app.url, 'sec-owner@example.com', '所有者');
  await register(app.url, 'sec-member@example.com', '成员');
  await register(app.url, 'sec-outsider@example.com', '局外人');
  ownerCookie = (await login(app.url, 'sec-owner@example.com')).cookie!;
  memberCookie = (await login(app.url, 'sec-member@example.com')).cookie!;
  outsiderCookie = (await login(app.url, 'sec-outsider@example.com')).cookie!;

  await apiFetch(app.url, '/workspaces', {
    method: 'POST',
    cookie: ownerCookie,
    body: { name: '隔离团队', slug: 'sec-team' },
  });
  const invite = await apiFetch(app.url, '/workspaces/sec-team/members/invite', {
    method: 'POST',
    cookie: ownerCookie,
    body: { email: 'sec-member@example.com', role: 'member' },
  });
  await apiFetch(app.url, '/auth/invitations/accept', {
    method: 'POST',
    cookie: memberCookie,
    body: { token: invite.body.data.token },
  });
});

afterAll(async () => {
  await app.close();
});

describe('越权防护（应用层 + RLS，ADR-0005 §4）', () => {
  it('非成员访问工作空间数据 → 404（不暴露存在性）', async () => {
    const res = await apiFetch(app.url, '/workspaces/sec-team/members', { cookie: outsiderCookie });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('atlas.workspace.not-found');
  });

  it('非成员在别人空间里邀请 → 404', async () => {
    const res = await apiFetch(app.url, '/workspaces/sec-team/members/invite', {
      method: 'POST',
      cookie: outsiderCookie,
      body: { email: 'someone@example.com', role: 'member' },
    });
    expect(res.status).toBe(404);
  });

  it('成员可以读取，但 member 无 member:manage 权限 → 403', async () => {
    const read = await apiFetch(app.url, '/workspaces/sec-team/members', { cookie: memberCookie });
    expect(read.status).toBe(200);
    const invite = await apiFetch(app.url, '/workspaces/sec-team/members/invite', {
      method: 'POST',
      cookie: memberCookie,
      body: { email: 'new@example.com', role: 'member' },
    });
    expect(invite.status).toBe(403);
    expect(invite.body.error).toBe('atlas.auth.forbidden');
  });

  it('member 无 audit:read → 403；owner 可读且审计有记录', async () => {
    const memberView = await apiFetch(app.url, '/workspaces/sec-team/audit', {
      cookie: memberCookie,
    });
    expect(memberView.status).toBe(403);
    const ownerView = await apiFetch(app.url, '/workspaces/sec-team/audit', {
      cookie: ownerCookie,
    });
    expect(ownerView.status).toBe(200);
    expect(ownerView.body.data.length).toBeGreaterThan(0);
  });

  it('未登录 → 401', async () => {
    const res = await apiFetch(app.url, '/workspaces/sec-team/members');
    expect(res.status).toBe(401);
  });

  it('移除成员后其访问立即失效', async () => {
    const members = await apiFetch(app.url, '/workspaces/sec-team/members', {
      cookie: ownerCookie,
    });
    const target = members.body.data.find(
      (m: { email: string }) => m.email === 'sec-member@example.com',
    );
    expect(target).toBeTruthy();
    const del = await apiFetch(app.url, `/workspaces/sec-team/members/${target.userId}`, {
      method: 'DELETE',
      cookie: ownerCookie,
    });
    expect(del.status).toBe(204);
    const after = await apiFetch(app.url, '/workspaces/sec-team/members', { cookie: memberCookie });
    expect(after.status).toBe(404);
  });

  it('RLS 直连冒烟：无 app.user_id 时 atlas_app 查不到任何工作空间；设置后可见', async () => {
    const appDb = createManagedDb('postgres://atlas_app:atlas_app@localhost:5433/atlas');
    try {
      const anonymous = await appDb.db.select().from(workspaceTable);
      expect(anonymous).toHaveLength(0);

      // 找到 owner 的 user_id（管理员连接，绕过 RLS 仅用于测试准备）
      const admin = createManagedDb('postgres://atlas:atlas@localhost:5433/atlas');
      const users = await admin.db.execute(
        sql`select id from platform."user" where email = 'sec-owner@example.com'`,
      );
      const ownerId = (users.rows[0] as { id: string }).id;
      await admin.end();

      await appDb.db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.user_id', ${ownerId}, true)`);
        const visible = await tx
          .select()
          .from(workspaceTable)
          .where(eq(workspaceTable.slug, 'sec-team'));
        expect(visible).toHaveLength(1);
        // 不存在的空间自然不可见
        const none = await tx
          .select()
          .from(workspaceTable)
          .where(eq(workspaceTable.slug, 'no-such-team'));
        expect(none).toHaveLength(0);
      });
    } finally {
      await appDb.end();
    }
  });
});
