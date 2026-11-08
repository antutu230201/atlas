import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createManagedDb } from '../../src/db/client';
import { apiFetch, createTestApp, login, register, type TestApp } from './app-fixture';

/**
 * 个人大屏模块集成测试：ATLAS_DASHBOARD_FAKE=1 注入假数据源（不依赖外网）。
 * 覆盖：snapshot 结构、设置（城市/开关）、倒计时 CRUD+软删恢复、guest 只读、租户隔离、事件落库、缓存复用。
 */

let app: TestApp;
let ownerCookie: string;
let guestCookie: string;
let outsiderCookie: string;

const call = (cookie: string, action: string, body?: unknown, slug = 'dash-team') =>
  apiFetch(app.url, `/modules/workspaces/${slug}/dashboard/call/${action}`, {
    method: 'POST',
    cookie,
    body,
  });

beforeAll(async () => {
  process.env.ATLAS_DASHBOARD_FAKE = '1';
  app = await createTestApp();
  await register(app.url, 'dash-owner@example.com', '大屏主');
  await register(app.url, 'dash-guest@example.com', '大屏访客');
  await register(app.url, 'dash-outsider@example.com', '大屏外人');
  ownerCookie = (await login(app.url, 'dash-owner@example.com')).cookie!;
  guestCookie = (await login(app.url, 'dash-guest@example.com')).cookie!;
  outsiderCookie = (await login(app.url, 'dash-outsider@example.com')).cookie!;

  await apiFetch(app.url, '/workspaces', {
    method: 'POST',
    cookie: ownerCookie,
    body: { name: '大屏团队', slug: 'dash-team' },
  });
  const invite = await apiFetch(app.url, '/workspaces/dash-team/members/invite', {
    method: 'POST',
    cookie: ownerCookie,
    body: { email: 'dash-guest@example.com', role: 'guest' },
  });
  await apiFetch(app.url, '/auth/invitations/accept', {
    method: 'POST',
    cookie: guestCookie,
    body: { token: invite.body.data.token },
  });
  await apiFetch(app.url, '/modules/workspaces/dash-team/dashboard/enable', {
    method: 'POST',
    cookie: ownerCookie,
  });
});

