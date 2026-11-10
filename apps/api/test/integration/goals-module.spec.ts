import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiFetch, createTestApp, login, register, type TestApp } from './app-fixture';

/**
 * 目标与年度计划模块集成测试：覆盖 snapshot 结构、目标创建/更新/归档/恢复、
 * 数值型与达成型关键结果的进度语义（含反向目标）、软删除、
 * guest 只读、租户隔离、周期边界自动计算。
 */

let app: TestApp;
let ownerCookie: string;
let guestCookie: string;
let outsiderCookie: string;

const call = (cookie: string, action: string, body?: unknown, slug = 'goal-team') =>
  apiFetch(app.url, `/modules/workspaces/${slug}/goals/call/${action}`, {
    method: 'POST',
    cookie,
    body,
  });

interface KrView {
  id: string;
  objectiveId: string;
  title: string;
  type: 'number' | 'boolean';
  startValue: number;
  targetValue: number;
  currentValue: number;
  unit: string | null;
  done: boolean;
  progress: number;
}

interface ObjectiveView {
  id: string;
  title: string;
  icon: string;
  period: string;
  startDate: string;
  endDate: string;
  keyResults: KrView[];
  progress: number;
  achieved: boolean;
}

const snapshot = async (cookie: string, slug = 'goal-team') =>
  (await call(cookie, 'snapshot', {}, slug)).body.data as {
    objectives: ObjectiveView[];
    archived: { id: string; title: string; icon: string }[];
    summary: {
      activeCount: number;
      achievedCount: number;
      avgProgress: number;
      keyResultTotal: number;
      keyResultDone: number;
    };
  };

beforeAll(async () => {
  app = await createTestApp();
  await register(app.url, 'goal-owner@example.com', '目标主');
  await register(app.url, 'goal-guest@example.com', '目标访客');
  await register(app.url, 'goal-outsider@example.com', '目标外人');
  ownerCookie = (await login(app.url, 'goal-owner@example.com')).cookie!;
  guestCookie = (await login(app.url, 'goal-guest@example.com')).cookie!;
  outsiderCookie = (await login(app.url, 'goal-outsider@example.com')).cookie!;

  await apiFetch(app.url, '/workspaces', {
    method: 'POST',
    cookie: ownerCookie,
    body: { name: '目标团队', slug: 'goal-team' },
  });
  const invite = await apiFetch(app.url, '/workspaces/goal-team/members/invite', {
    method: 'POST',
    cookie: ownerCookie,
    body: { email: 'goal-guest@example.com', role: 'guest' },
  });
  await apiFetch(app.url, '/auth/invitations/accept', {
    method: 'POST',
    cookie: guestCookie,
    body: { token: invite.body.data.token },
  });
  await apiFetch(app.url, '/modules/workspaces/goal-team/goals/enable', {
    method: 'POST',
    cookie: ownerCookie,
  });
});

