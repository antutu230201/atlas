import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiFetch, createTestApp, login, register, type TestApp } from './app-fixture';

let app: TestApp;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

describe('认证与会话', () => {
  it('注册返回用户并下发会话 Cookie，me 可回读', async () => {
    const reg = await register(app.url, 'alice@example.com', '爱丽丝');
    expect(reg.status).toBe(201);
    expect(reg.body.data.user.email).toBe('alice@example.com');
    expect(reg.cookie).toMatch(/^atlas_session=/);

    const me = await apiFetch(app.url, '/auth/me', { cookie: reg.cookie! });
    expect(me.status).toBe(200);
    expect(me.body.data.user.displayName).toBe('爱丽丝');
  });

  it('重复邮箱注册 409', async () => {
    await register(app.url, 'dup@example.com', '第一次');
    const second = await register(app.url, 'dup@example.com', '第二次');
    expect(second.status).toBe(409);
    expect(second.body.error).toBe('atlas.auth.email-taken');
  });

  it('登录成功返回用户；错误密码 401', async () => {
    await register(app.url, 'login-ok@example.com', '登录用户');
    const ok = await login(app.url, 'login-ok@example.com');
    expect(ok.status).toBe(200);

    const bad = await apiFetch(app.url, '/auth/login', {
      method: 'POST',
      body: { email: 'login-ok@example.com', password: 'wrong-password' },
    });
    expect(bad.status).toBe(401);
    expect(bad.body.error).toBe('atlas.auth.invalid-credentials');
  });

  it('未登录访问 me → 401；登出后旧 Cookie 失效', async () => {
    const anonymous = await apiFetch(app.url, '/auth/me');
    expect(anonymous.status).toBe(401);

    const reg = await register(app.url, 'logout@example.com', '登出用户');
    const out = await apiFetch(app.url, '/auth/logout', { method: 'POST', cookie: reg.cookie! });
    expect(out.status).toBe(204);
    const meAfter = await apiFetch(app.url, '/auth/me', { cookie: reg.cookie! });
    expect(meAfter.status).toBe(401);
  });

  it('同账号连续失败登录触发限流 429', async () => {
    await register(app.url, 'rate@example.com', '限流用户');
    let last = 0;
    for (let i = 0; i < 11; i += 1) {
      last = (
        await apiFetch(app.url, '/auth/login', {
          method: 'POST',
          body: { email: 'rate@example.com', password: `wrong-${i}` },
        })
      ).status;
    }
    expect(last).toBe(429);
  });
});

describe('工作空间与成员', () => {
  it('注册 → 创建工作空间 → 邀请 → 接受 → 成员列表可见', async () => {
    const alice = await register(app.url, 'ws-alice@example.com', '空间主');
    const bob = await register(app.url, 'ws-bob@example.com', '受邀者');

    const created = await apiFetch(app.url, '/workspaces', {
      method: 'POST',
      cookie: alice.cookie!,
      body: { name: 'Alice 团队', slug: 'alice-team' },
    });
    expect(created.status).toBe(201);
    expect(created.body.data.slug).toBe('alice-team');

    const members1 = await apiFetch(app.url, '/workspaces/alice-team/members', {
      cookie: alice.cookie!,
    });
    expect(members1.body.data).toHaveLength(1);
    expect(members1.body.data[0].role).toBe('owner');

    const invite = await apiFetch(app.url, '/workspaces/alice-team/members/invite', {
      method: 'POST',
      cookie: alice.cookie!,
      body: { email: 'ws-bob@example.com', role: 'member' },
    });
    expect(invite.status).toBe(201);

    const accept = await apiFetch(app.url, '/auth/invitations/accept', {
      method: 'POST',
      cookie: bob.cookie!,
      body: { token: invite.body.data.token },
    });
    expect(accept.status).toBe(201);
    expect(accept.body.data.role).toBe('member');

    const members2 = await apiFetch(app.url, '/workspaces/alice-team/members', {
      cookie: alice.cookie!,
    });
    expect(members2.body.data).toHaveLength(2);

    // bob 的 me 侧：列出的工作空间包含 alice-team
    const bobMe = await apiFetch(app.url, '/workspaces', { cookie: bob.cookie! });
    const names = bobMe.body.data.map((w: { slug: string }) => w.slug);
    expect(names).toContain('alice-team');
  });

  it('slug 冲突时自动加尾缀而不是失败', async () => {
    const reg = await register(app.url, 'slug-a@example.com', '甲');
    const reg2 = await register(app.url, 'slug-b@example.com', '乙');
    await apiFetch(app.url, '/workspaces', {
      method: 'POST',
      cookie: reg.cookie!,
      body: { name: 'X', slug: 'shared-team' },
    });
    const second = await apiFetch(app.url, '/workspaces', {
      method: 'POST',
      cookie: reg2.cookie!,
      body: { name: 'Y', slug: 'shared-team' },
    });
    expect(second.status).toBe(201);
    expect(second.body.data.slug).not.toBe('shared-team');
    expect(second.body.data.slug.startsWith('shared-team-')).toBe(true);
  });
});
