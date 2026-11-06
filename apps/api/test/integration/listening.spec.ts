import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createManagedDb } from '../../src/db/client';
import { apiFetch, createTestApp, login, register, type TestApp } from './app-fixture';

/**
 * 听歌时长集成测试：心跳累加、日/周/月/年汇总分桶、工作空间排名、guest 权限。
 * 历史日期的行以管理员直连测试库插入（绕过 RLS 仅限测试夹具）。
 */

let app: TestApp;
let ownerCookie: string;
let memberCookie: string;

const call = (cookie: string, action: string, body?: unknown) =>
  apiFetch(app.url, `/modules/workspaces/listen-team/dashboard/call/${action}`, {
    method: 'POST',
    cookie,
    body,
  });

const localDay = (offsetDays = 0): string => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

beforeAll(async () => {
  process.env.ATLAS_DASHBOARD_FAKE = '1';
  app = await createTestApp();
  await register(app.url, 'listen-owner@example.com', '听歌甲');
  await register(app.url, 'listen-member@example.com', '听歌乙');
  ownerCookie = (await login(app.url, 'listen-owner@example.com')).cookie!;
  memberCookie = (await login(app.url, 'listen-member@example.com')).cookie!;

  await apiFetch(app.url, '/workspaces', {
    method: 'POST',
    cookie: ownerCookie,
    body: { name: '听歌空间', slug: 'listen-team' },
  });
  const invite = await apiFetch(app.url, '/workspaces/listen-team/members/invite', {
    method: 'POST',
    cookie: ownerCookie,
    body: { email: 'listen-member@example.com', role: 'member' },
  });
  await apiFetch(app.url, '/auth/invitations/accept', {
    method: 'POST',
    cookie: memberCookie,
    body: { token: invite.body.data.token },
  });
  await apiFetch(app.url, '/modules/workspaces/listen-team/dashboard/enable', {
    method: 'POST',
    cookie: ownerCookie,
  });
});

afterAll(async () => {
  delete process.env.ATLAS_DASHBOARD_FAKE;
  await app.close();
});

describe('听歌时长统计', () => {
  it('心跳累加：同一首歌两次上报合并（seconds 累计、first 记一次播放）', async () => {
    const first = await call(ownerCookie, 'listeningHeartbeat', {
      songId: 569200213,
      title: '消愁',
      artist: '毛不易',
      seconds: 30,
      first: true,
    });
    expect(first.status).toBe(200);
    const second = await call(ownerCookie, 'listeningHeartbeat', {
      songId: 569200213,
      title: '消愁',
      artist: '毛不易',
      seconds: 20,
    });
    expect(second.status).toBe(200);

    const summary = await call(ownerCookie, 'listeningSummary', { range: 'day' });
    expect(summary.status).toBe(200);
    expect(summary.body.data.totalSeconds).toBe(50);
    expect(summary.body.data.totalPlays).toBe(1);
    expect(summary.body.data.topSongs[0]).toMatchObject({
      songId: 569200213,
      title: '消愁',
      seconds: 50,
    });
    // day 桶只有今天一格
    expect(summary.body.data.buckets).toHaveLength(1);
    expect(summary.body.data.buckets[0].seconds).toBe(50);
  });

  it('非法心跳被 400 拒绝（负数/超上限秒数）', async () => {
    const bad = await call(ownerCookie, 'listeningHeartbeat', {
      songId: 1,
      title: 'x',
      artist: '',
      seconds: 999,
    });
    expect(bad.status).toBe(400);
  });

  it('week 汇总：7 个连续日桶，今天有值；历史日期行（管理员直插）计入 month/year', async () => {
    const admin = createManagedDb('postgres://atlas:atlas@localhost:5433/atlas');
    const ids = await admin.db.execute(
      sql`select u.id as user_id, w.id as ws_id from platform."user" u, platform.workspace w
          where u.email = 'listen-owner@example.com' and w.slug = 'listen-team'`,
    );
    const row = (ids.rows as Array<{ user_id: string; ws_id: string }>)[0]!;
    expect(row).toBeTruthy();
    // 昨天 90s（周内）、35 天前 600s（月外年内的上月）
    await admin.db.execute(sql`
      insert into "modules.dashboard"."listening_daily"
        (workspace_id, user_id, user_name, day, song_id, song_title, song_artist, seconds, plays)
      values
        (${row.ws_id}, ${row.user_id}, '听歌甲', ${localDay(-1)}, 31445772, '理想三旬', '陈鸿宇', 90, 1),
        (${row.ws_id}, ${row.user_id}, '听歌甲', ${localDay(-35)}, 31445772, '理想三旬', '陈鸿宇', 600, 1)
    `);
    await admin.end();

    const week = await call(ownerCookie, 'listeningSummary', { range: 'week' });
    expect(week.body.data.totalSeconds).toBe(140);
    expect(week.body.data.buckets).toHaveLength(7);
    expect(week.body.data.buckets.at(-1)?.seconds).toBe(50);

    const month = await call(ownerCookie, 'listeningSummary', { range: 'month' });
    // 昨天(90) 在近 30 天内；35 天前(600) 不在
    expect(month.body.data.totalSeconds).toBe(140);

    const year = await call(ownerCookie, 'listeningSummary', { range: 'year' });
    expect(year.body.data.totalSeconds).toBe(740);
    expect(year.body.data.buckets).toHaveLength(12);
    expect(year.body.data.buckets.at(-1)?.seconds).toBe(140);
  });

  it('排名：工作空间成员按秒数排序，me 指向调用者；guest 可读但不可写心跳', async () => {
    const memberBeat = await call(memberCookie, 'listeningHeartbeat', {
      songId: 28188427,
      title: '棠梨煎雪',
      artist: '银临',
      seconds: 10,
      first: true,
    });
    // member 角色 member+ 可写
    expect(memberBeat.status).toBe(200);

    const ranking = await call(memberCookie, 'listeningRanking', { range: 'day' });
    expect(ranking.status).toBe(200);
    const list = ranking.body.data.list;
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list[0].seconds).toBeGreaterThanOrEqual(list[1].seconds);
    expect(ranking.body.data.me.userName).toBe('听歌乙');
    expect(ranking.body.data.me.rank).toBeGreaterThanOrEqual(2);

    const guestRegister = await register(app.url, 'listen-guest@example.com', '听歌客');
    expect(guestRegister.status).toBe(201);
    const guestCookie = (await login(app.url, 'listen-guest@example.com')).cookie!;
    const invite = await apiFetch(app.url, '/workspaces/listen-team/members/invite', {
      method: 'POST',
      cookie: ownerCookie,
      body: { email: 'listen-guest@example.com', role: 'guest' },
    });
    await apiFetch(app.url, '/auth/invitations/accept', {
      method: 'POST',
      cookie: guestCookie,
      body: { token: invite.body.data.token },
    });
    const guestRead = await call(guestCookie, 'listeningRanking', { range: 'day' });
    expect(guestRead.status).toBe(200);
    const guestWrite = await call(guestCookie, 'listeningHeartbeat', {
      songId: 1,
      title: 'x',
      artist: '',
      seconds: 5,
    });
    expect(guestWrite.status).toBe(403);
  });
});