afterAll(async () => {
  // goal.* 事件在 fixture 中不自动派发，主动排空避免挤占共享测试库的事件队列
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

describe('目标与年度计划模块', () => {
  it('新建目标（默认年度周期）→ 边界按今年自动计算，默认图标', async () => {
    const result = await call(ownerCookie, 'createObjective', { title: '2026 健康升级' });
    expect(result.status).toBe(200);
    const snap = result.body.data as { objectives: ObjectiveView[] };
    expect(snap.objectives).toHaveLength(1);
    const obj = snap.objectives[0]!;
    const year = new Date().getFullYear();
    expect(obj.title).toBe('2026 健康升级');
    expect(obj.period).toBe('year');
    expect(obj.startDate).toBe(`${year}-01-01`);
    expect(obj.endDate).toBe(`${year}-12-31`);
    expect(obj.icon).toBe('🎯');
    expect(obj.keyResults).toHaveLength(0);
    expect(obj.progress).toBe(0);
    expect(obj.achieved).toBe(false);
  });

  it('非法输入被拒：空标题 / custom 缺日期 / 起止倒置', async () => {
    expect((await call(ownerCookie, 'createObjective', { title: '' })).status).toBe(400);
    expect(
      (await call(ownerCookie, 'createObjective', { title: '自定义周期', period: 'custom' }))
        .status,
    ).toBe(400);
    expect(
      (
        await call(ownerCookie, 'createObjective', {
          title: '起止倒置',
          period: 'custom',
          startDate: '2026-12-31',
          endDate: '2026-01-01',
        })
      ).status,
    ).toBe(400);
  });

  it('数值型关键结果：反向目标（75 → 70）进度双向夹取，达成/回落维护 done', async () => {
    const before = await snapshot(ownerCookie);
    const objectiveId = before.objectives[0]!.id;
    const created = await call(ownerCookie, 'createKeyResult', {
      objectiveId,
      title: '体重降到 70kg',
      type: 'number',
      startValue: 75,
      targetValue: 70,
      unit: 'kg',
    });
    expect(created.status).toBe(200);
    let kr = (created.body.data as { objectives: ObjectiveView[] }).objectives[0]!.keyResults[0]!;
    expect(kr.currentValue).toBe(75);
    expect(kr.progress).toBe(0);
    expect(kr.done).toBe(false);

    const half = await call(ownerCookie, 'updateKeyResultProgress', {
      keyResultId: kr.id,
      currentValue: 72.5,
    });
    kr = (half.body.data as { objectives: ObjectiveView[] }).objectives[0]!.keyResults[0]!;
    expect(kr.progress).toBeCloseTo(0.5, 5);

    const reached = await call(ownerCookie, 'updateKeyResultProgress', {
      keyResultId: kr.id,
      currentValue: 70,
    });
    kr = (reached.body.data as { objectives: ObjectiveView[] }).objectives[0]!.keyResults[0]!;
    expect(kr.progress).toBe(1);
    expect(kr.done).toBe(true);

    // 回升（越过目标）→ 未达成；超出起点 → 夹取为 0
    const back = await call(ownerCookie, 'updateKeyResultProgress', {
      keyResultId: kr.id,
      currentValue: 76,
    });
    kr = (back.body.data as { objectives: ObjectiveView[] }).objectives[0]!.keyResults[0]!;
    expect(kr.progress).toBe(0);
    expect(kr.done).toBe(false);
  });

  it('达成型关键结果：done 切换；目标进度为各 KR 平均，全部达成 → achieved', async () => {
    const before = await snapshot(ownerCookie);
    const objectiveId = before.objectives[0]!.id;
    const created = await call(ownerCookie, 'createKeyResult', {
      objectiveId,
      title: '完成一次体检',
      type: 'boolean',
    });
    expect(created.status).toBe(200);
    let obj = (created.body.data as { objectives: ObjectiveView[] }).objectives[0]!;
    expect(obj.keyResults).toHaveLength(2);
    // 数值型回到 75（progress 0）+ 达成型未完成 → 平均 0
    expect(obj.progress).toBe(0);

    const marked = await call(ownerCookie, 'updateKeyResultProgress', {
      keyResultId: obj.keyResults.find((item) => item.type === 'boolean')!.id,
      done: true,
    });
    obj = (marked.body.data as { objectives: ObjectiveView[] }).objectives[0]!;
    expect(obj.keyResults.find((item) => item.type === 'boolean')!.progress).toBe(1);
    expect(obj.progress).toBeCloseTo(0.5, 5);
    expect(obj.achieved).toBe(false);

    const numKr = obj.keyResults.find((item) => item.type === 'number')!;
    const all = await call(ownerCookie, 'updateKeyResultProgress', {
      keyResultId: numKr.id,
      currentValue: 70,
    });
    obj = (all.body.data as { objectives: ObjectiveView[] }).objectives[0]!;
    expect(obj.progress).toBe(1);
    expect(obj.achieved).toBe(true);
    const snap = await snapshot(ownerCookie);
    expect(snap.summary.activeCount).toBe(1);
    expect(snap.summary.achievedCount).toBe(1);
    expect(snap.summary.keyResultTotal).toBe(2);
    expect(snap.summary.keyResultDone).toBe(2);
  });

  it('改目标标题与图标生效；数值型 KR 起点=目标被拒', async () => {
    const before = await snapshot(ownerCookie);
    const objectiveId = before.objectives[0]!.id;
    const updated = await call(ownerCookie, 'updateObjective', {
      objectiveId,
      title: '2026 身体重塑',
      icon: '💪',
    });
    expect(updated.status).toBe(200);
    const obj = (updated.body.data as { objectives: ObjectiveView[] }).objectives[0]!;
    expect(obj.title).toBe('2026 身体重塑');
    expect(obj.icon).toBe('💪');

    expect(
      (
        await call(ownerCookie, 'createKeyResult', {
          objectiveId,
          title: '非法数值型',
          type: 'number',
          startValue: 5,
          targetValue: 5,
        })
      ).status,
    ).toBe(400);
  });

  it('删除关键结果（软删）→ 快照消失，目标进度重算', async () => {
    const before = await snapshot(ownerCookie);
    const obj = before.objectives[0]!;
    const numKr = obj.keyResults.find((item) => item.type === 'number')!;
    const removed = await call(ownerCookie, 'deleteKeyResult', { keyResultId: numKr.id });
    expect(removed.status).toBe(200);
    const after = (removed.body.data as { objectives: ObjectiveView[] }).objectives[0]!;
    expect(after.keyResults).toHaveLength(1);
    expect(after.keyResults[0]!.type).toBe('boolean');
    expect(after.progress).toBe(1);
    expect(after.achieved).toBe(true);
  });

  it('归档 → 进入归档区；恢复 → 关键结果保留', async () => {
    const before = await snapshot(ownerCookie);
    const objectiveId = before.objectives[0]!.id;
    const archived = await call(ownerCookie, 'archiveObjective', { objectiveId });
    expect(archived.status).toBe(200);
    let snap = archived.body.data as Awaited<ReturnType<typeof snapshot>>;
    expect(snap.objectives).toHaveLength(0);
    expect(snap.archived.map((item) => item.id)).toContain(objectiveId);
    expect(snap.summary.activeCount).toBe(0);

    const restored = await call(ownerCookie, 'restoreObjective', { objectiveId });
    snap = restored.body.data as Awaited<ReturnType<typeof snapshot>>;
    expect(snap.objectives).toHaveLength(1);
    expect(snap.archived).toHaveLength(0);
    expect(snap.objectives[0]!.keyResults).toHaveLength(1);
  });

  it('guest 只读：写操作被拒，snapshot 可读', async () => {
    const snap = await snapshot(guestCookie);
    expect(snap.objectives).toHaveLength(1);
    const denied = await call(guestCookie, 'createObjective', { title: '访客目标' });
    expect(denied.status).toBe(403);
  });

  it('租户隔离：外人无法读写他工作区目标，跨租户 ID 被拒', async () => {
    await apiFetch(app.url, '/workspaces', {
      method: 'POST',
      cookie: outsiderCookie,
      body: { name: '外人空间', slug: 'outsider-goal-space' },
    });
    await apiFetch(app.url, '/modules/workspaces/outsider-goal-space/goals/enable', {
      method: 'POST',
      cookie: outsiderCookie,
    });
    const outsiderSnap = await snapshot(outsiderCookie, 'outsider-goal-space');
    expect(outsiderSnap.objectives).toHaveLength(0);

    const ownerSnap = await snapshot(ownerCookie);
    const cross = await call(outsiderCookie, 'archiveObjective', {
      objectiveId: ownerSnap.objectives[0]!.id,
    });
    expect([400, 404]).toContain(cross.status);
  });
});