afterAll(async () => {
  delete process.env.ATLAS_DASHBOARD_FAKE;
  // 本 spec 发布的事件（countdown.* / module.enabled 等）从未被派发（fixture 关闭自动派发），
  // 会滞留在共享测试库的 platform.event 队列里，挤占后续 spec（module-events）的派发批次
  // （单次 claim 上限 20）。此处主动排空，保持事件队列测试前后等效。
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

describe('个人大屏模块', () => {
  it('snapshot：假数据源全量返回（热榜×3 + 天气 empty + 一言 + 壁纸 + 倒计时）', async () => {
    const res = await call(ownerCookie, 'snapshot');
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(Object.keys(data.hot)).toHaveLength(3);
    expect(data.hot.weibo.status).toBe('fresh');
    expect(data.hot.weibo.payload).toHaveLength(12);
    expect(data.hot.weibo.payload[0].title).toContain('微博');
    expect(data.quote.payload.text.length).toBeGreaterThan(0);
    expect(data.weather.status).toBe('empty'); // 未设置城市
    expect(data.wallpaper.status).toBe('fresh'); // 假壁纸 url 为空串，但信封正常
    expect(data.options.sources).toEqual({
      weibo: true,
      douyin: true,
      bilibili: true,
    });
    // 未配置关注词时返回空数组，前端据此跳过高亮
    expect(data.options.watchWords).toEqual([]);
    expect(data.countdowns).toEqual([]);
  });

  it('设置城市后 snapshot 天气变 fresh；searchCity/detectLocation 走假数据', async () => {
    const search = await call(ownerCookie, 'searchCity', { q: '杭州' });
    expect(search.status).toBe(200);
    expect(search.body.data.cities[0].name).toBe('杭州');

    const detect = await call(ownerCookie, 'detectLocation');
    expect(detect.status).toBe(200);
    expect(detect.body.data.location.city).toBe('杭州');

    const setCity = await call(ownerCookie, 'setCity', { name: '杭州', lat: 30.29, lon: 120.16 });
    expect(setCity.status).toBe(200);

    const res = await call(ownerCookie, 'snapshot');
    expect(res.body.data.weather.status).toBe('fresh');
    expect(res.body.data.weather.payload.now.text).toBe('晴间多云');
    expect(res.body.data.weather.payload.days).toHaveLength(5);
    expect(res.body.data.city).toEqual({ name: '杭州', lat: 30.29, lon: 120.16 });
  });

  it('数据源开关：关闭 douyin 后 snapshot 不含该键', async () => {
    const off = await call(ownerCookie, 'setOptions', { sources: { douyin: false } });
    expect(off.status).toBe(200);
    expect(off.body.data.sources.douyin).toBe(false);

    const res = await call(ownerCookie, 'snapshot');
    expect(res.body.data.hot.douyin).toBeUndefined();
    expect(res.body.data.hot.weibo).toBeDefined();

    await call(ownerCookie, 'setOptions', { sources: { douyin: true } });
  });

  it('关注词：保存时去空白去重，snapshot 原样返回', async () => {
    const saved = await call(ownerCookie, 'setOptions', {
      watchWords: ['  AI ', 'AI', '英雄联盟', '', '   '],
    });
    expect(saved.status).toBe(200);
    // 空串与纯空白被丢弃，重复项只保留一个
    expect(saved.body.data.watchWords).toEqual(['AI', '英雄联盟']);

    const res = await call(ownerCookie, 'snapshot');
    expect(res.body.data.options.watchWords).toEqual(['AI', '英雄联盟']);

    await call(ownerCookie, 'setOptions', { watchWords: [] });
  });

  it('倒计时全流程：创建→置顶→软删→回收站→恢复', async () => {
    const created = await call(ownerCookie, 'createCountdown', {
      title: '生日',
      targetDate: '2030-01-01',
    });
    expect(created.status).toBe(200);
    const id = created.body.data.id;

    const pinned = await call(ownerCookie, 'updateCountdown', { id, pinned: true });
    expect(pinned.status).toBe(200);

    const snapshot1 = await call(ownerCookie, 'snapshot');
    expect(snapshot1.body.data.countdowns).toHaveLength(1);
    expect(snapshot1.body.data.countdowns[0].pinned).toBe(true);

    const removed = await call(ownerCookie, 'deleteCountdown', { id });
    expect(removed.status).toBe(200);
    const afterDelete = await call(ownerCookie, 'snapshot');
    expect(afterDelete.body.data.countdowns).toHaveLength(0);

    const trash = await call(ownerCookie, 'listCountdowns', { includeDeleted: true });
    expect(trash.body.data.countdowns).toHaveLength(1);

    const restored = await call(ownerCookie, 'restoreCountdown', { id });
    expect(restored.status).toBe(200);
    const afterRestore = await call(ownerCookie, 'snapshot');
    expect(afterRestore.body.data.countdowns).toHaveLength(1);
  });

  it('农历倒计时：创建换算为公历 + 过期循环项自动顺推', async () => {
    // 农历纪念日：label 描述农历月日，targetDate 是未来最近一次的公历日期
    const lunarCreated = await call(ownerCookie, 'createCountdown', {
      title: '奶奶生日',
      lunar: true,
      lunarMonth: 8,
      lunarDay: 15,
    });
    expect(lunarCreated.status).toBe(200);
    const lunarView = await call(ownerCookie, 'snapshot');
    const lunarRow = lunarView.body.data.countdowns.find(
      (c: { title: string }) => c.title === '奶奶生日',
    );
    expect(lunarRow.lunar).toBe(true);
    expect(lunarRow.lunarLabel).toBe('农历8月十五');
    expect(lunarRow.targetDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(lunarRow.targetDate >= new Date().toISOString().slice(0, 10)).toBe(true);

    // 每年循环的公历项：造一条已过期数据，snapshot 应顺推到下一年同月日
    const pastYear = new Date().getFullYear() - 1;
    const stale = await call(ownerCookie, 'createCountdown', {
      title: '跨年',
      targetDate: `${pastYear}-12-31`,
      repeatYearly: true,
    });
    expect(stale.status).toBe(200);
    const staleView = await call(ownerCookie, 'snapshot');
    const staleRow = staleView.body.data.countdowns.find(
      (c: { title: string }) => c.title === '跨年',
    );
    expect(staleRow.targetDate).toBe(`${pastYear + 1}-12-31`);

    // 清理，避免影响其他用例的计数断言
    await call(ownerCookie, 'deleteCountdown', { id: lunarCreated.body.data.id });
    await call(ownerCookie, 'deleteCountdown', { id: stale.body.data.id });
  });

  it('农历闰月纪念日：接受闰月并落在下一个闰年', async () => {
    const created = await call(ownerCookie, 'createCountdown', {
      title: '闰月生日',
      lunar: true,
      lunarMonth: -6,
      lunarDay: 5,
    });
    expect(created.status).toBe(200);
    const view = await call(ownerCookie, 'snapshot');
    const row = view.body.data.countdowns.find((c: { title: string }) => c.title === '闰月生日');
    expect(row.lunarLabel).toContain('闰6月');
    expect(row.targetDate >= new Date().toISOString().slice(0, 10)).toBe(true);
    await call(ownerCookie, 'deleteCountdown', { id: created.body.data.id });
  });

  it('删除事件落 outbox（dashboard.countdown.deleted）', async () => {
    const created = await call(ownerCookie, 'createCountdown', {
      title: '待删',
      targetDate: '2031-06-01',
    });
    await call(ownerCookie, 'deleteCountdown', { id: created.body.data.id });

    const admin = createManagedDb('postgres://atlas:atlas@localhost:5433/atlas');
    try {
      const events = await admin.db.execute(
        sql`select name from platform.event where name = 'dashboard.countdown.deleted' order by created_at desc limit 1`,
      );
      expect(events.rows).toHaveLength(1);
    } finally {
      await admin.end();
    }
  });

  it('guest 只读：snapshot 200；setCity / createCountdown / refresh 403', async () => {
    expect((await call(guestCookie, 'snapshot')).status).toBe(200);
    expect((await call(guestCookie, 'setCity', { name: 'x', lat: 0, lon: 0 })).status).toBe(403);
    expect(
      (await call(guestCookie, 'createCountdown', { title: 'x', targetDate: '2030-01-01' })).status,
    ).toBe(403);
    expect((await call(guestCookie, 'refresh')).status).toBe(403);
  });

  it('输入校验：非法日期 / 未知源 / 空 q → 400', async () => {
    expect(
      (await call(ownerCookie, 'createCountdown', { title: 'x', targetDate: '2030/01/01' })).status,
    ).toBe(400);
    expect((await call(ownerCookie, 'setOptions', { sources: { hacker: true } })).status).toBe(400);
    expect((await call(ownerCookie, 'searchCity', { q: '' })).status).toBe(400);
    expect((await call(ownerCookie, 'setCity', { name: '', lat: 200, lon: 0 })).status).toBe(400);
  });

  it('租户隔离：局外人空间的数据与缓存互不可见', async () => {
    await apiFetch(app.url, '/workspaces', {
      method: 'POST',
      cookie: outsiderCookie,
      body: { name: '大屏局外', slug: 'dash-out' },
    });
    await apiFetch(app.url, '/modules/workspaces/dash-out/dashboard/enable', {
      method: 'POST',
      cookie: outsiderCookie,
    });

    await call(
      outsiderCookie,
      'createCountdown',
      { title: '局外纪念日', targetDate: '2030-05-05' },
      'dash-out',
    );
    await call(outsiderCookie, 'setCity', { name: '北京', lat: 39.9, lon: 116.4 }, 'dash-out');

    const ownerSnap = await call(ownerCookie, 'snapshot');
    const ownerTitles = ownerSnap.body.data.countdowns.map((c: { title: string }) => c.title);
    expect(ownerTitles).toContain('生日');
    expect(ownerTitles).not.toContain('局外纪念日');
    expect(ownerSnap.body.data.city.name).toBe('杭州'); // 局外设置的北京不影响主空间

    const outSnap = await call(outsiderCookie, 'snapshot', undefined, 'dash-out');
    expect(outSnap.body.data.city.name).toBe('北京');
    expect(outSnap.body.data.countdowns.map((c: { title: string }) => c.title)).toEqual([
      '局外纪念日',
    ]);
  });

  it('缓存表落库且 workspace 隔离（直连库冒烟 + RLS 兜底）', async () => {
    const admin = createManagedDb('postgres://atlas:atlas@localhost:5433/atlas');
    try {
      const rows = await admin.db.execute(
        sql`select workspace_id, source_key from "modules.dashboard".source_cache`,
      );
      const keys = rows.rows.map((r) => (r as { source_key: string }).source_key);
      expect(keys).toContain('hot:weibo');
      expect(keys).toContain('quote');
      expect(keys.some((k) => k.startsWith('weather:'))).toBe(true);
    } finally {
      await admin.end();
    }
  });
});
