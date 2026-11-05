import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiFetch, createTestApp, login, register, type TestApp } from './app-fixture';

/**
 * 习惯打卡模块集成测试：覆盖 snapshot 结构、创建/改名/归档/恢复、
 * 打卡幂等与取消、连续天数语义、guest 只读、租户隔离。
 */

let app: TestApp;
let ownerCookie: string;
let guestCookie: string;
let outsiderCookie: string;

const call = (cookie: string, action: string, body?: unknown, slug = 'habit-team') =>
  apiFetch(app.url, `/modules/workspaces/${slug}/habits/call/${action}`, {
    method: 'POST',
    cookie,
    body,
  });

const snapshot = async (cookie: string, slug = 'habit-team') =>
  (await call(cookie, 'snapshot', {}, slug)).body.data as {
    habits: { id: string; name: string; icon: string; checkedToday: boolean; streak: number }[];
    archived: { id: string }[];
    doneToday: number;
    totalToday: number;
  };

beforeAll(async () => {
  app = await createTestApp();
  await register(app.url, 'habit-owner@example.com', '打卡主');
  await register(app.url, 'habit-guest@example.com', '打卡访客');
  await register(app.url, 'habit-outsider@example.com', '打卡外人');
  ownerCookie = (await login(app.url, 'habit-owner@example.com')).cookie!;
  guestCookie = (await login(app.url, 'habit-guest@example.com')).cookie!;
  outsiderCookie = (await login(app.url, 'habit-outsider@example.com')).cookie!;

  await apiFetch(app.url, '/workspaces', {
    method: 'POST',
    cookie: ownerCookie,
    body: { name: '打卡团队', slug: 'habit-team' },
  });
  const invite = await apiFetch(app.url, '/workspaces/habit-team/members/invite', {
    method: 'POST',
    cookie: ownerCookie,
    body: { email: 'habit-guest@example.com', role: 'guest' },
  });
  await apiFetch(app.url, '/auth/invitations/accept', {
    method: 'POST',
    cookie: guestCookie,
    body: { token: invite.body.data.token },
  });
  await apiFetch(app.url, '/modules/workspaces/habit-team/habits/enable', {
    method: 'POST',
    cookie: ownerCookie,
  });
});

afterAll(async () => {
  // habit.* 事件在 fixture 中不自动派发，主动排空避免挤占共享测试库的事件队列
  const dispatcher = (
    globalThis as { __atlasTestDispatcher?: { runOnce(): Promise<{ claimed: number }> } }
  ).__atlasTestDispatcher;
  if (dispatcher) {
    for (let i = 0; i < 5; i += 1) {
      const { claimed } = await dispatcher.runOnce();
      if (claimed === 0) break;
    }
  }
  await app.close();
});

describe('习惯打卡模块', () => {
  it('新建 → snapshot 返回打卡项，默认图标与今日未打卡', async () => {
    const result = await call(ownerCookie, 'createHabit', { name: '读书 10 分钟' });
    expect(result.status).toBe(200);
    const snap = result.body.data as {
      habits: { icon: string; checkedToday: boolean }[];
      totalToday: number;
    };
    expect(snap.habits).toHaveLength(1);
    expect(snap.habits[0]?.icon).toBe('✅');
    expect(snap.habits[0]?.checkedToday).toBe(false);
    expect(snap.totalToday).toBe(1);
  });

  it('改名 + 指定图标生效', async () => {
    const before = await snapshot(ownerCookie);
    const habitId = before.habits[0]?.id;
    if (!habitId) throw new Error('snapshot 缺少习惯');
    const result = await call(ownerCookie, 'renameHabit', {
      habitId,
      name: '跑步 20 分钟',
      icon: '🏃',
    });
    expect(result.status).toBe(200);
    const snap = result.body.data as { habits: { name: string; icon: string }[] };
    expect(snap.habits[0]?.name).toBe('跑步 20 分钟');
    expect(snap.habits[0]?.icon).toBe('🏃');
  });

  it('打卡 → checkedToday/streak=1，重复打卡幂等，取消后归零', async () => {
    const before = await snapshot(ownerCookie);
    const habitId = before.habits[0]?.id ?? '';
    const first = (await call(ownerCookie, 'toggleCheck', { habitId })).body.data as {
      habits: { checkedToday: boolean; streak: number }[];
      doneToday: number;
    };
    expect(first.habits[0]?.checkedToday).toBe(true);
    expect(first.habits[0]?.streak).toBe(1);
    expect(first.doneToday).toBe(1);

    const again = (await call(ownerCookie, 'toggleCheck', { habitId })).body.data as {
      habits: { checkedToday: boolean; streak: number }[];
    };
    expect(again.habits[0]?.checkedToday).toBe(false);
    expect(again.habits[0]?.streak).toBe(0);

    const third = (await call(ownerCookie, 'toggleCheck', { habitId })).body.data as {
      habits: { checkedToday: boolean }[];
    };
    expect(third.habits[0]?.checkedToday).toBe(true);
  });

  it('归档 → 从活跃列表消失进入归档区，恢复后回来且今日打卡态保留', async () => {
    const before = await snapshot(ownerCookie);
    const habitId = before.habits[0]?.id ?? '';
    const archived = (await call(ownerCookie, 'archiveHabit', { habitId })).body.data as {
      habits: unknown[];
      archived: { id: string }[];
      totalToday: number;
    };
    expect(archived.habits).toHaveLength(0);
    expect(archived.archived.map((h) => h.id)).toContain(habitId);
    expect(archived.totalToday).toBe(0);

    const restored = (await call(ownerCookie, 'restoreHabit', { habitId })).body.data as {
      habits: { id: string; checkedToday: boolean }[];
      archived: unknown[];
    };
    expect(restored.habits.map((h) => h.id)).toContain(habitId);
    expect(restored.habits.find((h) => h.id === habitId)?.checkedToday).toBe(true);
    expect(restored.archived).toHaveLength(0);
  });

  it('第二个习惯排序在后，创建非法输入被拒', async () => {
    expect((await call(ownerCookie, 'createHabit', { name: '' })).status).toBe(400);
    expect((await call(ownerCookie, 'createHabit', { name: 'x'.repeat(41) })).status).toBe(400);
    const snap = await snapshot(ownerCookie);
    const result = await call(ownerCookie, 'createHabit', { name: '喝水 8 杯', icon: '💧' });
    expect(result.status).toBe(200);
    const after = result.body.data as { habits: { name: string }[] };
    expect(after.habits.map((h) => h.name)).toEqual([
      ...snap.habits.map((h) => h.name),
      '喝水 8 杯',
    ]);
  });

  it('guest 只读：写操作被拒，snapshot 可读', async () => {
    const snap = await snapshot(guestCookie);
    expect(snap.totalToday).toBe(2);
    const denied = await call(guestCookie, 'toggleCheck', { habitId: snap.habits[0]?.id ?? '' });
    expect(denied.status).toBe(403);
  });

  it('租户隔离：外人无法读写他工作区习惯，习惯 ID 越权 404/400', async () => {
    await apiFetch(app.url, '/workspaces', {
      method: 'POST',
      cookie: outsiderCookie,
      body: { name: '外人空间', slug: 'outsider-space' },
    });
    await apiFetch(app.url, '/modules/workspaces/outsider-space/habits/enable', {
      method: 'POST',
      cookie: outsiderCookie,
    });
    const outsiderSnap = await snapshot(outsiderCookie, 'outsider-space');
    expect(outsiderSnap.totalToday).toBe(0);

    // 外人拿到自己空间的空快照，尝试操作他人 habitId 被拒
    const ownerSnap = await snapshot(ownerCookie);
    const cross = await call(outsiderCookie, 'toggleCheck', {
      habitId: ownerSnap.habits[0]?.id ?? '',
    });
    expect([400, 404]).toContain(cross.status);
  });
});
